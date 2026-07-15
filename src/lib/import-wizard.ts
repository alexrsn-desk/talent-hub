// World-class CSV import wizard helpers.
// Wraps existing primitives in src/lib/csv-import.ts with:
//  • XLSX support
//  • Source auto-detection
//  • Preview filters (status, last activity, contact, job title)
//  • Smart duplicate handling (only overwrite empty fields)
//  • Notes import + signal detection trigger for long notes
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  RecordType, FieldDef, FIELD_MAP, BUILT_IN_TEMPLATES, autoMapHeaders,
  parseCSV, buildRecord, splitFullName, ImportError,
} from "./csv-import";

// ── File parsing ──────────────────────────────────────────────────
export async function parseFile(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const arr = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: "" });
    if (!arr.length) return { headers: [], rows: [] };
    const headers = (arr[0] as any[]).map(h => String(h ?? "").trim());
    const rows = arr.slice(1).map(r => (r as any[]).map(c => (c == null ? "" : String(c)).trim()));
    return { headers, rows };
  }
  const text = await file.text();
  return parseCSV(text);
}

// ── Source detection ──────────────────────────────────────────────
export type SourceKey =
  | "vincere" | "sourcewhale" | "bullhorn" | "loxo" | "jobadder"
  | "recruitee" | "linkedin" | "spreadsheet" | "unknown";

export interface SourceDetection {
  source: SourceKey;
  label: string;
  confidence: "high" | "medium" | "low";
  message: string;
}

// Signature columns per known CRM export — deterministic detection.
// Works identically with any LLM downstream since it runs client-side.
const SIGNATURES: Array<{ source: SourceKey; label: string; markers: string[]; min: number }> = [
  { source: "sourcewhale", label: "SourceWhale",
    markers: ["campaign", "role / job title", "role/job title", "sourced", "sourcer", "opens", "sequence", "step", "outreach"], min: 3 },
  { source: "vincere", label: "Vincere",
    markers: ["candidate name", "first name", "last name", "current job title", "current employer", "availability", "consultant"], min: 3 },
  { source: "bullhorn", label: "Bullhorn",
    markers: ["firstname", "lastname", "title", "employername", "primaryemail", "companyname", "linkedinurl", "dateadded"], min: 3 },
  { source: "loxo", label: "Loxo",
    markers: ["first", "last", "position", "organization", "email address", "loxo id"], min: 3 },
  { source: "jobadder", label: "JobAdder",
    markers: ["given name", "family name", "current position", "current employer", "mobile phone", "email address"], min: 3 },
  { source: "linkedin", label: "LinkedIn Connections",
    markers: ["connected on", "url", "first name", "last name", "company", "position", "email address"], min: 3 },
  { source: "recruitee", label: "Recruitee",
    markers: ["recruitee", "candidate source"], min: 1 },
];

export function detectSource(
  headers: string[],
  savedTemplates: Array<{ name: string; mapping: Record<string, string> }> = [],
): SourceDetection & { savedTemplateName?: string } {
  const lc = headers.map(h => h.toLowerCase().trim());

  // Saved user templates take priority — if 70%+ of the saved template's
  // headers appear in this file, auto-apply it.
  for (const tpl of savedTemplates) {
    const tplHeaders = Object.keys(tpl.mapping).filter(h => tpl.mapping[h] && tpl.mapping[h] !== "_skip");
    if (tplHeaders.length < 3) continue;
    const overlap = tplHeaders.filter(h => headers.includes(h)).length;
    if (overlap / tplHeaders.length >= 0.7) {
      return {
        source: "unknown", label: tpl.name, confidence: "high",
        message: `Recognised your saved format "${tpl.name}" — columns auto-mapped.`,
        savedTemplateName: tpl.name,
      };
    }
  }

  let best: { source: SourceKey; label: string; score: number } | null = null;
  for (const sig of SIGNATURES) {
    const score = sig.markers.filter(m => lc.some(h => h === m || h.includes(m))).length;
    if (score >= sig.min && (!best || score > best.score)) {
      best = { source: sig.source, label: sig.label, score };
    }
  }
  if (best) {
    const conf: "high" | "medium" | "low" = best.score >= 5 ? "high" : best.score >= 4 ? "medium" : "low";
    return {
      source: best.source, label: best.label, confidence: conf,
      message: `This looks like a ${best.label} export. We've automatically mapped all columns.`,
    };
  }
  return {
    source: "unknown", label: "Custom format", confidence: "low",
    message: "We don't recognise this format, but we've mapped columns as best we can. Please review before importing.",
  };
}

