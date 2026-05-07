import { supabase } from "@/integrations/supabase/client";

// ── Field definitions ─────────────────────────────────────────────
export type RecordType = "candidates" | "clients" | "jobs" | "contacts" | "applications";

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

export const CONTACT_FIELDS: FieldDef[] = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: false },
  { key: "_fullname", label: "Full Name (will split)", required: false },
  { key: "job_title", label: "Job Title", required: false },
  { key: "_client_company", label: "Company", required: false },
  { key: "email", label: "Email (Work)", required: false },
  { key: "personal_email", label: "Email (Personal)", required: false },
  { key: "direct_phone", label: "Phone (Work / Direct)", required: false },
  { key: "mobile_phone", label: "Phone (Mobile)", required: false },
  { key: "linkedin_url", label: "LinkedIn URL", required: false },
  { key: "location", label: "Location / City", required: false },
  { key: "status", label: "Status", required: false },
  { key: "_notes", label: "Notes (import as note)", required: false },
];

// Applications / submissions: link a candidate to a job at a stage
export const APPLICATION_FIELDS: FieldDef[] = [
  { key: "candidate_email", label: "Candidate Email", required: false },
  { key: "candidate_name", label: "Candidate Name", required: false },
  { key: "job_title", label: "Job Title", required: true },
  { key: "client_company", label: "Client / Company", required: true },
  { key: "stage", label: "Stage", required: true },
  { key: "submitted_date", label: "Date Submitted", required: false },
  { key: "outcome_notes", label: "Outcome Notes", required: false },
];

