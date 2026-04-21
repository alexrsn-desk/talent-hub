import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Upload, FileText, ArrowRight, ArrowLeft, Check, AlertTriangle,
  Download, Loader2, Users, Building2, Briefcase, Shield, Save, Trash2,
  History, Undo2, Database, UserCircle2, Info,
} from "lucide-react";
import {
  RecordType, FIELD_MAP, BUILT_IN_TEMPLATES, MappingTemplate, NameReviewItem,
  PlatformKey, PLATFORMS, ArchiveOption,
  parseCSV, autoMapHeaders, buildRecord, runImportForType, splitFullName,
  downloadErrorReport as dlErrors, ImportResult,
  saveImportHistory, getImportHistory, undoLastImport,
} from "@/lib/csv-import";
import { PostImportChecklist } from "@/components/PostImportChecklist";

type Step = "select" | "platform" | "upload" | "mapping" | "options" | "preview" | "importing" | "results" | "history";

export function DataImport() {
  const [step, setStep] = useState<Step>("select");
  const [recordType, setRecordType] = useState<RecordType>("candidates");
  const [platform, setPlatform] = useState<PlatformKey | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateAction, setDuplicateAction] = useState<"update" | "skip">("update");
  const [archiveOption, setArchiveOption] = useState<ArchiveOption>("none");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [unmatchedJobs, setUnmatchedJobs] = useState<{ id: string; title: string }[]>([]);
  const [unlinkedContacts, setUnlinkedContacts] = useState<{ id: string; name: string; companyName: string }[]>([]);
  const [newClientsCreated, setNewClientsCreated] = useState(0);
  const [contactUnlinkedAction, setContactUnlinkedAction] = useState<"create_client" | "skip" | "import_unlinked">("import_unlinked");
  const [nameReviewItems, setNameReviewItems] = useState<NameReviewItem[]>([]);
  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [undoing, setUndoing] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<MappingTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem("csv_import_templates") || "[]"); } catch { return []; }
  });
  const [templateName, setTemplateName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const fields = FIELD_MAP[recordType];
  const selectedPlatform = PLATFORMS.find(p => p.value === platform);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) { toast.error("Please upload a CSV file"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);
      if (h.length === 0) { toast.error("CSV appears empty"); return; }
      setHeaders(h);
      setRows(r);
      const autoMap = autoMapHeaders(h, fields, platform || undefined);
      setMapping(autoMap);

      // If platform has autoMap, skip manual mapping
      if (selectedPlatform?.autoMap) {
        const mappedCount = Object.values(autoMap).filter(v => v && v !== "_skip").length;
        if (mappedCount >= 3) {
          setStep("options");
        } else {
          setStep("mapping");
          toast.info("Some columns couldn't be auto-mapped — please review the mapping");
        }
      } else {
        setStep("mapping");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const applyTemplate = (tpl: MappingTemplate) => {
    const newMap: Record<string, string> = {};
    for (const h of headers) {
      const lh = h.toLowerCase().trim();
      for (const [tplH, fieldKey] of Object.entries(tpl.mappings)) {
        if (tplH.toLowerCase() === lh && (fields.some(f => f.key === fieldKey) || ["_fullname", "_contact_fullname", "_notes", "_skip", "_client_company"].includes(fieldKey))) {
          newMap[h] = fieldKey;
          break;
        }
      }
    }
    setMapping(prev => ({ ...prev, ...newMap }));
    toast.success(`Applied "${tpl.name}" template`);
  };

  const saveTemplate = () => {
    if (!templateName.trim()) { toast.error("Enter a template name"); return; }
    const tpl: MappingTemplate = { name: templateName.trim(), platform: "custom", mappings: { ...mapping } };
    const updated = [...savedTemplates, tpl];
    setSavedTemplates(updated);
    localStorage.setItem("csv_import_templates", JSON.stringify(updated));
    setTemplateName("");
    toast.success("Template saved");
  };

  const deleteTemplate = (idx: number) => {
    const updated = savedTemplates.filter((_, i) => i !== idx);
    setSavedTemplates(updated);
    localStorage.setItem("csv_import_templates", JSON.stringify(updated));
    toast.success("Template deleted");
  };

  const requiredMapped = fields.filter(f => f.required).every(f => {
    if (f.key === "first_name") {
      return Object.values(mapping).includes("first_name") || Object.values(mapping).includes("_fullname");
    }
    return Object.values(mapping).includes(f.key);
  });

  const mappedFieldCount = Object.values(mapping).filter(v => v && v !== "_skip").length;

  const runImport = async () => {
    setStep("importing");
    try {
      const res = await runImportForType(
        recordType, rows, headers, mapping, duplicateAction,
        undefined, platform || undefined, archiveOption, contactUnlinkedAction,
      );
      setResult(res);
      setUnmatchedJobs(res.unmatchedJobs);
      setUnlinkedContacts(res.unlinkedContacts || []);
      setNewClientsCreated(res.newClientsCreated || 0);
      setNameReviewItems(res.nameReviewItems);

      // Save import history
      const platformLabel = selectedPlatform?.label || "CSV";
      await saveImportHistory(platformLabel, recordType, res, res.importedIds);

    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    }
    setStep("results");
  };

  const loadHistory = async () => {
    const history = await getImportHistory();
    setImportHistory(history);
    setStep("history");
  };

  const handleUndo = async (entry: any) => {
    setUndoing(true);
    try {
      const { deleted } = await undoLastImport(entry);
      toast.success(`Undone: ${deleted} records removed`);
      const history = await getImportHistory();
      setImportHistory(history);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUndoing(false);
    }
  };

  const reset = () => {
    setStep("select");
    setPlatform(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
    setUnmatchedJobs([]);
    setUnlinkedContacts([]);
    setNewClientsCreated(0);
    setArchiveOption("none");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Data Import
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Import candidates, clients and jobs from your existing CRM or spreadsheet.
          </p>
        </div>
        {step === "select" && (
          <Button variant="outline" size="sm" onClick={loadHistory}>
            <History className="h-4 w-4 mr-1" /> Import History
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
        <Shield className="h-4 w-4 shrink-0" />
        CSV files are processed locally in your browser and immediately discarded after import — never uploaded or stored.
      </div>

      {/* Step 1: Select record type */}
      {step === "select" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { type: "candidates" as const, icon: Users, label: "Candidates", desc: "Name, email, skills, salary…" },
              { type: "clients" as const, icon: Building2, label: "Companies", desc: "Company, contact, sector…" },
              { type: "contacts" as const, icon: UserCircle2, label: "Contacts", desc: "People at companies…" },
              { type: "jobs" as const, icon: Briefcase, label: "Jobs", desc: "Title, salary, type, fee…" },
            ]).map(({ type, icon: Icon, label, desc }) => (
              <Card
                key={type}
                className={`cursor-pointer transition-colors hover:border-primary/50 ${recordType === type ? "border-primary bg-primary/5" : ""}`}
                onClick={() => setRecordType(type)}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <Icon className="h-8 w-8 text-primary" />
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          {recordType === "contacts" && (
            <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>Import Companies first</strong> to ensure contacts link correctly to client records. Contacts without a matching company can be auto-created or skipped.
              </span>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setStep("platform")}>
              Continue with {recordType === "clients" ? "companies" : recordType} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </>
      )}

      {/* Step 2: Where are you importing from? */}
      {step === "platform" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where are you importing from?</CardTitle>
            <CardDescription>Select your current CRM for automatic field mapping, or choose manual mapping.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PLATFORMS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPlatform(p.value)}
                  className={`text-left rounded-lg border px-4 py-3 transition-colors ${
                    platform === p.value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <div className="font-medium text-sm">{p.label}</div>
                  <div className="text-xs mt-0.5 opacity-70">{p.autoMap ? "Auto-mapped — no manual setup" : p.description}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setPlatform(null); setStep("select"); }}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep("upload")} disabled={!platform}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Upload {recordType} CSV
              {selectedPlatform && <span className="text-primary ml-1">from {selectedPlatform.label}</span>}
            </CardTitle>
            <CardDescription>
              {selectedPlatform?.autoMap
                ? `Export your candidates from ${selectedPlatform.label} as CSV and upload here — columns will be mapped automatically.`
                : "Upload a CSV file. First row should be column headers."
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Click to select a CSV file</p>
              <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            <Button variant="outline" size="sm" onClick={() => setStep("platform")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Mapping (manual or review) */}
      {step === "mapping" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Match your columns to CRM fields</CardTitle>
            <CardDescription>{headers.length} columns · {rows.length} rows</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedPlatform?.autoMap && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Quick-apply a template:</p>
                <div className="flex flex-wrap gap-2">
                  {BUILT_IN_TEMPLATES.map(tpl => (
                    <Button key={tpl.platform} variant="outline" size="sm" onClick={() => applyTemplate(tpl)}>{tpl.name}</Button>
                  ))}
                  {savedTemplates.map((tpl, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => applyTemplate(tpl)}>{tpl.name}</Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteTemplate(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {headers.map(h => {
                const mappedKey = mapping[h] || "_skip";
                const isFullName = mappedKey === "_fullname";
                // Show a preview of the split for the first non-empty row
                const sampleVal = isFullName ? rows.find(r => r[headers.indexOf(h)]?.trim())?.[headers.indexOf(h)]?.trim() : null;
                const splitPreview = sampleVal ? splitFullName(sampleVal) : null;
                return (
                  <div key={h} className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 text-sm font-mono truncate bg-muted/50 rounded px-2 py-1.5">{h}</div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Select value={mappedKey} onValueChange={val => setMapping(prev => ({ ...prev, [h]: val }))}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_skip">— Skip this column —</SelectItem>
                          {fields.map(f => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label} {f.required && <span className="text-destructive">*</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isFullName && splitPreview && (
                      <div className="ml-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                        Preview: &apos;{sampleVal}&apos; → First: <span className="text-foreground font-medium">{splitPreview.first}</span> / Last: <span className="text-foreground font-medium">{splitPreview.last}</span>
                        {splitPreview.needsReview && <span className="text-yellow-500 ml-2">⚠ 3+ words — flagged for review</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!requiredMapped && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Required fields not mapped: {fields.filter(f => f.required && !Object.values(mapping).includes(f.key)).map(f => f.label).join(", ")}
              </div>
            )}

            {!selectedPlatform?.autoMap && (
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <input
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  placeholder="Save this mapping as template…"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={saveTemplate} disabled={!templateName.trim()}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save
                </Button>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep("upload")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button size="sm" onClick={() => setStep("options")} disabled={!requiredMapped}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Import options (duplicates, archive) */}
      {step === "options" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Options</CardTitle>
            <CardDescription>
              {mappedFieldCount} fields mapped · {rows.length} rows ready
              {selectedPlatform?.autoMap && (
                <span className="text-primary ml-1">
                  — auto-mapped from {selectedPlatform.label}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Mapped fields summary */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Mapped fields:</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(mapping)
                  .filter(([, v]) => v && v !== "_skip")
                  .map(([h, v]) => {
                    const field = fields.find(f => f.key === v);
                    const label = field?.label || v.replace("_", "");
                    return (
                      <span key={h} className="text-xs bg-primary/10 text-primary rounded px-2 py-0.5">
                        {label}
                      </span>
                    );
                  })}
              </div>
              {selectedPlatform?.autoMap && (
                <Button variant="link" size="sm" className="text-xs p-0 h-auto" onClick={() => setStep("mapping")}>
                  Review or adjust mapping
                </Button>
              )}
            </div>

            {/* Duplicate handling */}
            {(recordType === "candidates" || recordType === "clients") && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-medium">If a record with the same email already exists:</p>
                <div className="flex gap-2">
                  <Button variant={duplicateAction === "update" ? "default" : "outline"} size="sm" onClick={() => setDuplicateAction("update")}>
                    Update existing
                  </Button>
                  <Button variant={duplicateAction === "skip" ? "default" : "outline"} size="sm" onClick={() => setDuplicateAction("skip")}>
                    Skip
                  </Button>
                </div>
              </div>
            )}

            {/* Archive option */}
            {recordType === "candidates" && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-medium">How do you want to handle old records?</p>
                <div className="space-y-1.5">
                  {([
                    { value: "none" as const, label: "Import all as Active", desc: "Review later" },
                    { value: "old_12m" as const, label: "Auto-archive if not contacted in 12+ months", desc: "Based on last modified date" },
                    { value: "cold_not_suitable" as const, label: "Auto-archive Cold / Not Suitable statuses", desc: "Keep only Active candidates" },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setArchiveOption(opt.value)}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors text-sm ${
                        archiveOption === opt.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">— {opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep(selectedPlatform?.autoMap ? "upload" : "mapping")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep("preview")}>
                Preview <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Preview */}
      {step === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview — first 5 rows</CardTitle>
            <CardDescription>Review before importing {rows.length} {recordType}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground">#</th>
                    {fields.filter(f => Object.values(mapping).includes(f.key)).map(f => (
                      <th key={f.key} className="text-left py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => {
                    const rec = buildRecord(row, headers, mapping, platform || undefined);
                    return (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5 px-2 text-xs text-muted-foreground">{i + 1}</td>
                        {fields.filter(f => Object.values(mapping).includes(f.key)).map(f => (
                          <td key={f.key} className="py-1.5 px-2 text-xs max-w-[200px] truncate">
                            {rec[f.key] ?? <span className="text-muted-foreground/50">—</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("options")}><ArrowLeft className="h-4 w-4 mr-1" /> Adjust</Button>
              <Button size="sm" onClick={runImport}>Import {rows.length} {recordType} <Check className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "importing" && (
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Importing {rows.length} {recordType}…</p>
          </CardContent>
        </Card>
      )}

      {step === "results" && result && (
        <Card>
          <CardHeader><CardTitle className="text-base">Import Complete</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-center">
                <div className="text-2xl font-bold text-primary">{result.imported}</div>
                <div className="text-xs text-muted-foreground">Imported</div>
              </div>
              <div className="rounded-lg bg-accent/50 border border-accent p-3 text-center">
                <div className="text-2xl font-bold text-accent-foreground">{result.updated}</div>
                <div className="text-xs text-muted-foreground">Updated</div>
              </div>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-center">
                <div className="text-2xl font-bold text-destructive">{result.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
            </div>

            <PostImportChecklist
              unmatchedJobs={unmatchedJobs}
              errors={result.errors}
              nameReviewItems={nameReviewItems}
              compact
            />

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={reset}>Import more</Button>
              <Button variant="outline" size="sm" onClick={loadHistory}>
                <History className="h-4 w-4 mr-1" /> View History
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import History */}
      {step === "history" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" /> Import History
            </CardTitle>
            <CardDescription>Previous imports with option to undo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {importHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No imports yet.</p>
            ) : (
              <div className="space-y-2">
                {importHistory.map((entry, i) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">
                        {entry.source} → {entry.record_type}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {" · "}
                        {entry.records_imported} imported
                        {entry.records_updated > 0 && `, ${entry.records_updated} updated`}
                        {entry.records_skipped > 0 && `, ${entry.records_skipped} skipped`}
                      </div>
                    </div>
                    {i === 0 && (entry.imported_ids?.length || 0) > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUndo(entry)}
                        disabled={undoing}
                        className="text-destructive hover:text-destructive"
                      >
                        {undoing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Undo2 className="h-3.5 w-3.5 mr-1" />}
                        Undo
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={reset}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Import
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
