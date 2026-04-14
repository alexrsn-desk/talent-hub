import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Upload, FileText, ArrowRight, ArrowLeft, Check, AlertTriangle,
  Download, Loader2, Users, Building2, Briefcase, Shield, Database,
  Sparkles, Link2, X, Square, CheckSquare, ClipboardList,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RecordType, FIELD_MAP, PLATFORM_OPTIONS, BUILT_IN_TEMPLATES,
  parseCSV, autoMapHeaders, buildRecord, runImportForType, downloadExampleCSV,
  downloadErrorReport, ImportResult,
} from "@/lib/csv-import";

type Step = "choice" | "select-types" | "upload" | "mapping" | "preview" | "importing" | "complete" | "post-import" | "link-jobs";

interface FileData {
  headers: string[];
  rows: string[][];
  mapping: Record<string, string>;
  platform: string;
}

interface TypeResults {
  candidates?: ImportResult & { unmatchedJobs: { id: string; title: string }[] };
  clients?: ImportResult & { unmatchedJobs: { id: string; title: string }[] };
  jobs?: ImportResult & { unmatchedJobs: { id: string; title: string }[] };
}

export function OnboardingImport({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("choice");
  const [enabledTypes, setEnabledTypes] = useState<Record<RecordType, boolean>>({
    candidates: true, clients: true, jobs: true,
  });
  const [files, setFiles] = useState<Record<RecordType, FileData | null>>({
    candidates: null, clients: null, jobs: null,
  });
  const [activeType, setActiveType] = useState<RecordType>("candidates");
  const [results, setResults] = useState<TypeResults>({});
  const [progressLabel, setProgressLabel] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [unmatchedJobs, setUnmatchedJobs] = useState<{ id: string; title: string }[]>([]);
  const [jobClientLinks, setJobClientLinks] = useState<Record<string, string>>({});
  const [allClients, setAllClients] = useState<{ id: string; company_name: string }[]>([]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const enabledList = (Object.keys(enabledTypes) as RecordType[]).filter(t => enabledTypes[t]);

  const toggleType = (t: RecordType) => setEnabledTypes(prev => ({ ...prev, [t]: !prev[t] }));

  const handleFileUpload = (type: RecordType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) { toast.error("Please upload a CSV file"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0) { toast.error("CSV appears empty"); return; }
      const fields = FIELD_MAP[type];
      const platform = files[type]?.platform || "generic";
      const mapping = autoMapHeaders(headers, fields, platform);
      setFiles(prev => ({ ...prev, [type]: { headers, rows, mapping, platform } }));
      toast.success(`${type} CSV loaded — ${rows.length} rows`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const setPlatform = (type: RecordType, platform: string) => {
    setFiles(prev => {
      const existing = prev[type];
      if (existing) {
        const fields = FIELD_MAP[type];
        const mapping = autoMapHeaders(existing.headers, fields, platform);
        return { ...prev, [type]: { ...existing, platform, mapping } };
      }
      return { ...prev, [type]: { headers: [], rows: [], mapping: {}, platform } };
    });
  };

  const updateMapping = (type: RecordType, csvHeader: string, fieldKey: string) => {
    setFiles(prev => {
      const f = prev[type];
      if (!f) return prev;
      return { ...prev, [type]: { ...f, mapping: { ...f.mapping, [csvHeader]: fieldKey } } };
    });
  };

  const allFilesUploaded = enabledList.every(t => files[t] && files[t]!.rows.length > 0);

  const allMappingsValid = enabledList.every(t => {
    const f = files[t];
    if (!f) return false;
    const fields = FIELD_MAP[t];
    return fields.filter(fd => fd.required).every(fd => Object.values(f.mapping).includes(fd.key));
  });

  const totalRows = enabledList.reduce((sum, t) => sum + (files[t]?.rows.length || 0), 0);

  const runAllImports = async () => {
    setStep("importing");
    const newResults: TypeResults = {};
    let processed = 0;
    const allUnmatched: { id: string; title: string }[] = [];

    // Import in order: clients first (for job linking), then candidates, then jobs
    const importOrder: RecordType[] = ["clients", "candidates", "jobs"].filter(t => enabledList.includes(t as RecordType)) as RecordType[];

    for (const type of importOrder) {
      const f = files[type];
      if (!f) continue;
      setProgressLabel(`Importing ${type}…`);
      const result = await runImportForType(type, f.rows, f.headers, f.mapping, "skip", (cur, tot) => {
        const pct = Math.round(((processed + cur) / totalRows) * 100);
        setProgressPct(pct);
        setProgressLabel(`Importing ${type}… ${cur} of ${tot}`);
      });
      processed += f.rows.length;
      newResults[type] = result;
      allUnmatched.push(...result.unmatchedJobs);
    }

    setResults(newResults);
    setUnmatchedJobs(allUnmatched);

    if (allUnmatched.length > 0) {
      const { data } = await supabase.from("clients").select("id, company_name").order("company_name");
      setAllClients(data || []);
    }

    setProgressPct(100);
    setStep("complete");
  };

  const linkJobs = async () => {
    let linked = 0;
    for (const [jobId, clientId] of Object.entries(jobClientLinks)) {
      if (!clientId) continue;
      const { error } = await supabase.from("jobs").update({ client_id: clientId }).eq("id", jobId);
      if (!error) linked++;
    }
    toast.success(`${linked} job(s) linked`);
    setUnmatchedJobs([]);
    setStep("complete");
  };

  const totalImported = (results.candidates?.imported || 0) + (results.clients?.imported || 0) + (results.jobs?.imported || 0);
  const totalSkipped = (results.candidates?.skipped || 0) + (results.clients?.skipped || 0) + (results.jobs?.skipped || 0);
  const totalErrors = (results.candidates?.errors.length || 0) + (results.clients?.errors.length || 0) + (results.jobs?.errors.length || 0);
  const estMinutes = Math.max(1, Math.ceil(totalRows / 200));

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">

        {/* Security notice */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          <Shield className="h-4 w-4 shrink-0" />
          Your CSV files are processed securely and permanently deleted immediately after import. We never store your raw files.
        </div>

        {/* ── Choice screen ──────────────────────────────────────── */}
        {step === "choice" && (
          <div className="text-center space-y-6 py-8">
            <Database className="h-12 w-12 mx-auto text-primary" />
            <div>
              <h1 className="text-2xl font-semibold">Want to bring your existing data across?</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                Import your candidates, clients and jobs in about 5 minutes. Your data is processed securely and CSV files are deleted immediately after import.
              </p>
            </div>
            <div className="space-y-3">
              <Button size="lg" className="w-full max-w-xs" onClick={() => setStep("select-types")}>
                <Upload className="h-5 w-5 mr-2" /> Bring my data across
              </Button>
              <div>
                <button
                  onClick={onComplete}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
                >
                  Start fresh, I'll add data manually
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 1: Choose what to import ───────────────────────── */}
        {step === "select-types" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">What would you like to import?</h2>
              <p className="text-sm text-muted-foreground mt-1">Toggle on the data types you want to bring across</p>
            </div>

            {([
              { type: "candidates" as const, icon: Users, label: "Candidates", desc: "The people you place", recommended: true },
              { type: "clients" as const, icon: Building2, label: "Clients", desc: "The companies you work with", recommended: true },
              { type: "jobs" as const, icon: Briefcase, label: "Jobs", desc: "Your open and historical vacancies", recommended: false },
            ]).map(({ type, icon: Icon, label, desc, recommended }) => (
              <Card
                key={type}
                className={`cursor-pointer transition-all ${enabledTypes[type] ? "border-primary bg-primary/5" : "opacity-60"}`}
                onClick={() => toggleType(type)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${enabledTypes[type] ? "bg-primary/10" : "bg-muted"}`}>
                    <Icon className={`h-5 w-5 ${enabledTypes[type] ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{label}</span>
                      {recommended && <span className="text-xs text-primary">Recommended</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${enabledTypes[type] ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                    {enabledTypes[type] && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("choice")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep("upload")} disabled={enabledList.length === 0}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Upload files ────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Upload your CSV files</h2>
              <p className="text-sm text-muted-foreground mt-1">One file per data type. First row should be column headers.</p>
            </div>

            {enabledList.map(type => {
              const Icon = type === "candidates" ? Users : type === "clients" ? Building2 : Briefcase;
              const f = files[type];
              return (
                <Card key={type} className={f ? "border-primary/50" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm capitalize">{type}</span>
                        {f && <span className="text-xs text-primary">✓ {f.rows.length} rows</span>}
                      </div>
                      <button
                        onClick={() => downloadExampleCSV(type)}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                      >
                        <Download className="h-3 w-3 inline mr-1" />Download example CSV
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <Select
                        value={f?.platform || "generic"}
                        onValueChange={val => setPlatform(type, val)}
                      >
                        <SelectTrigger className="w-52 text-xs">
                          <SelectValue placeholder="Where are you importing from?" />
                        </SelectTrigger>
                        <SelectContent>
                          {PLATFORM_OPTIONS.map(p => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {!f ? (
                      <div
                        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => fileRefs.current[type]?.click()}
                      >
                        <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Click or drag to upload CSV</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                        <span className="text-sm">{f.rows.length} rows, {f.headers.length} columns</span>
                        <Button variant="ghost" size="sm" onClick={() => setFiles(prev => ({ ...prev, [type]: null }))}>
                          <X className="h-3.5 w-3.5" /> Replace
                        </Button>
                      </div>
                    )}

                    <input
                      ref={el => { fileRefs.current[type] = el; }}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={e => handleFileUpload(type, e)}
                    />
                  </CardContent>
                </Card>
              );
            })}

            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("select-types")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep("mapping")} disabled={!allFilesUploaded}>
                Map columns <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2b: Column mapping ─────────────────────────────── */}
        {step === "mapping" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Match your columns</h2>
              <p className="text-sm text-muted-foreground mt-1">We've auto-mapped what we can. Adjust any that look wrong.</p>
            </div>

            {/* Tabs for each type */}
            <div className="flex gap-2">
              {enabledList.map(t => (
                <Button
                  key={t}
                  variant={activeType === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveType(t)}
                  className="capitalize"
                >
                  {t}
                </Button>
              ))}
            </div>

            {(() => {
              const f = files[activeType];
              if (!f) return null;
              const fields = FIELD_MAP[activeType];
              const requiredMapped = fields.filter(fd => fd.required).every(fd => Object.values(f.mapping).includes(fd.key));

              return (
                <div className="space-y-3">
                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {f.headers.map(h => (
                      <div key={h} className="flex items-center gap-3">
                        <div className="flex-1 text-sm font-mono truncate bg-muted/50 rounded px-2 py-1.5">{h}</div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Select
                          value={f.mapping[h] || "_skip"}
                          onValueChange={val => updateMapping(activeType, h, val)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_skip">— Skip —</SelectItem>
                            {fields.map(fd => (
                              <SelectItem key={fd.key} value={fd.key}>
                                {fd.label} {fd.required && "★"}
                              </SelectItem>
                            ))}
                            {activeType === "candidates" && (
                              <SelectItem value="_lastname">Last Name (merge)</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  {!requiredMapped && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Missing: {fields.filter(fd => fd.required && !Object.values(f.mapping).includes(fd.key)).map(fd => fd.label).join(", ")}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep("preview")} disabled={!allMappingsValid}>
                Preview <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ─────────────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Review before importing</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This should take about {estMinutes} minute{estMinutes > 1 ? "s" : ""} based on your data size.
              </p>
            </div>

            {enabledList.map(type => {
              const f = files[type];
              if (!f) return null;
              const fields = FIELD_MAP[type];
              const mappedFields = fields.filter(fd => Object.values(f.mapping).includes(fd.key));

              return (
                <Card key={type}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm capitalize">{f.rows.length} {type} ready to import</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            {mappedFields.map(fd => (
                              <th key={fd.key} className="text-left py-1.5 px-2 text-muted-foreground whitespace-nowrap">{fd.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {f.rows.slice(0, 5).map((row, i) => {
                            const rec = buildRecord(row, f.headers, f.mapping);
                            return (
                              <tr key={i} className="border-b border-border/30">
                                {mappedFields.map(fd => (
                                  <td key={fd.key} className="py-1 px-2 max-w-[150px] truncate">
                                    {rec[fd.key] ?? <span className="text-muted-foreground/40">—</span>}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("mapping")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Adjust mapping
              </Button>
              <Button size="lg" onClick={runAllImports}>
                <Sparkles className="h-4 w-4 mr-2" /> Import now
              </Button>
            </div>
          </div>
        )}

        {/* ── Importing progress ──────────────────────────────────── */}
        {step === "importing" && (
          <div className="py-12 space-y-6 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <div>
              <p className="font-medium">{progressLabel}</p>
              <p className="text-xs text-muted-foreground mt-1">Please don't close this window</p>
            </div>
            <Progress value={progressPct} className="max-w-sm mx-auto" />
          </div>
        )}

        {/* ── Complete ────────────────────────────────────────────── */}
        {step === "complete" && (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-2">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Import complete</h2>
              <p className="text-sm text-muted-foreground">Here's what we brought across:</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {results.candidates && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <Users className="h-5 w-5 mx-auto text-primary mb-1" />
                    <div className="text-2xl font-bold">{results.candidates.imported}</div>
                    <div className="text-xs text-muted-foreground">Candidates</div>
                  </CardContent>
                </Card>
              )}
              {results.clients && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <Building2 className="h-5 w-5 mx-auto text-primary mb-1" />
                    <div className="text-2xl font-bold">{results.clients.imported}</div>
                    <div className="text-xs text-muted-foreground">Clients</div>
                  </CardContent>
                </Card>
              )}
              {results.jobs && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <Briefcase className="h-5 w-5 mx-auto text-primary mb-1" />
                    <div className="text-2xl font-bold">{results.jobs.imported}</div>
                    <div className="text-xs text-muted-foreground">Jobs</div>
                  </CardContent>
                </Card>
              )}
            </div>

            {totalSkipped > 0 && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {totalSkipped} record{totalSkipped > 1 ? "s" : ""} skipped
                  {totalErrors > 0 && (
                    <button
                      onClick={() => {
                        const allErrors = [
                          ...(results.candidates?.errors || []),
                          ...(results.clients?.errors || []),
                          ...(results.jobs?.errors || []),
                        ];
                        downloadErrorReport(allErrors, "all");
                      }}
                      className="text-primary underline underline-offset-2 ml-1"
                    >
                      download error report
                    </button>
                  )}
                </p>
              </div>
            )}

            {unmatchedJobs.length > 0 && step === "complete" && (
              <Card className="border-primary/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{unmatchedJobs.length} jobs couldn't be matched to clients</span>
                  </div>
                  <Button size="sm" onClick={() => setStep("link-jobs")}>
                    Link them now <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-col items-center gap-3 pt-4">
              <Button size="lg" onClick={onComplete}>
                <Sparkles className="h-4 w-4 mr-2" /> Go to my dashboard
              </Button>
            </div>
          </div>
        )}

        {/* ── Link jobs ───────────────────────────────────────────── */}
        {step === "link-jobs" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Link jobs to clients</h2>
              <p className="text-sm text-muted-foreground mt-1">These jobs couldn't be automatically matched. Link them manually or skip for now.</p>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {unmatchedJobs.map(job => (
                <div key={job.id} className="flex items-center gap-3">
                  <span className="text-sm flex-1 truncate">{job.title}</span>
                  <Select
                    value={jobClientLinks[job.id] || ""}
                    onValueChange={val => setJobClientLinks(prev => ({ ...prev, [job.id]: val }))}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select client…" />
                    </SelectTrigger>
                    <SelectContent>
                      {allClients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("complete")}>
                I'll do this later
              </Button>
              <Button onClick={linkJobs}>
                <Check className="h-4 w-4 mr-1" /> Save links
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
