import { supabase } from "@/integrations/supabase/client";

// ── Field definitions ─────────────────────────────────────────────
export type RecordType = "candidates" | "clients" | "jobs";

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
}

export const CANDIDATE_FIELDS: FieldDef[] = [
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

export const CLIENT_FIELDS: FieldDef[] = [
  { key: "company_name", label: "Company Name", required: true },
  { key: "contact_name", label: "Contact Name", required: false },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "linkedin_url", label: "LinkedIn URL", required: false },
  { key: "sector", label: "Sector", required: false },
  { key: "status", label: "Status", required: false },
];

export const JOB_FIELDS: FieldDef[] = [
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

export const FIELD_MAP: Record<RecordType, FieldDef[]> = {
  candidates: CANDIDATE_FIELDS,
  clients: CLIENT_FIELDS,
  jobs: JOB_FIELDS,
};

// ── Templates ─────────────────────────────────────────────────────
export interface MappingTemplate {
  name: string;
  platform: string;
  mappings: Record<string, string>;
}

export const BUILT_IN_TEMPLATES: MappingTemplate[] = [
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

export const PLATFORM_OPTIONS = [
  { value: "bullhorn", label: "Bullhorn" },
  { value: "vincere", label: "Vincere" },
  { value: "jobadder", label: "JobAdder" },
  { value: "generic", label: "Spreadsheet / Excel" },
  { value: "other", label: "Other CRM" },
  { value: "manual", label: "I don't know — just let me map the columns" },
];

// ── CSV parser ────────────────────────────────────────────────────
export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
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

// ── Auto-mapping ──────────────────────────────────────────────────
export function autoMapHeaders(
  csvHeaders: string[],
  fields: FieldDef[],
  platform?: string,
): Record<string, string> {
  const newMap: Record<string, string> = {};
  // Prioritize selected platform template
  const templates = platform
    ? [...BUILT_IN_TEMPLATES.filter(t => t.platform === platform), ...BUILT_IN_TEMPLATES.filter(t => t.platform !== platform)]
    : BUILT_IN_TEMPLATES;

  for (const h of csvHeaders) {
    const lh = h.toLowerCase().trim();
    for (const tpl of templates) {
      for (const [tplHeader, fieldKey] of Object.entries(tpl.mappings)) {
        if (tplHeader.toLowerCase() === lh && fields.some(f => f.key === fieldKey)) {
          newMap[h] = fieldKey;
          break;
        }
      }
      if (newMap[h]) break;
    }
    if (!newMap[h]) {
      const match = fields.find(f => f.key === lh || f.label.toLowerCase() === lh);
      if (match) newMap[h] = match.key;
    }
  }
  return newMap;
}

// ── Build record from row ─────────────────────────────────────────
export function buildRecord(
  row: string[],
  headers: string[],
  mapping: Record<string, string>,
): Record<string, any> {
  const rec: Record<string, any> = {};
  for (const [csvHeader, fieldKey] of Object.entries(mapping)) {
    if (!fieldKey || fieldKey === "_skip") continue;
    const idx = headers.indexOf(csvHeader);
    if (idx === -1) continue;
    let val: any = row[idx]?.trim() || null;
    if (fieldKey === "name" && mapping[csvHeader] === "name") {
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
}

// ── Import error/result types ─────────────────────────────────────
export interface ImportError {
  row: number;
  reason: string;
  data: Record<string, string>;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  updated: number;
  errors: ImportError[];
}

// ── Run import for a single record type ───────────────────────────
export async function runImportForType(
  recordType: RecordType,
  rows: string[][],
  headers: string[],
  mapping: Record<string, string>,
  duplicateAction: "update" | "skip",
  onProgress?: (current: number, total: number) => void,
): Promise<ImportResult & { unmatchedJobs: { id: string; title: string }[] }> {
  const fields = FIELD_MAP[recordType];
  const res: ImportResult = { imported: 0, skipped: 0, updated: 0, errors: [] };
  const unmatchedJobs: { id: string; title: string }[] = [];

  let existingEmails: Record<string, string> = {};
  if ((recordType === "candidates" || recordType === "clients") && Object.values(mapping).includes("email")) {
    const { data } = await supabase.from(recordType).select("id, email");
    (data || []).forEach((c: any) => { if (c.email) existingEmails[c.email.toLowerCase()] = c.id; });
  }

  let clientLookup: Record<string, string> = {};
  if (recordType === "jobs") {
    const { data } = await supabase.from("clients").select("id, company_name");
    (data || []).forEach(c => { clientLookup[c.company_name.toLowerCase()] = c.id; });
  }

  for (let i = 0; i < rows.length; i++) {
    onProgress?.(i + 1, rows.length);
    const row = rows[i];
    const record = buildRecord(row, headers, mapping);

    const missingFields = fields.filter(f => f.required && !record[f.key]);
    if (missingFields.length > 0) {
      res.errors.push({ row: i + 2, reason: `Missing required: ${missingFields.map(f => f.label).join(", ")}`, data: record });
      res.skipped++;
      continue;
    }

    const email = record.email?.toLowerCase();
    if (email && existingEmails[email]) {
      if (duplicateAction === "skip") {
        res.skipped++;
        res.errors.push({ row: i + 2, reason: "Duplicate email — skipped", data: record });
        continue;
      } else {
        const id = existingEmails[email];
        const { email: _, ...updateData } = record;
        const { error } = await supabase.from(recordType as any).update(updateData as any).eq("id", id);
        if (error) { res.errors.push({ row: i + 2, reason: error.message, data: record }); res.skipped++; }
        else { res.updated++; }
        continue;
      }
    }

    if (recordType === "jobs") {
      const clientHeader = Object.entries(mapping).find(([, v]) => v === "_client_company")?.[0];
      if (clientHeader) {
        const clientIdx = headers.indexOf(clientHeader);
        const clientName = clientIdx >= 0 ? row[clientIdx]?.trim().toLowerCase() : "";
        if (clientName && clientLookup[clientName]) record.client_id = clientLookup[clientName];
      }
    }

    const { data: inserted, error } = await (supabase.from(recordType as any).insert(record as any).select("id").single() as any);
    if (error) { res.errors.push({ row: i + 2, reason: error.message, data: record }); res.skipped++; }
    else {
      res.imported++;
      if (email) existingEmails[email] = inserted.id;
      if (recordType === "jobs" && !record.client_id && inserted) {
        unmatchedJobs.push({ id: inserted.id, title: record.title });
      }
    }
  }

  return { ...res, unmatchedJobs };
}

// ── Example CSV generators ────────────────────────────────────────
export function generateExampleCSV(type: RecordType): string {
  if (type === "candidates") {
    return `Name,Email,Phone,Job Title,Current Employer,Location,LinkedIn URL,Salary Expectation,Availability,Source
John Smith,john@example.com,07700900000,Software Engineer,Acme Corp,London,https://linkedin.com/in/johnsmith,65000,1 month,LinkedIn
Jane Doe,jane@example.com,07700900001,Product Manager,Tech Ltd,Manchester,,72000,2 weeks,Referral`;
  }
  if (type === "clients") {
    return `Company Name,Contact Name,Email,Phone,LinkedIn URL,Sector
Acme Corp,Bob Williams,bob@acme.com,02012345678,https://linkedin.com/company/acme,Tech/Digital
Global Inc,Sarah Jones,sarah@global.com,02087654321,,Finance`;
  }
  return `Job Title,Client Company,Location,Salary Min,Salary Max,Job Type,Status,Date Opened,Fee %
Senior Developer,Acme Corp,London,70000,90000,Perm,Open,2025-01-15,20
Project Manager,Global Inc,Remote,55000,65000,Contract,Open,2025-02-01,15`;
}

export function downloadExampleCSV(type: RecordType) {
  const csv = generateExampleCSV(type);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `example-${type}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadErrorReport(errors: ImportError[], recordType: string) {
  const lines = ["Row,Reason,Data"];
  errors.forEach(e => {
    lines.push(`${e.row},"${e.reason.replace(/"/g, '""')}","${JSON.stringify(e.data).replace(/"/g, '""')}"`);
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `import-errors-${recordType}.csv`; a.click();
  URL.revokeObjectURL(url);
}