export const FIELD_MAP: Record<RecordType, FieldDef[]> = {
  candidates: CANDIDATE_FIELDS,
  clients: CLIENT_FIELDS,
  jobs: JOB_FIELDS,
  contacts: CONTACT_FIELDS,
  applications: APPLICATION_FIELDS,
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
      "Candidate Name": "_fullname", "Full Name": "_fullname",
      "Email": "email", "Mobile": "phone", "Phone": "phone",
      "Current Job Title": "job_title", "Current Employer": "current_employer",
      "City": "location", "Salary": "salary_current",
      "LinkedIn URL": "linkedin_url", "Source": "source", "Status": "status",
      "Notes": "_notes", "Created Date": "_skip", "Last Modified": "_skip",
      // Vincere alternate headers
      "candidate_name": "_fullname", "candidate name": "_fullname",
      "email_address": "email", "mobile": "phone",
      "position_title": "job_title", "company_name": "current_employer",
      "city": "location", "linkedin_profile": "linkedin_url", "salary": "salary_current",
      // Contacts-specific Vincere headers
      "Email (Primary)": "email", "Primary Email": "email", "Work Email": "email",
      "Email (Personal)": "personal_email", "Personal Email": "personal_email",
      "Phone (Primary)": "direct_phone", "Direct Phone": "direct_phone", "Work Phone": "direct_phone",
      "Phone (Mobile)": "mobile_phone", "Mobile Phone": "mobile_phone",
      "Job Title": "job_title",
      "Company Name": "_client_company", "Company": "_client_company", "Client Company": "_client_company",
      "Owner": "_skip", "Consultant": "_skip", "Date Created": "_skip",
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
  "inactive": "Cold",
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

// ── Company fuzzy matching ────────────────────────────────────────
export interface ExistingClientLite { id: string; company_name: string; }

export type CompanyMatchTier = "exact" | "suggested" | "ambiguous" | "none";

export interface CompanyMatchRow {
  rowIndex: number;
  csvCompany: string;
  contactName: string;
  tier: CompanyMatchTier;
  exactClient?: ExistingClientLite;
  suggestion?: ExistingClientLite & { score: number };
  candidates?: (ExistingClientLite & { score: number })[];
}

export interface CompanyMatchPreview {
  autoMatched: CompanyMatchRow[];
  suggested: CompanyMatchRow[];
  unmatched: CompanyMatchRow[];
  rowsWithoutCompany: number;
  totalRows: number;
}

export type CompanyDecisionAction =
  | { kind: "link"; clientId: string }
  | { kind: "create_new" }
  | { kind: "skip" }
  | { kind: "leave_unlinked" };

export type CompanyDecisions = Record<number, CompanyDecisionAction>;

function normaliseCompany(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,'`"()&+]/g, " ")
    .replace(/\b(ltd|limited|inc|incorporated|llc|llp|plc|gmbh|sa|sas|srl|bv|nv|co|company|corp|corporation|group|holdings|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(a: string, b: string): number {
  const na = normaliseCompany(a);
  const nb = normaliseCompany(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  ta.forEach(t => { if (tb.has(t)) overlap++; });
  const union = new Set([...ta, ...tb]).size;
  const jaccard = overlap / union;
  const prefix = na.startsWith(nb) || nb.startsWith(na) ? 0.15 : 0;
  return Math.min(1, jaccard + prefix);
}

export async function previewContactCompanyMatches(
  rows: string[][],
  headers: string[],
  mapping: Record<string, string>,
): Promise<CompanyMatchPreview> {
  const { data } = await supabase.from("clients").select("id, company_name");
  const clients: ExistingClientLite[] = (data || []).map((c: any) => ({ id: c.id, company_name: c.company_name }));
  const byLower: Record<string, ExistingClientLite> = {};
  const byNormalised: Record<string, ExistingClientLite> = {};
  clients.forEach(c => {
    byLower[c.company_name.toLowerCase().trim()] = c;
    const norm = normaliseCompany(c.company_name);
    if (norm) byNormalised[norm] = c;
  });

  const clientHeader = Object.entries(mapping).find(([, v]) => v === "_client_company")?.[0];
  const clientIdx = clientHeader ? headers.indexOf(clientHeader) : -1;
  const fnHeader = Object.entries(mapping).find(([, v]) => v === "first_name")?.[0];
  const lnHeader = Object.entries(mapping).find(([, v]) => v === "last_name")?.[0];
  const fullHeader = Object.entries(mapping).find(([, v]) => v === "_fullname")?.[0];
  const fnIdx = fnHeader ? headers.indexOf(fnHeader) : -1;
  const lnIdx = lnHeader ? headers.indexOf(lnHeader) : -1;
  const fullIdx = fullHeader ? headers.indexOf(fullHeader) : -1;

  const autoMatched: CompanyMatchRow[] = [];
  const suggested: CompanyMatchRow[] = [];
  const unmatched: CompanyMatchRow[] = [];
  let rowsWithoutCompany = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const csvCompany = clientIdx >= 0 ? (row[clientIdx]?.trim() || "") : "";
    const parts: string[] = [];
    if (fnIdx >= 0 && row[fnIdx]?.trim()) parts.push(row[fnIdx].trim());
    if (lnIdx >= 0 && row[lnIdx]?.trim()) parts.push(row[lnIdx].trim());
    let contactName = parts.join(" ");
    if (!contactName && fullIdx >= 0 && row[fullIdx]?.trim()) contactName = row[fullIdx].trim();

    if (!csvCompany) { rowsWithoutCompany++; continue; }

    const lcCompany = csvCompany.toLowerCase().trim();
    if (byLower[lcCompany]) {
      autoMatched.push({ rowIndex: i, csvCompany, contactName, tier: "exact", exactClient: byLower[lcCompany] });
      continue;
    }
    const norm = normaliseCompany(csvCompany);
    if (norm && byNormalised[norm]) {
      autoMatched.push({ rowIndex: i, csvCompany, contactName, tier: "exact", exactClient: byNormalised[norm] });
      continue;
    }

    const scored = clients
      .map(c => ({ ...c, score: similarityScore(csvCompany, c.company_name) }))
      .filter(s => s.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      unmatched.push({ rowIndex: i, csvCompany, contactName, tier: "none" });
    } else if (scored[0].score >= 0.8 && (scored.length === 1 || scored[0].score - scored[1].score >= 0.2)) {
      suggested.push({ rowIndex: i, csvCompany, contactName, tier: "suggested", suggestion: scored[0] });
    } else {
      suggested.push({ rowIndex: i, csvCompany, contactName, tier: "ambiguous", candidates: scored.slice(0, 4) });
    }
  }

  return { autoMatched, suggested, unmatched, rowsWithoutCompany, totalRows: rows.length };
}

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
  contactUnlinkedAction?: "create_client" | "skip" | "import_unlinked",
  companyDecisions?: CompanyDecisions,
): Promise<ImportResult & {
  unmatchedJobs: { id: string; title: string }[];
  unlinkedContacts: { id: string; name: string; companyName: string }[];
  newClientsCreated: number;
  importedIds: string[];
  autoLinkedContacts: number;
  confirmedLinkedContacts: number;
}> {
  const fields = FIELD_MAP[recordType];
  const res: ImportResult = { imported: 0, skipped: 0, updated: 0, errors: [], nameReviewItems: [] };
  const unmatchedJobs: { id: string; title: string }[] = [];
  const unlinkedContacts: { id: string; name: string; companyName: string }[] = [];
  const importedIds: string[] = [];
  let newClientsCreated = 0;
  let autoLinkedContacts = 0;
  let confirmedLinkedContacts = 0;

  const hasFullnameMapping = Object.values(mapping).includes("_fullname") || Object.values(mapping).includes("_contact_fullname");

  let existingEmails: Record<string, string> = {};
  if ((recordType === "candidates" || recordType === "clients" || recordType === "contacts") && Object.values(mapping).includes("email")) {
    const { data } = await supabase.from(recordType as any).select("id, email");
    (data || []).forEach((c: any) => { if (c.email) existingEmails[c.email.toLowerCase()] = c.id; });
  }

  // For contacts: also check personal_email for dedup
  let existingPersonalEmails: Record<string, string> = {};
  if (recordType === "contacts") {
    const { data } = await supabase.from("contacts").select("id, personal_email");
    (data || []).forEach((c: any) => { if (c.personal_email) existingPersonalEmails[c.personal_email.toLowerCase()] = c.id; });
  }

  // For contacts: also need name+company combination dedup
  let existingNameCompany: Record<string, string> = {};
  if (recordType === "contacts") {
    const { data } = await supabase.from("contacts").select("id, name, client_id");
    (data || []).forEach((c: any) => {
      if (c.name) {
        const key = `${c.name.toLowerCase().trim()}|${c.client_id || ""}`;
        existingNameCompany[key] = c.id;
      }
    });
  }

  let clientLookup: Record<string, string> = {};
  if (recordType === "jobs" || recordType === "contacts") {
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

    // Resolve client linking for contacts
    let companyName = "";
    let unlinked = false;
    if (recordType === "contacts") {
      const clientHeader = Object.entries(mapping).find(([, v]) => v === "_client_company")?.[0];
      if (clientHeader) {
        const clientIdx = headers.indexOf(clientHeader);
        companyName = clientIdx >= 0 ? (row[clientIdx]?.trim() || "") : "";
        const lcCompany = companyName.toLowerCase();

        // 1. Check explicit per-row decision from preview screen
        const decision = companyDecisions?.[i];
        if (decision) {
          if (decision.kind === "skip") {
            res.skipped++;
            res.errors.push({ row: i + 2, reason: `Skipped — no client match for "${companyName}"`, data: record });
            continue;
          }
          if (decision.kind === "link") {
            record.client_id = decision.clientId;
            // If exact match by lowercase => auto-linked, otherwise => confirmed
            if (lcCompany && clientLookup[lcCompany] === decision.clientId) {
              autoLinkedContacts++;
            } else {
              confirmedLinkedContacts++;
            }
          } else if (decision.kind === "create_new") {
            // Re-use already-created client if same company appeared earlier in this run
            if (lcCompany && clientLookup[lcCompany]) {
              record.client_id = clientLookup[lcCompany];
            } else {
              const { data: newClient, error: ccErr } = await supabase
                .from("clients")
                .insert({ company_name: companyName, status: "Target" } as any)
                .select("id")
                .single();
              if (!ccErr && newClient) {
                record.client_id = newClient.id;
                if (lcCompany) clientLookup[lcCompany] = newClient.id;
                newClientsCreated++;
              } else {
                unlinked = true;
              }
            }
          } else if (decision.kind === "leave_unlinked") {
            unlinked = true;
          }
        } else if (lcCompany && clientLookup[lcCompany]) {
          // 2. Fall back to direct exact match (no decision provided)
          record.client_id = clientLookup[lcCompany];
          autoLinkedContacts++;
        } else if (companyName) {
          // 3. Legacy bulk action fallback
          if (contactUnlinkedAction === "skip") {
            res.skipped++;
            res.errors.push({ row: i + 2, reason: `No matching client for "${companyName}" — skipped`, data: record });
            continue;
          } else if (contactUnlinkedAction === "create_client") {
            const { data: newClient, error: ccErr } = await supabase
              .from("clients")
              .insert({ company_name: companyName, status: "Target" } as any)
              .select("id")
              .single();
            if (!ccErr && newClient) {
              record.client_id = newClient.id;
              clientLookup[lcCompany] = newClient.id;
              newClientsCreated++;
            } else {
              unlinked = true;
            }
          } else {
            unlinked = true;
          }
        }
      }
      // Contacts table requires client_id (NOT NULL). If still none, skip with clear error.
      if (!record.client_id) {
        res.skipped++;
        res.errors.push({
          row: i + 2,
          reason: companyName
            ? `Could not link to client "${companyName}" — choose 'Create new clients' to import these`
            : "No company name provided — contacts must link to a client",
          data: record,
        });
        continue;
      }
    }

    const email = record.email?.toLowerCase();
    const personalEmail = recordType === "contacts" ? record.personal_email?.toLowerCase() : null;

    // Duplicate detection
    let dupId: string | null = null;
    let dupReason = "Duplicate email";
    if (email && existingEmails[email]) {
      dupId = existingEmails[email];
    } else if (personalEmail && existingPersonalEmails[personalEmail]) {
      dupId = existingPersonalEmails[personalEmail];
      dupReason = "Duplicate personal email";
    } else if (recordType === "contacts" && record.name && record.client_id) {
      const key = `${record.name.toLowerCase().trim()}|${record.client_id}`;
      if (existingNameCompany[key]) {
        dupId = existingNameCompany[key];
        dupReason = "Duplicate name + company";
      }
    }

    if (dupId) {
      if (duplicateAction === "skip") {
        res.skipped++;
        res.errors.push({ row: i + 2, reason: `${dupReason} — skipped`, data: record });
        continue;
      } else {
        const { email: _e, personal_email: _pe, ...updateData } = record;
        const { error } = await supabase.from(recordType as any).update(updateData as any).eq("id", dupId);
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
      if (personalEmail) existingPersonalEmails[personalEmail] = inserted.id;
      if (recordType === "jobs" && !record.client_id && inserted) {
        unmatchedJobs.push({ id: inserted.id, title: record.title });
      }
      if (recordType === "contacts" && unlinked && inserted) {
        unlinkedContacts.push({ id: inserted.id, name: record.name || "(unnamed)", companyName });
      }

      // Insert notes if present
      if (notesContent && (recordType === "candidates" || recordType === "contacts")) {
        const { data: { user } } = await supabase.auth.getUser();
        const noteRow: any = {
          content: notesContent,
          activity_type: "Note",
          outcome: `Imported from ${platformLabel}`,
          owner_user_id: user?.id,
        };
        if (recordType === "candidates") noteRow.candidate_id = inserted.id;
        else if (recordType === "contacts") noteRow.client_id = record.client_id;
        await supabase.from("notes").insert(noteRow);
      }
    }
  }

  return { ...res, unmatchedJobs, unlinkedContacts, newClientsCreated, importedIds, autoLinkedContacts, confirmedLinkedContacts };
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
  if (type === "contacts") {
    return `First Name,Last Name,Job Title,Company Name,Email (Primary),Email (Personal),Phone (Primary),Phone (Mobile),LinkedIn URL,Location,Status
Alice,Brown,Head of Talent,Acme Corp,alice@acme.com,alice.b@gmail.com,02012345678,07700900100,https://linkedin.com/in/alicebrown,London,Active
David,Lee,VP Engineering,Global Inc,david@global.com,,02087654321,07700900200,,Remote,Active`;
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
