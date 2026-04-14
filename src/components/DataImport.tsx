import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload, FileText, ArrowRight, ArrowLeft, Check, X, AlertTriangle,
  Download, Loader2, Users, Building2, Briefcase, Shield, Link2, Save, Trash2,
} from "lucide-react";

// ── Field definitions ─────────────────────────────────────────────
type RecordType = "candidates" | "clients" | "jobs";

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
}

const CANDIDATE_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "linkedin_url", label: "LinkedIn URL", required: false },
  { key: "job_title", label: "Job Title", required: false },
  { key: "current_employer", label: "Current Employer", required: false },
  { key: "location", label: "Location", required: false },
  { key: "salary_current", label: "Salary Expectation", required: false },
  { key: "availability", label: "Notice Period / Availability", required: false },
  { key: "source", label: "Source", required: false },
  { key: "status", label: "Status", required: false },
];

const CLIENT_FIELDS: FieldDef[] = [
  { key: "company_name", label: "Company Name", required: true },
  { key: "contact_name", label: "Contact Name", required: false },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "linkedin_url", label: "LinkedIn URL", required: false },
  { key: "sector", label: "Sector", required: false },
  { key: "status", label: "Status", required: false },
];

const JOB_FIELDS: FieldDef[] = [
  { key: "title", label: "Job Title", required: true },
  { key: "_client_company", label: "Client Company (for linking)", required: false },
  { key: "location", label: "Location", required: false },
  { key: "salary_min", label: "Salary Min", required: false },
  { key: "salary_max", label: "Salary Max", required: false },
  { key: "job_type", label: "Job Type (Perm/Contract)", required: false },
  { key: "status", label: "Status", required: false },
  { key: "date_opened", label: "Date Opened", required: false },
  { key: "fee_value", label: "Fee %", required: false },
];

const FIELD_MAP: Record<RecordType, FieldDef[]> = {
  candidates: CANDIDATE_FIELDS,
  clients: CLIENT_FIELDS,
  jobs: JOB_FIELDS,
};

// ── Mapping templates ─────────────────────────────────────────────
interface MappingTemplate {
  name: string;
  platform: string;
  mappings: Record<string, string>; // csv header → field key
}

const BUILT_IN_TEMPLATES: MappingTemplate[] = [
  {
    name: "Bullhorn Export", platform: "bullhorn",
    mappings: {
      "First Name": "name", "Last Name": "_lastname", "Email": "email", "Phone": "phone",
      "Title": "job_title", "Company": "current_employer", "City": "location",
      "LinkedIn": "linkedin_url", "Source": "source", "Salary": "salary_current",
    },
  },
  {
    name: "Vincere Export", platform: "vincere",
    mappings: {
      "candidate_name": "name", "email_address": "email", "mobile": "phone",
      "position_title": "job_title", "company_name": "current_employer",
      "city": "location", "linkedin_profile": "linkedin_url", "salary": "salary_current",
    },
  },
  {
    name: "JobAdder Export", platform: "jobadder",
    mappings: {
      "Name": "name", "Email Address": "email", "Mobile Number": "phone",
      "Job Title": "job_title", "Current Company": "current_employer",
      "Location": "location", "LinkedIn": "linkedin_url",
    },
  },
  {
    name: "Generic Spreadsheet", platform: "generic",
    mappings: {
      "name": "name", "full_name": "name", "email": "email", "phone": "phone",
      "mobile": "phone", "linkedin": "linkedin_url", "job_title": "job_title",
      "title": "job_title", "company": "current_employer", "employer": "current_employer",
      "location": "location", "city": "location", "salary": "salary_current",
      "source": "source", "company_name": "company_name", "contact_name": "contact_name",
      "sector": "sector", "industry": "sector",
    },
  },
];

// ── CSV parser ────────────────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

// ── Steps ─────────────────────────────────────────────────────────
type Step = "select" | "upload" | "mapping" | "preview" | "importing" | "results" | "link-jobs";

interface ImportError {
  row: number;
  reason: string;
  data: Record<string, string>;
}

interface ImportResult {
  imported: number;
  skipped: number;
  updated: number;
  errors: ImportError[];
}

