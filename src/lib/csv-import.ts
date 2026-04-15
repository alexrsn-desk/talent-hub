import { supabase } from "@/integrations/supabase/client";

// ── Field definitions ─────────────────────────────────────────────
export type RecordType = "candidates" | "clients" | "jobs";

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
}

export const CANDIDATE_FIELDS: FieldDef[] = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: false },
  { key: "_fullname", label: "Full Name (will split)", required: false },
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
  { key: "_notes", label: "Notes (import as note)", required: false },
];

export const CLIENT_FIELDS: FieldDef[] = [
  { key: "company_name", label: "Company Name", required: true },
  { key: "first_name", label: "Contact First Name", required: false },
  { key: "last_name", label: "Contact Last Name", required: false },
  { key: "_contact_fullname", label: "Contact Full Name (will split)", required: false },
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

// ── Platform definitions ──────────────────────────────────────────
export type PlatformKey = "vincere" | "bullhorn" | "jobadder" | "loxo" | "recruitee" | "spreadsheet" | "other";

export interface PlatformOption {
  value: PlatformKey;
  label: string;
  description: string;
  autoMap: boolean; // true = skip manual mapping
}

export const PLATFORMS: PlatformOption[] = [
  { value: "vincere", label: "Vincere", description: "Standard Vincere candidate export", autoMap: true },
  { value: "bullhorn", label: "Bullhorn", description: "Standard Bullhorn candidate export", autoMap: true },
  { value: "jobadder", label: "JobAdder", description: "Standard JobAdder candidate export", autoMap: true },
  { value: "loxo", label: "Loxo", description: "Standard Loxo candidate export", autoMap: true },
  { value: "recruitee", label: "Recruitee", description: "Standard Recruitee candidate export", autoMap: true },
  { value: "spreadsheet", label: "Spreadsheet / Excel", description: "Manual column mapping", autoMap: false },
  { value: "other", label: "Other CRM", description: "Manual column mapping", autoMap: false },
];

// ── Templates ─────────────────────────────────────────────────────
export interface MappingTemplate {
  name: string;
  platform: string;
  mappings: Record<string, string>;
}

export const BUILT_IN_TEMPLATES: MappingTemplate[] = [
  {
    name: "Vincere Export", platform: "vincere",
    mappings: {
      "First Name": "first_name", "Last Name": "last_name",
      "Email": "email", "Mobile": "phone", "Phone": "phone",
      "Current Job Title": "job_title", "Current Employer": "current_employer",
      "City": "location", "Salary": "salary_current",
      "LinkedIn URL": "linkedin_url", "Source": "source", "Status": "status",
      "Notes": "_notes", "Created Date": "_skip", "Last Modified": "_skip",
      // Vincere alternate headers
      "candidate_name": "_fullname", "email_address": "email", "mobile": "phone",
      "position_title": "job_title", "company_name": "current_employer",
      "city": "location", "linkedin_profile": "linkedin_url", "salary": "salary_current",
    },
  },
  {
    name: "Bullhorn Export", platform: "bullhorn",
    mappings: {
      "firstName": "first_name", "lastName": "last_name",
      "First Name": "first_name", "Last Name": "last_name",
      "email": "email", "Email": "email",
      "mobile": "phone", "Mobile": "phone",
      "title": "job_title", "Title": "job_title",
      "companyName": "current_employer", "Company": "current_employer", "Company Name": "current_employer",
      "city": "location", "City": "location",
      "salary": "salary_current", "Salary": "salary_current",
      "linkedInURL": "linkedin_url", "LinkedIn": "linkedin_url", "LinkedIn URL": "linkedin_url",
      "source": "source", "Source": "source",
      "status": "status", "Status": "status",
      "comments": "_notes", "Comments": "_notes",
      "dateAdded": "_skip", "Date Added": "_skip",
    },
  },
  {
    name: "JobAdder Export", platform: "jobadder",
    mappings: {
      "First Name": "first_name", "Last Name": "last_name",
      "Email Address": "email", "Mobile Phone": "phone",
      "Current Job Title": "job_title", "Current Employer": "current_employer",
      "Location": "location", "Current Salary": "salary_current",
      "LinkedIn": "linkedin_url", "Source": "source",
      "Stage": "status", "Notes": "_notes", "Date Added": "_skip",
      // Alternate headers
      "Name": "_fullname", "Email": "email", "Mobile Number": "phone",
      "Job Title": "job_title", "Current Company": "current_employer",
    },
  },
  {
    name: "Loxo Export", platform: "loxo",
    mappings: {
      "First Name": "first_name", "Last Name": "last_name",
      "Email": "email", "Phone": "phone", "Mobile": "phone",
      "Title": "job_title", "Current Title": "job_title",
      "Company": "current_employer", "Current Company": "current_employer",
      "Location": "location", "City": "location",
      "Salary": "salary_current", "LinkedIn": "linkedin_url",
      "Source": "source", "Status": "status", "Notes": "_notes",
    },
  },
  {
    name: "Recruitee Export", platform: "recruitee",
    mappings: {
      "First name": "first_name", "Last name": "last_name",
      "First Name": "first_name", "Last Name": "last_name",
      "Email": "email", "Phone": "phone", "Mobile": "phone",
      "Position": "job_title", "Current Position": "job_title",
      "Company": "current_employer", "Current Company": "current_employer",
      "Location": "location", "City": "location",
      "Source": "source", "Status": "status", "Notes": "_notes",
      "LinkedIn": "linkedin_url", "LinkedIn URL": "linkedin_url",
    },
  },
  {
    name: "Generic Spreadsheet", platform: "spreadsheet",
    mappings: {
      "first_name": "first_name", "firstname": "first_name", "first name": "first_name",
      "last_name": "last_name", "lastname": "last_name", "last name": "last_name", "surname": "last_name",
      "name": "_fullname", "full_name": "_fullname", "full name": "_fullname",
      "candidate_name": "_fullname", "contact_name": "_contact_fullname",
      "email": "email", "phone": "phone",
      "mobile": "phone", "linkedin": "linkedin_url", "job_title": "job_title",
      "title": "job_title", "company": "current_employer", "employer": "current_employer",
      "location": "location", "city": "location", "salary": "salary_current",
      "source": "source", "company_name": "company_name",
      "sector": "sector", "industry": "sector",
      "notes": "_notes", "comments": "_notes",
    },
  },
];

// Legacy compat
export const PLATFORM_OPTIONS = PLATFORMS.map(p => ({ value: p.value, label: p.label }));

// ── Status mapping ────────────────────────────────────────────────
const VINCERE_STATUS_MAP: Record<string, string> = {
  "active": "Active", "placed": "Placed",
  "do not contact": "Do Not Contact", "unqualified": "Not Suitable",
  "hot": "Active", "warm": "Active", "cold": "Cold",
};

const BULLHORN_STATUS_MAP: Record<string, string> = {
  "active": "Active", "placed": "Placed",
  "inactive": "Cold", "archive": "Cold",
  "new lead": "New", "submitted": "Active",
};

const STATUS_MAPS: Record<string, Record<string, string>> = {
  vincere: VINCERE_STATUS_MAP,
  bullhorn: BULLHORN_STATUS_MAP,
};

const VALID_STATUSES = ["New", "Contacted", "Screening", "Submitted", "Interviewing", "Placed", "On Hold", "Not Suitable", "Cold", "Archive", "Do Not Contact", "Active"];

export function mapStatus(raw: string | null, platform?: string): { status: string; flagPriority: boolean; flagged: boolean } {
  if (!raw) return { status: "Active", flagPriority: false, flagged: false };
  const lower = raw.toLowerCase().trim();

  // Check platform-specific mapping first
  if (platform && STATUS_MAPS[platform]) {
    const mapped = STATUS_MAPS[platform][lower];
    if (mapped) {
      const flagPriority = lower === "hot";
      return { status: mapped, flagPriority, flagged: false };
    }
  }

  // Generic mapping
  const directMatch = VALID_STATUSES.find(s => s.toLowerCase() === lower);
  if (directMatch) return { status: directMatch, flagPriority: false, flagged: false };

  // Default to Active and flag for review
  return { status: "Active", flagPriority: false, flagged: true };
}

// ── Salary cleaning ───────────────────────────────────────────────
export function cleanSalary(raw: string | null): { value: number | null; note: string | null } {
  if (!raw) return { value: null, note: null };
  const s = raw.trim();

  // "Negotiable" or non-numeric
  if (/^[a-z]/i.test(s) && !/\d/.test(s)) {
    return { value: null, note: `Salary: ${s}` };
  }

  // Range like "£85k-£90k" or "85000-90000"
  const rangeMatch = s.match(/[\d,.]+\s*[kK]?\s*[-–—to]+\s*[\d,.]+\s*[kK]?/);
  if (rangeMatch) {
    const nums = s.match(/[\d,.]+\s*[kK]?/g);
    if (nums && nums.length >= 2) {
      const v1 = parseSalaryToken(nums[0]);
      const v2 = parseSalaryToken(nums[1]);
      if (v1 && v2) {
        return { value: Math.round((v1 + v2) / 2), note: `Original salary: ${s}` };
      }
    }
  }

  const val = parseSalaryToken(s);
  return val ? { value: val, note: null } : { value: null, note: `Salary: ${s}` };
}

function parseSalaryToken(s: string): number | null {
  const cleaned = s.replace(/[£$€,\s]/g, "");
  const kMatch = cleaned.match(/^([\d.]+)\s*[kK]$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num);
}

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
  const templates = platform
    ? [...BUILT_IN_TEMPLATES.filter(t => t.platform === platform), ...BUILT_IN_TEMPLATES.filter(t => t.platform !== platform)]
    : BUILT_IN_TEMPLATES;

  const specialKeys = ["_fullname", "_contact_fullname", "_lastname", "_client_company", "_notes", "_skip"];
  for (const h of csvHeaders) {
    const lh = h.toLowerCase().trim();
    for (const tpl of templates) {
      for (const [tplHeader, fieldKey] of Object.entries(tpl.mappings)) {
        if (tplHeader.toLowerCase() === lh && (fields.some(f => f.key === fieldKey) || specialKeys.includes(fieldKey))) {
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

// ── Name splitting helper ──────────────────────────────────────────
export interface NameReviewItem {
  row: number;
  fullName: string;
  suggestedFirst: string;
  suggestedLast: string;
}

export function splitFullName(fullName: string): { first: string; last: string; needsReview: boolean } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "", needsReview: false };
  if (parts.length === 1) return { first: parts[0], last: "", needsReview: false };
  if (parts.length === 2) return { first: parts[0], last: parts[1], needsReview: false };
  return { first: parts[0], last: parts.slice(1).join(" "), needsReview: true };
}

// ── Build record from row ─────────────────────────────────────────
export function buildRecord(
  row: string[],
  headers: string[],
  mapping: Record<string, string>,
  platform?: string,
): Record<string, any> {
  const rec: Record<string, any> = {};
  let notesContent: string | null = null;

  for (const [csvHeader, fieldKey] of Object.entries(mapping)) {
    if (!fieldKey || fieldKey === "_skip") continue;
    const idx = headers.indexOf(csvHeader);
    if (idx === -1) continue;
    let val: any = row[idx]?.trim() || null;

    if (["_lastname", "_fullname", "_contact_fullname", "_client_company"].includes(fieldKey)) continue;

    if (fieldKey === "_notes") {
      notesContent = val;
      continue;
    }

    if (fieldKey === "salary_current" && val) {
      const { value, note } = cleanSalary(String(val));
      rec.salary_current = value;
      if (note) notesContent = notesContent ? `${notesContent}\n${note}` : note;
      continue;
    }

    if (["salary_min", "salary_max", "fee_value"].includes(fieldKey) && val) {
      val = parseSalaryToken(String(val)) || null;
    }

    if (fieldKey === "status" && val) {
      const { status, flagPriority } = mapStatus(val, platform);
      rec.status = status;
      if (flagPriority) {
        rec.priority_flag = true;
        rec.priority_flagged_at = new Date().toISOString();
      }
      continue;
    }

    rec[fieldKey] = val;
  }

  // Store notes for later insertion
  if (notesContent) {
    rec._notes_content = notesContent;
  }

  // Handle full name splitting for candidates
  const fullnameHeader = Object.entries(mapping).find(([, v]) => v === "_fullname")?.[0];
  if (fullnameHeader) {
    const fnIdx = headers.indexOf(fullnameHeader);
    const fullName = fnIdx >= 0 ? row[fnIdx]?.trim() : "";
    if (fullName) {
      const { first, last } = splitFullName(fullName);
      rec.first_name = rec.first_name || first || null;
      rec.last_name = rec.last_name || last || null;
    }
  }

  // Handle contact full name splitting for clients
  const contactFullnameHeader = Object.entries(mapping).find(([, v]) => v === "_contact_fullname")?.[0];
  if (contactFullnameHeader) {
    const cfnIdx = headers.indexOf(contactFullnameHeader);
    const contactFullName = cfnIdx >= 0 ? row[cfnIdx]?.trim() : "";
    if (contactFullName) {
      const { first, last } = splitFullName(contactFullName);
      rec.first_name = rec.first_name || first || null;
      rec.last_name = rec.last_name || last || null;
      rec.contact_name = contactFullName;
    }
  }

  if (rec.first_name || rec.last_name) {
    rec.name = [rec.first_name, rec.last_name].filter(Boolean).join(" ") || null;
  }

  if (rec.contact_name && !rec.first_name) {
    const { first, last } = splitFullName(rec.contact_name);
    rec.first_name = first || null;
    rec.last_name = last || null;
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
  nameReviewItems: NameReviewItem[];
}

// ── Archive option type ───────────────────────────────────────────
export type ArchiveOption = "none" | "old_12m" | "cold_not_suitable";

// ── Run import for a single record type ───────────────────────────
export async function runImportForType(
  recordType: RecordType,
  rows: string[][],
  headers: string[],
  mapping: Record<string, string>,
  duplicateAction: "update" | "skip",
  onProgress?: (current: number, total: number) => void,
  platform?: string,
  archiveOption?: ArchiveOption,
): Promise<ImportResult & { unmatchedJobs: { id: string; title: string }[]; importedIds: string[] }> {
  const fields = FIELD_MAP[recordType];
  const res: ImportResult = { imported: 0, skipped: 0, updated: 0, errors: [], nameReviewItems: [] };
  const unmatchedJobs: { id: string; title: string }[] = [];
  const importedIds: string[] = [];

  const hasFullnameMapping = Object.values(mapping).includes("_fullname") || Object.values(mapping).includes("_contact_fullname");

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

  const platformLabel = PLATFORMS.find(p => p.value === platform)?.label || platform || "CSV";

  for (let i = 0; i < rows.length; i++) {
    onProgress?.(i + 1, rows.length);
    const row = rows[i];
    const record = buildRecord(row, headers, mapping, platform);

    // Extract notes content before inserting
    const notesContent = record._notes_content;
    delete record._notes_content;

    const namePresent = record.first_name || record.name;
    const missingFields = fields.filter(f => {
      if (f.key === "first_name" && (hasFullnameMapping || namePresent)) return false;
      return f.required && !record[f.key];
    });
    if (missingFields.length > 0) {
      res.errors.push({ row: i + 2, reason: `Missing required: ${missingFields.map(f => f.label).join(", ")}`, data: record });
      res.skipped++;
      continue;
    }

    if (hasFullnameMapping && record.name) {
      const parts = record.name.trim().split(/\s+/);
      if (parts.length > 2) {
        res.nameReviewItems.push({
          row: i + 2,
          fullName: record.name,
          suggestedFirst: record.first_name || parts[0],
          suggestedLast: record.last_name || parts.slice(1).join(" "),
        });
      }
    }

    // Apply archive option for candidates
    if (recordType === "candidates" && archiveOption === "cold_not_suitable") {
      if (record.status === "Cold" || record.status === "Not Suitable") {
        record.status = "Cold";
      }
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
      importedIds.push(inserted.id);
      if (email) existingEmails[email] = inserted.id;
      if (recordType === "jobs" && !record.client_id && inserted) {
        unmatchedJobs.push({ id: inserted.id, title: record.title });
      }

      // Insert notes if present
      if (notesContent && recordType === "candidates") {
        await supabase.from("notes").insert({
          candidate_id: inserted.id,
          content: notesContent,
          activity_type: "Note",
          outcome: `Imported from ${platformLabel}`,
        });
      }
    }
  }

  return { ...res, unmatchedJobs, importedIds };
}

// ── Import history ────────────────────────────────────────────────
export async function saveImportHistory(
  source: string,
  recordType: RecordType,
  result: ImportResult,
  importedIds: string[],
) {
  await supabase.from("import_history" as any).insert({
    source,
    record_type: recordType,
    records_imported: result.imported,
    records_updated: result.updated,
    records_skipped: result.skipped,
    imported_ids: importedIds,
  } as any);
}

export async function getImportHistory() {
  const { data } = await supabase
    .from("import_history" as any)
    .select("*")
    .order("created_at", { ascending: false });
  return (data || []) as any[];
}

export async function undoLastImport(historyEntry: any): Promise<{ deleted: number }> {
  const ids: string[] = historyEntry.imported_ids || [];
  if (ids.length === 0) return { deleted: 0 };

  const table = historyEntry.record_type as RecordType;
  let deleted = 0;
  // Delete in batches of 50
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const { error } = await supabase.from(table as any).delete().in("id", batch);
    if (!error) deleted += batch.length;
  }

  // Remove the history entry
  await supabase.from("import_history" as any).delete().eq("id", historyEntry.id);

  return { deleted };
}

// ── Example CSV generators ────────────────────────────────────────
export function generateExampleCSV(type: RecordType): string {
  if (type === "candidates") {
    return `First Name,Last Name,Email,Phone,Job Title,Current Employer,Location,LinkedIn URL,Salary Expectation,Availability,Source
John,Smith,john@example.com,07700900000,Software Engineer,Acme Corp,London,https://linkedin.com/in/johnsmith,65000,1 month,LinkedIn
Jane,Doe,jane@example.com,07700900001,Product Manager,Tech Ltd,Manchester,,72000,2 weeks,Referral`;
  }
  if (type === "clients") {
    return `Company Name,Contact First Name,Contact Last Name,Email,Phone,LinkedIn URL,Sector
Acme Corp,Bob,Williams,bob@acme.com,02012345678,https://linkedin.com/company/acme,Tech/Digital
Global Inc,Sarah,Jones,sarah@global.com,02087654321,,Finance`;
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

// ── Duplicate detection ───────────────────────────────────────────
export interface DuplicateCandidate {
  id1: string;
  id2: string;
  name: string;
  email1: string | null;
  email2: string | null;
}

export async function detectDuplicateCandidates(): Promise<DuplicateCandidate[]> {
  const { data } = await supabase.from("candidates").select("id, name, email");
  if (!data || data.length < 2) return [];

  const dupes: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const emailPrefix = (e: string | null) => e?.split("@")[0]?.toLowerCase() || "";

  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      const a = data[i], b = data[j];
      const nameMatch = normalize(a.name) === normalize(b.name);
      const emailSimilar = a.email && b.email && (
        a.email.toLowerCase() === b.email.toLowerCase() ||
        emailPrefix(a.email) === emailPrefix(b.email)
      );
      if (nameMatch || emailSimilar) {
        const key = [a.id, b.id].sort().join("-");
        if (!seen.has(key)) {
          seen.add(key);
          dupes.push({ id1: a.id, id2: b.id, name: a.name, email1: a.email, email2: b.email });
        }
      }
    }
  }
  return dupes;
}
