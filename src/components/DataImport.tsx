import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Upload, FileText, ArrowRight, ArrowLeft, Check, AlertTriangle,
  Download, Loader2, Users, Building2, Briefcase, Shield, Link2, Save, Trash2,
} from "lucide-react";
import {
  RecordType, FIELD_MAP, BUILT_IN_TEMPLATES, MappingTemplate, NameReviewItem,
  parseCSV, autoMapHeaders, buildRecord, runImportForType,
  downloadErrorReport as dlErrors, ImportResult,
} from "@/lib/csv-import";
import { PostImportChecklist } from "@/components/PostImportChecklist";

type Step = "select" | "upload" | "mapping" | "preview" | "importing" | "results";

export function DataImport() {
  const [step, setStep] = useState<Step>("select");
  const [recordType, setRecordType] = useState<RecordType>("candidates");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateAction, setDuplicateAction] = useState<"update" | "skip">("skip");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [unmatchedJobs, setUnmatchedJobs] = useState<{ id: string; title: string }[]>([]);
  const [nameReviewItems, setNameReviewItems] = useState<NameReviewItem[]>([]);
  const [jobClientLinks, setJobClientLinks] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<{ id: string; company_name: string }[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<MappingTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem("csv_import_templates") || "[]"); } catch { return []; }
  });
  const [templateName, setTemplateName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const fields = FIELD_MAP[recordType];

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
      setMapping(autoMapHeaders(h, fields));
      setStep("mapping");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const applyTemplate = (tpl: MappingTemplate) => {
    const newMap: Record<string, string> = {};
    for (const h of headers) {
      const lh = h.toLowerCase().trim();
      for (const [tplH, fieldKey] of Object.entries(tpl.mappings)) {
        if (tplH.toLowerCase() === lh && fields.some(f => f.key === fieldKey)) {
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

  const runImport = async () => {
    setStep("importing");
    try {
      const res = await runImportForType(recordType, rows, headers, mapping, duplicateAction);
      setResult(res);
      setUnmatchedJobs(res.unmatchedJobs);
      setNameReviewItems(res.nameReviewItems);
      if (res.unmatchedJobs.length > 0) {
        const { data } = await supabase.from("clients").select("id, company_name").order("company_name");
        setClients(data || []);
      }
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    }
    setStep("results");
  };

  const linkJobsToClients = async () => {
    let linked = 0;
    for (const [jobId, clientId] of Object.entries(jobClientLinks)) {
      if (!clientId) continue;
      const { error } = await supabase.from("jobs").update({ client_id: clientId }).eq("id", jobId);
      if (!error) linked++;
    }
    toast.success(`${linked} job(s) linked to clients`);
    setUnmatchedJobs([]);
    setStep("results");
  };

  const reset = () => {
    setStep("select");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
    setUnmatchedJobs([]);
    setJobClientLinks({});
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" /> Data Import
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Import candidates, clients and jobs from CSV files. Your files are processed in-browser and never stored.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
        <Shield className="h-4 w-4 shrink-0" />
        CSV files are processed locally in your browser and immediately discarded after import — never uploaded or stored.
      </div>

      {step === "select" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { type: "candidates" as const, icon: Users, label: "Candidates", desc: "Name, email, skills, salary…" },
            { type: "clients" as const, icon: Building2, label: "Clients", desc: "Company, contact, sector…" },
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
      )}

      {step === "select" && (
        <div className="flex justify-end">
          <Button onClick={() => setStep("upload")}>
            Continue with {recordType} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload {recordType} CSV</CardTitle>
            <CardDescription>Upload a CSV file. First row should be column headers.</CardDescription>
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
            <Button variant="outline" size="sm" onClick={() => setStep("select")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "mapping" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Match your columns to CRM fields</CardTitle>
            <CardDescription>{headers.length} columns · {rows.length} rows</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {headers.map(h => (
                <div key={h} className="flex items-center gap-3">
                  <div className="flex-1 text-sm font-mono truncate bg-muted/50 rounded px-2 py-1.5">{h}</div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select value={mapping[h] || "_skip"} onValueChange={val => setMapping(prev => ({ ...prev, [h]: val }))}>
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
              ))}
            </div>

            {!requiredMapped && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Required fields not mapped: {fields.filter(f => f.required && !Object.values(mapping).includes(f.key)).map(f => f.label).join(", ")}
              </div>
            )}

            {(recordType === "candidates" || recordType === "clients") && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-medium">If a record with the same email already exists:</p>
                <div className="flex gap-2">
                  <Button variant={duplicateAction === "skip" ? "default" : "outline"} size="sm" onClick={() => setDuplicateAction("skip")}>Skip</Button>
                  <Button variant={duplicateAction === "update" ? "default" : "outline"} size="sm" onClick={() => setDuplicateAction("update")}>Update existing</Button>
                </div>
              </div>
            )}

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

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep("upload")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button size="sm" onClick={() => setStep("preview")} disabled={!requiredMapped}>Preview <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                    const rec = buildRecord(row, headers, mapping);
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
              <Button variant="outline" size="sm" onClick={() => setStep("mapping")}><ArrowLeft className="h-4 w-4 mr-1" /> Adjust</Button>
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
              compact
            />

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={reset}>Import more</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