// ── Main component ────────────────────────────────────────────────
export function DataImport() {
  const [step, setStep] = useState<Step>("select");
  const [recordType, setRecordType] = useState<RecordType>("candidates");
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateAction, setDuplicateAction] = useState<"update" | "skip">("skip");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [unmatchedJobs, setUnmatchedJobs] = useState<{ id: string; title: string }[]>([]);
  const [jobClientLinks, setJobClientLinks] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<{ id: string; company_name: string }[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<MappingTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem("csv_import_templates") || "[]"); } catch { return []; }
  });
  const [templateName, setTemplateName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const fields = FIELD_MAP[recordType];

  // Auto-map CSV headers to fields using templates
  const autoMap = useCallback((csvHeaders: string[]) => {
    const newMap: Record<string, string> = {};
    const allTemplates = [...savedTemplates, ...BUILT_IN_TEMPLATES];
    for (const h of csvHeaders) {
      const lh = h.toLowerCase().trim();
      for (const tpl of allTemplates) {
        for (const [tplHeader, fieldKey] of Object.entries(tpl.mappings)) {
          if (tplHeader.toLowerCase() === lh && fields.some(f => f.key === fieldKey)) {
            newMap[h] = fieldKey;
            break;
          }
        }
        if (newMap[h]) break;
      }
      // Fallback: exact field key match
      if (!newMap[h]) {
        const match = fields.find(f => f.key === lh || f.label.toLowerCase() === lh);
        if (match) newMap[h] = match.key;
      }
    }
    return newMap;
  }, [fields, savedTemplates]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) { toast.error("Please upload a CSV file"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      const { headers: h, rows: r } = parseCSV(text);
      if (h.length === 0) { toast.error("CSV appears empty"); return; }
      setHeaders(h);
      setRows(r);
      const autoMapped = autoMap(h);
      setMapping(autoMapped);
      setStep("mapping");
    };
    reader.readAsText(file);
    // Clear the input so re-uploading the same file works
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

  const requiredMapped = fields.filter(f => f.required).every(f =>
    Object.values(mapping).includes(f.key)
  );

  const buildRecord = (row: string[]): Record<string, any> => {
    const rec: Record<string, any> = {};
    for (const [csvHeader, fieldKey] of Object.entries(mapping)) {
      if (!fieldKey || fieldKey === "_skip") continue;
      const idx = headers.indexOf(csvHeader);
      if (idx === -1) continue;
      let val: any = row[idx]?.trim() || null;
      // Bullhorn first/last name merge
      if (fieldKey === "name" && mapping[csvHeader] === "name") {
        // check if there's a _lastname mapped
        const lastNameHeader = Object.entries(mapping).find(([, v]) => v === "_lastname")?.[0];
        if (lastNameHeader) {
          const lnIdx = headers.indexOf(lastNameHeader);
          const ln = lnIdx >= 0 ? row[lnIdx]?.trim() : "";
          val = [val, ln].filter(Boolean).join(" ") || null;
        }
      }
      if (fieldKey === "_lastname" || fieldKey === "_client_company") continue;
      if (["salary_current", "salary_min", "salary_max", "fee_value"].includes(fieldKey) && val) {
        val = parseFloat(String(val).replace(/[£$€,\s]/g, "")) || null;
      }
      rec[fieldKey] = val;
    }
    return rec;
  };

  const runImport = async () => {
    setImporting(true);
    setStep("importing");
    const res: ImportResult = { imported: 0, skipped: 0, updated: 0, errors: [] };

    try {
      // For duplicate checking, fetch existing emails
      let existingEmails: Record<string, string> = {};
      if (recordType === "candidates" && Object.values(mapping).includes("email")) {
        const { data } = await supabase.from("candidates").select("id, email");
        (data || []).forEach(c => { if (c.email) existingEmails[c.email.toLowerCase()] = c.id; });
      }
      if (recordType === "clients" && Object.values(mapping).includes("email")) {
        const { data } = await supabase.from("clients").select("id, email");
        (data || []).forEach(c => { if (c.email) existingEmails[c.email.toLowerCase()] = c.id; });
      }

      // For jobs: fetch clients for linking
      let clientLookup: Record<string, string> = {};
      if (recordType === "jobs") {
        const { data } = await supabase.from("clients").select("id, company_name");
        (data || []).forEach(c => { clientLookup[c.company_name.toLowerCase()] = c.id; });
      }

      const unmatchedJobsList: { id: string; title: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const record = buildRecord(row);

        // Validate required fields
        const missingFields = fields.filter(f => f.required && !record[f.key]);
        if (missingFields.length > 0) {
          res.errors.push({
            row: i + 2,
            reason: `Missing required: ${missingFields.map(f => f.label).join(", ")}`,
            data: record,
          });
          res.skipped++;
          continue;
        }

        // Check duplicates by email
        const email = record.email?.toLowerCase();
        if (email && existingEmails[email]) {
          if (duplicateAction === "skip") {
            res.skipped++;
            res.errors.push({ row: i + 2, reason: "Duplicate email — skipped", data: record });
            continue;
          } else {
            // Update existing
            const id = existingEmails[email];
            const { email: _, ...updateData } = record;
            const { error } = await supabase.from(recordType).update(updateData).eq("id", id);
            if (error) {
              res.errors.push({ row: i + 2, reason: error.message, data: record });
              res.skipped++;
            } else {
              res.updated++;
            }
            continue;
          }
        }

        // For jobs: try to link client
        if (recordType === "jobs") {
          const clientHeader = Object.entries(mapping).find(([, v]) => v === "_client_company")?.[0];
          if (clientHeader) {
            const clientIdx = headers.indexOf(clientHeader);
            const clientName = clientIdx >= 0 ? row[clientIdx]?.trim().toLowerCase() : "";
            if (clientName && clientLookup[clientName]) {
              record.client_id = clientLookup[clientName];
            }
          }
        }

        const { data: inserted, error } = await supabase.from(recordType).insert(record).select("id").single();
        if (error) {
          res.errors.push({ row: i + 2, reason: error.message, data: record });
          res.skipped++;
        } else {
          res.imported++;
          if (email) existingEmails[email] = inserted.id;

          // Track unmatched jobs
          if (recordType === "jobs" && !record.client_id && inserted) {
            unmatchedJobsList.push({ id: inserted.id, title: record.title });
          }
        }
      }

      setUnmatchedJobs(unmatchedJobsList);
      if (unmatchedJobsList.length > 0) {
        const { data: allClients } = await supabase.from("clients").select("id, company_name").order("company_name");
        setClients(allClients || []);
      }
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    }

    setResult(res);
    setStep("results");
    setImporting(false);
    // Clear CSV data from memory
    setCsvText("");
  };

  const downloadErrorReport = () => {
    if (!result) return;
    const lines = ["Row,Reason,Data"];
    result.errors.forEach(e => {
      lines.push(`${e.row},"${e.reason.replace(/"/g, '""')}","${JSON.stringify(e.data).replace(/"/g, '""')}"`);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `import-errors-${recordType}.csv`; a.click();
    URL.revokeObjectURL(url);
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
    setCsvText("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
    setUnmatchedJobs([]);
    setJobClientLinks({});
  };

  // ── Render ──────────────────────────────────────────────────────
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

      {/* Step: Select record type */}
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

      {/* Step: Upload CSV */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload {recordType} CSV</CardTitle>
            <CardDescription>
              Upload a CSV file with your {recordType} data. First row should be column headers.
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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("select")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Column mapping */}
      {step === "mapping" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Match your columns to CRM fields</CardTitle>
            <CardDescription>
              {headers.length} columns detected · {rows.length} rows · Map each CSV column to the right field
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Templates */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Quick-apply a template:</p>
              <div className="flex flex-wrap gap-2">
                {BUILT_IN_TEMPLATES.map(tpl => (
                  <Button key={tpl.platform} variant="outline" size="sm" onClick={() => applyTemplate(tpl)}>
                    {tpl.name}
                  </Button>
                ))}
                {savedTemplates.map((tpl, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => applyTemplate(tpl)}>
                      {tpl.name}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteTemplate(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Mapping rows */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {headers.map(h => (
                <div key={h} className="flex items-center gap-3">
                  <div className="flex-1 text-sm font-mono truncate bg-muted/50 rounded px-2 py-1.5">{h}</div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select value={mapping[h] || "_skip"} onValueChange={val => setMapping(prev => ({ ...prev, [h]: val }))}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_skip">— Skip this column —</SelectItem>
                      {fields.map(f => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label} {f.required && <span className="text-destructive">*</span>}
                        </SelectItem>
                      ))}
                      {recordType === "candidates" && (
                        <SelectItem value="_lastname">Last Name (merge with Name)</SelectItem>
                      )}
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

            {/* Duplicate handling */}
            {(recordType === "candidates" || recordType === "clients") && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-medium">If a record with the same email already exists:</p>
                <div className="flex gap-2">
                  <Button variant={duplicateAction === "skip" ? "default" : "outline"} size="sm" onClick={() => setDuplicateAction("skip")}>
                    Skip duplicates
                  </Button>
                  <Button variant={duplicateAction === "update" ? "default" : "outline"} size="sm" onClick={() => setDuplicateAction("update")}>
                    Update existing
                  </Button>
                </div>
              </div>
            )}

            {/* Save template */}
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
              <Button variant="outline" size="sm" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep("preview")} disabled={!requiredMapped}>
                Preview data <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Preview */}
      {step === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview — first 5 rows</CardTitle>
            <CardDescription>
              Review the data before importing {rows.length} {recordType}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground">#</th>
                    {fields.filter(f => Object.values(mapping).includes(f.key)).map(f => (
                      <th key={f.key} className="text-left py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                        {f.label} {f.required && <span className="text-destructive">*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => {
                    const rec = buildRecord(row);
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
              <Button variant="outline" size="sm" onClick={() => setStep("mapping")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Adjust mapping
              </Button>
              <Button size="sm" onClick={runImport}>
                Import {rows.length} {recordType} <Check className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Importing */}
      {step === "importing" && (
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Importing {rows.length} {recordType}…</p>
            <p className="text-xs text-muted-foreground">This may take a moment</p>
          </CardContent>
        </Card>
      )}

      {/* Step: Results */}
      {step === "results" && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-center">
                <div className="text-2xl font-bold text-green-500">{result.imported}</div>
                <div className="text-xs text-muted-foreground">Imported</div>
              </div>
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-center">
                <div className="text-2xl font-bold text-blue-500">{result.updated}</div>
                <div className="text-xs text-muted-foreground">Updated</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-center">
                <div className="text-2xl font-bold text-amber-500">{result.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> {result.errors.length} issue(s)
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {result.errors.slice(0, 10).map((e, i) => (
                    <div key={i} className="text-xs bg-destructive/5 rounded px-2 py-1">
                      <span className="font-medium">Row {e.row}:</span> {e.reason}
                    </div>
                  ))}
                  {result.errors.length > 10 && (
                    <p className="text-xs text-muted-foreground">…and {result.errors.length - 10} more</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={downloadErrorReport}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Download error report
                </Button>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {unmatchedJobs.length > 0 && (
                <Button size="sm" onClick={() => setStep("link-jobs")}>
                  <Link2 className="h-4 w-4 mr-1" /> Link {unmatchedJobs.length} jobs to clients
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={reset}>
                Import more data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Link jobs to clients */}
      {step === "link-jobs" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Link Jobs to Clients</CardTitle>
            <CardDescription>
              These jobs couldn't be automatically matched to a client. Link them manually:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-60 overflow-y-auto space-y-2">
              {unmatchedJobs.map(job => (
                <div key={job.id} className="flex items-center gap-3">
                  <span className="text-sm flex-1 truncate">{job.title}</span>
                  <Select value={jobClientLinks[job.id] || ""} onValueChange={val => setJobClientLinks(prev => ({ ...prev, [job.id]: val }))}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select client…" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={linkJobsToClients}>
                <Check className="h-4 w-4 mr-1" /> Save links
              </Button>
              <Button variant="outline" size="sm" onClick={() => setStep("results")}>
                Skip for now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