// ── Fuzzy fallback for unknown formats ────────────────────────────
// Substring rules used when no built-in template matches a header.
const FUZZY_RULES: Array<{ patterns: string[]; field: string; recordTypes?: RecordType[] }> = [
  { patterns: ["first", "forename", "given"], field: "first_name" },
  { patterns: ["last", "surname", "family"], field: "last_name" },
  { patterns: ["full name", "fullname", "candidate name", "contact name", "name"], field: "_fullname" },
  { patterns: ["e-mail", "email", "mail"], field: "email" },
  { patterns: ["personal email", "personal mail"], field: "personal_email", recordTypes: ["contacts"] },
  { patterns: ["mobile", "cell"], field: "mobile_phone", recordTypes: ["contacts"] },
  { patterns: ["direct", "work phone", "office phone"], field: "direct_phone", recordTypes: ["contacts"] },
  { patterns: ["phone", "tel", "mobile", "number"], field: "phone" },
  { patterns: ["linkedin", "li_url", "li url", "profile url"], field: "linkedin_url" },
  { patterns: ["title", "role", "position", "job"], field: "job_title" },
  { patterns: ["company", "employer", "organisation", "organization", "firm"], field: "current_employer" },
  { patterns: ["location", "city", "town", "region"], field: "location" },
  { patterns: ["salary", "package", "compensation", "comp"], field: "salary_current" },
  { patterns: ["notice", "availability", "available"], field: "availability" },
  { patterns: ["status", "stage", "state"], field: "status" },
  { patterns: ["source", "origin", "lead source", "how found"], field: "source" },
  { patterns: ["note", "comment", "activity"], field: "_notes" },
  { patterns: ["campaign", "tag"], field: "_skip" }, // no tag import path yet
];

function fuzzyMapHeader(header: string, fields: FieldDef[], recordType: RecordType): string | null {
  const lc = header.toLowerCase().trim();
  for (const rule of FUZZY_RULES) {
    if (rule.recordTypes && !rule.recordTypes.includes(recordType)) continue;
    if (rule.patterns.some(p => lc.includes(p))) {
      if (rule.field === "_skip" || rule.field.startsWith("_")) return rule.field;
      if (fields.some(f => f.key === rule.field)) return rule.field;
    }
  }
  return null;
}

// ── Platform → mapping ───────────────────────────────────────────
export function mappingForSource(
  source: SourceKey,
  headers: string[],
  recordType: RecordType,
): Record<string, string> {
  const fields = FIELD_MAP[recordType];
  const platformKey = source === "sourcewhale" ? "spreadsheet" : source === "unknown" ? undefined : source;
  const auto = autoMapHeaders(headers, fields, platformKey);

  // SourceWhale-specific mapping (spec-defined)
  if (source === "sourcewhale") {
    const sw: Record<string, string> = {
      "first name": "first_name", "last name": "last_name", "full name": "_fullname",
      "emails": "email", "email": "email", "personal email": "email",
      "phone": "phone", "mobile": "phone",
      "role / job title": "job_title", "role/job title": "job_title", "title": "job_title", "job title": "job_title",
      "company": "current_employer", "current company": "current_employer",
      "linkedin url": "linkedin_url", "linkedin": "linkedin_url", "profile url": "linkedin_url",
      "location (city)": "location", "location": "location",
      "stage": "status", "status": "status",
      "source": "source",
      "notes": "_notes",
      // explicitly ignored SourceWhale columns
      "facebook url": "_skip", "linkedin recruiter url": "_skip",
      "country": "_skip", "state": "_skip", "school": "_skip",
      "opens": "_skip", "sourced": "_skip", "sourcer": "_skip",
      "campaign": "_skip", // no tag import path yet
      "skills": "_skip",
    };
    for (const h of headers) {
      if (auto[h]) continue;
      const key = sw[h.toLowerCase().trim()];
      if (key) auto[h] = key;
    }
  }

  // Fuzzy fallback for anything still unmapped
  for (const h of headers) {
    if (auto[h]) continue;
    const guess = fuzzyMapHeader(h, fields, recordType);
    if (guess) auto[h] = guess;
  }

  return auto;
}

// ── Status mapping (per-source) ───────────────────────────────────
const STATUS_MAP_VINCERE: Record<string, string> = {
  "active": "Active", "available": "Active",
  "placed": "Cold", "do not contact": "Do Not Contact",
  "registered": "Passive", "passive": "Passive",
  "inactive": "Cold", "archived": "Cold", "archive": "Cold",
};
const STATUS_MAP_SOURCEWHALE: Record<string, string> = {
  "replied": "Active", "interested": "Active",
  "sent": "Passive", "opened": "Passive", "clicked": "Passive",
  "connected": "LI Connection",
  "not interested": "Cold", "bounced": "Cold",
  "unsubscribed": "Do Not Contact",
};
const STATUS_MAP_GENERIC: Record<string, string> = {
  "active": "Active", "passive": "Passive", "cold": "Cold",
  "new": "Active", "do not contact": "Do Not Contact", "dnc": "Do Not Contact",
  "placed": "Cold", "li connection": "LI Connection", "linkedin connection": "LI Connection",
};

export function mapWizardStatus(raw: string | null | undefined, source: SourceKey): string {
  const v = (raw || "").toLowerCase().trim();
  if (!v) return source === "sourcewhale" ? "Passive" : "Passive";
  const map = source === "vincere" ? STATUS_MAP_VINCERE
    : source === "sourcewhale" ? STATUS_MAP_SOURCEWHALE
    : STATUS_MAP_GENERIC;
  return map[v] || STATUS_MAP_GENERIC[v] || (source === "sourcewhale" ? "Passive" : "Passive");
}


// ── Desky fields exposed in the wizard mapping UI ─────────────────
export interface DeskyField { key: string; label: string; required?: boolean }

export const WIZARD_FIELDS: Record<RecordType, DeskyField[]> = {
  candidates: [
    { key: "first_name", label: "First Name", required: false },
    { key: "last_name", label: "Last Name", required: false },
    { key: "_fullname", label: "Full Name (will split)" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "job_title", label: "Current Job Title" },
    { key: "current_employer", label: "Current Employer" },
    { key: "location", label: "Location" },
    { key: "salary_current", label: "Current Salary" },
    { key: "salary_expectation", label: "Salary Expectation" },
    { key: "availability", label: "Notice Period" },
    { key: "linkedin_url", label: "LinkedIn URL" },
    { key: "status", label: "Status" },
    { key: "_notes", label: "Notes" },
    { key: "source", label: "Source" },
  ],
  contacts: [
    { key: "first_name", label: "First Name", required: false },
    { key: "last_name", label: "Last Name", required: false },
    { key: "_fullname", label: "Full Name (will split)" },
    { key: "email", label: "Email (Work)" },
    { key: "personal_email", label: "Email (Personal)" },
    { key: "direct_phone", label: "Phone (Work)" },
    { key: "mobile_phone", label: "Phone (Mobile)" },
    { key: "job_title", label: "Job Title" },
    { key: "_client_company", label: "Company" },
    { key: "linkedin_url", label: "LinkedIn URL" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status" },
    { key: "_notes", label: "Notes" },
  ],
  jobs: [
    { key: "title", label: "Job Title", required: true },
    { key: "_client_company", label: "Client Company" },
    { key: "location", label: "Location" },
    { key: "salary_min", label: "Salary Min" },
    { key: "salary_max", label: "Salary Max" },
    { key: "job_type", label: "Job Type" },
    { key: "status", label: "Status" },
    { key: "date_opened", label: "Date Opened" },
    { key: "fee_value", label: "Fee %" },
  ],
  clients: [
    { key: "company_name", label: "Company Name", required: true },
    { key: "sector", label: "Sector" },
    { key: "status", label: "Status" },
    { key: "linkedin_url", label: "LinkedIn URL" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
  ],
  applications: FIELD_MAP.applications.map(f => ({ key: f.key, label: f.label, required: f.required })),
};

// ── Preview filters ───────────────────────────────────────────────
export interface WizardFilters {
  statuses: { active: boolean; passive: boolean; inactive: boolean; unknown: boolean };
  lastActivity: "all" | "6m" | "12m" | "all_time"; // 'all'=current, 'all_time'=unlimited
  requireContact: boolean;
  requireJobTitle: boolean;
}

export const DEFAULT_FILTERS: WizardFilters = {
  statuses: { active: true, passive: true, inactive: true, unknown: true },
  lastActivity: "all_time",
  // Permissive by default — a name is all that's required to import.
  requireContact: false,
  requireJobTitle: false,
};

export interface PreviewStats {
  total: number;
  validName: number;
  hasContact: number;
  emptyRows: number;
  willImport: number;
}

// Quickly extract a "cleaned record" for filter/preview purposes
function recordForRow(row: string[], headers: string[], mapping: Record<string, string>, source: SourceKey) {
  const rec = buildRecord(row, headers, mapping);
  // Handle full-name fallback if first/last missing
  if (!rec.first_name && !rec.last_name && rec.name) {
    const { first, last } = splitFullName(rec.name);
    rec.first_name = first || null;
    rec.last_name = last || null;
  }
  // Normalise status using wizard logic
  rec.status = mapWizardStatus(rec.status, source);
  return rec;
}

function rowIsBlankOrCorrupt(row: string[]): boolean {
  if (!row || row.length === 0) return true;
  const nonEmpty = row.filter(c => c && String(c).trim()).length;
  return nonEmpty === 0;
}

export interface RowMeta { record: any; reason?: string }

export function evaluateRows(
  rows: string[][],
  headers: string[],
  mapping: Record<string, string>,
  source: SourceKey,
  filters: WizardFilters,
  recordType: RecordType,
): { stats: PreviewStats; rowMeta: RowMeta[] } {
  const rowMeta: RowMeta[] = [];
  let validName = 0, hasContact = 0, emptyRows = 0, willImport = 0;

  for (const row of rows) {
    if (rowIsBlankOrCorrupt(row)) { emptyRows++; rowMeta.push({ record: null, reason: "empty" }); continue; }
    const rec = recordForRow(row, headers, mapping, source);

    const nameOk = recordType === "clients"
      ? !!(rec.company_name)
      : !!(rec.first_name || rec.last_name || rec.name);
    const contactOk = !!(rec.email || rec.phone || rec.mobile_phone || rec.direct_phone || rec.personal_email);
    const titleOk = !!(rec.job_title || rec.title);

    if (!nameOk) { emptyRows++; rowMeta.push({ record: rec, reason: "no_name" }); continue; }
    validName++;
    if (contactOk) hasContact++;

    // Status filter (candidates/contacts only)
    if (recordType === "candidates" || recordType === "contacts") {
      const st = (rec.status || "Passive") as string;
      const map = {
        Active: filters.statuses.active, Passive: filters.statuses.passive,
        Cold: filters.statuses.inactive, "Do Not Contact": filters.statuses.inactive,
        "LI Connection": filters.statuses.passive,
      } as Record<string, boolean>;
      const allowed = st in map ? map[st] : filters.statuses.unknown;
      if (!allowed) { rowMeta.push({ record: rec, reason: "filter_status" }); continue; }
    }

    if (filters.requireContact && !contactOk) {
      rowMeta.push({ record: rec, reason: "no_contact" }); continue;
    }
    if (filters.requireJobTitle && recordType !== "clients" && !titleOk) {
      rowMeta.push({ record: rec, reason: "no_title" }); continue;
    }

    // last activity filter — best-effort: look for updated/modified/last contacted fields
    if (filters.lastActivity !== "all_time" && filters.lastActivity !== "all") {
      const months = filters.lastActivity === "6m" ? 6 : 12;
      const cutoff = Date.now() - months * 30 * 24 * 3600 * 1000;
      const dateKeys = ["last_modified", "last_activity", "modified_date", "updated_at", "last_contacted"];
      let dateVal: number | null = null;
      for (const h of headers) {
        if (dateKeys.includes(h.toLowerCase().replace(/\s+/g, "_"))) {
          const idx = headers.indexOf(h);
          const raw = row[idx];
          if (raw) {
            const t = Date.parse(raw);
            if (!isNaN(t)) { dateVal = t; break; }
          }
        }
      }
      if (dateVal != null && dateVal < cutoff) {
        rowMeta.push({ record: rec, reason: "filter_activity" }); continue;
      }
    }

    willImport++;
    rowMeta.push({ record: rec });
  }

  return {
    stats: { total: rows.length, validName, hasContact, emptyRows, willImport },
    rowMeta,
  };
}

// ── Duplicate detection ───────────────────────────────────────────
export interface DupePreview { duplicates: number; new: number; matchKeys: Map<number, string> }

export async function previewDuplicates(
  rowMeta: RowMeta[],
  recordType: RecordType,
): Promise<DupePreview> {
  const matchKeys = new Map<number, string>();
  if (recordType === "jobs" || recordType === "clients") {
    return { duplicates: 0, new: rowMeta.filter(r => r.record && !r.reason).length, matchKeys };
  }

  const table = recordType === "candidates" ? "candidates" : "contacts";
  const { data } = await supabase.from(table as any).select("id, email, first_name, last_name, name, current_employer").limit(50000);

  const byEmail = new Map<string, string>();
  const byNameEmployer = new Map<string, string>();
  (data || []).forEach((c: any) => {
    if (c.email) byEmail.set(c.email.toLowerCase().trim(), c.id);
    const fn = (c.first_name || "").toLowerCase().trim();
    const ln = (c.last_name || "").toLowerCase().trim();
    const emp = (c.current_employer || "").toLowerCase().trim();
    if (fn && ln && emp) byNameEmployer.set(`${fn}|${ln}|${emp}`, c.id);
  });

  let dupes = 0, neu = 0;
  rowMeta.forEach((m, idx) => {
    if (!m.record || m.reason) return;
    const r = m.record;
    let key: string | undefined;
    if (r.email) {
      const e = String(r.email).toLowerCase().trim();
      if (byEmail.has(e)) key = byEmail.get(e);
    }
    if (!key) {
      const fn = (r.first_name || "").toLowerCase().trim();
      const ln = (r.last_name || "").toLowerCase().trim();
      const emp = (r.current_employer || "").toLowerCase().trim();
      if (fn && ln && emp) key = byNameEmployer.get(`${fn}|${ln}|${emp}`);
    }
    if (key) { dupes++; matchKeys.set(idx, key); } else { neu++; }
  });

  return { duplicates: dupes, new: neu, matchKeys };
}

// ── Smart import (only overwrites empty fields) ───────────────────
export type DuplicateMode = "skip" | "update" | "create";

export interface WizardImportResult {
  imported: number;
  updated: number;
  skippedEmpty: number;
  skippedNoContact: number;
  skippedDup: number;
  failed: number;
  /** Records imported without any email or phone — flagged for later follow-up. */
  importedNoContact: number;
  errors: ImportError[];
  importedIds: string[];
  source: string;
}

export async function runWizardImport(opts: {
  recordType: RecordType;
  rowMeta: RowMeta[];
  source: SourceKey;
  sourceLabel: string;
  dupMode: DuplicateMode;
  matchKeys: Map<number, string>;
  filters: WizardFilters;
  onProgress?: (i: number, total: number) => void;
}): Promise<WizardImportResult> {
  const { recordType, rowMeta, source, sourceLabel, dupMode, matchKeys, onProgress } = opts;
  const res: WizardImportResult = {
    imported: 0, updated: 0, skippedEmpty: 0, skippedNoContact: 0, skippedDup: 0,
    failed: 0, importedNoContact: 0, errors: [], importedIds: [], source: sourceLabel,
  };

  const toImport = rowMeta.map((m, idx) => ({ m, idx }));
  for (let i = 0; i < toImport.length; i++) {
    const { m, idx } = toImport[i];
    onProgress?.(i + 1, toImport.length);

    if (!m.record) { res.skippedEmpty++; continue; }
    if (m.reason === "empty" || m.reason === "no_name") { res.skippedEmpty++; continue; }
    if (m.reason === "no_contact") { res.skippedNoContact++; continue; }
    if (m.reason) { res.skippedEmpty++; continue; }

    const rec: any = { ...m.record };
    const notesContent = rec._notes_content;
    delete rec._notes_content;

    // Ensure status always set
    if (recordType === "candidates" || recordType === "contacts") {
      rec.status = rec.status || "Passive";
    }
    if (!rec.source && (recordType === "candidates")) rec.source = sourceLabel;

    const dupId = matchKeys.get(idx);
    try {
      if (dupId) {
        if (dupMode === "skip") { res.skippedDup++; continue; }
        if (dupMode === "update") {
          // Smart update: fetch existing, only overwrite empties
          const { data: existing } = await supabase.from(recordType as any).select("*").eq("id", dupId).maybeSingle();
          const patch: any = {};
          for (const [k, v] of Object.entries(rec)) {
            if (v == null || v === "") continue;
            if (k === "id" || k === "created_at" || k === "updated_at") continue;
            const cur = (existing as any)?.[k];
            if (cur == null || cur === "" || (typeof cur === "number" && cur === 0)) {
              patch[k] = v;
            }
          }
          if (Object.keys(patch).length > 0) {
            const { error } = await supabase.from(recordType as any).update(patch).eq("id", dupId);
            if (error) { res.failed++; res.errors.push({ row: idx + 2, reason: error.message, data: rec }); continue; }
          }
          res.updated++;
          await maybeInsertNote(recordType, dupId, notesContent, sourceLabel);
          continue;
        }
        // dupMode === "create" falls through to insert
      }

      const { data: inserted, error } = await (supabase.from(recordType as any).insert(rec).select("id").single() as any);
      if (error) { res.failed++; res.errors.push({ row: idx + 2, reason: error.message, data: rec }); continue; }
      res.imported++;
      res.importedIds.push(inserted.id);
      if (recordType === "candidates" || recordType === "contacts") {
        const hasContact = !!(rec.email || rec.phone || rec.personal_email || rec.direct_phone || rec.mobile_phone);
        if (!hasContact) res.importedNoContact++;
      }
      await maybeInsertNote(recordType, inserted.id, notesContent, sourceLabel);
    } catch (e: any) {
      res.failed++;
      res.errors.push({ row: idx + 2, reason: e?.message || "Unknown error", data: rec });
    }
  }

  return res;
}

async function maybeInsertNote(
  recordType: RecordType,
  recordId: string,
  content: string | undefined | null,
  source: string,
) {
  if (!content || !String(content).trim()) return;
  if (recordType !== "candidates" && recordType !== "contacts") return;
  const trimmed = String(content).trim();
  const { data: { user } } = await supabase.auth.getUser();
  const noteRow: any = {
    content: trimmed,
    activity_type: "Note",
    outcome: `Imported from ${source}`,
    owner_user_id: user?.id,
  };
  if (recordType === "candidates") noteRow.candidate_id = recordId;
  else {
    // contact's note links via candidate_id is not valid; insert against client if available
    return;
  }
  const { data: noteInserted } = await supabase.from("notes").insert(noteRow).select("id").single();
  if (noteInserted && trimmed.length >= 200) {
    // Fire-and-forget signal detection on long imported notes
    supabase.functions.invoke("detect-signals", { body: { note_id: (noteInserted as any).id } }).catch(() => {});
  }
}

// ── Saved mapping templates (per record type) ─────────────────────
const TEMPLATE_LS_KEY = "desky_wizard_templates_v1";

export interface SavedTemplate {
  id: string;
  name: string;
  recordType: RecordType;
  source: SourceKey;
  mapping: Record<string, string>;
  createdAt: string;
}

export function loadSavedTemplates(): SavedTemplate[] {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_LS_KEY) || "[]"); } catch { return []; }
}
export function saveTemplate(t: Omit<SavedTemplate, "id" | "createdAt">): SavedTemplate {
  const list = loadSavedTemplates();
  const item: SavedTemplate = { ...t, id: `tpl_${Date.now()}`, createdAt: new Date().toISOString() };
  list.unshift(item);
  localStorage.setItem(TEMPLATE_LS_KEY, JSON.stringify(list.slice(0, 50)));
  return item;
}
export function deleteSavedTemplate(id: string) {
  const list = loadSavedTemplates().filter(t => t.id !== id);
  localStorage.setItem(TEMPLATE_LS_KEY, JSON.stringify(list));
}

// ── Desky template CSV ────────────────────────────────────────────
export function downloadDeskyTemplate(recordType: RecordType) {
  const fields = WIZARD_FIELDS[recordType].filter(f => !f.key.startsWith("_"));
  const headers = fields.map(f => f.label);
  const example: Record<string, string> = recordType === "candidates" ? {
    "First Name": "Jane", "Last Name": "Doe", "Email": "jane@example.com",
    "Phone": "07700900000", "Current Job Title": "Software Engineer",
    "Current Employer": "Acme Corp", "Location": "London",
    "Current Salary": "65000", "Salary Expectation": "75000",
    "Notice Period": "1 month", "LinkedIn URL": "https://linkedin.com/in/janedoe",
    "Status": "Active", "Source": "Referral",
  } : recordType === "contacts" ? {
    "First Name": "Alice", "Last Name": "Brown", "Email (Work)": "alice@acme.com",
    "Phone (Mobile)": "07700900100", "Job Title": "Head of Talent",
    "Company": "Acme Corp", "Location": "London", "Status": "Active",
  } : recordType === "jobs" ? {
    "Job Title": "Senior Developer", "Client Company": "Acme Corp",
    "Location": "London", "Salary Min": "70000", "Salary Max": "90000",
    "Job Type": "Perm", "Status": "Active", "Date Opened": "2026-06-15", "Fee %": "20",
  } : {
    "Company Name": "Acme Corp", "Sector": "Tech", "Status": "Active",
  };
  const exampleRow = headers.map(h => example[h] ?? "");
  const csv = [headers.join(","), exampleRow.map(c => `"${c}"`).join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `desky-${recordType}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadErrorLog(errors: ImportError[]) {
  const lines = ["Row,Reason,Data"];
  errors.forEach(e => {
    lines.push(`${e.row},"${e.reason.replace(/"/g, '""')}","${JSON.stringify(e.data).replace(/"/g, '""')}"`);
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `import-errors-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
