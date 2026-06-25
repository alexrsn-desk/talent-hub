// Public webhook receiver for Zapier/Vincere candidate payloads.
// POST JSON with optional x-webhook-key header. If x-webhook-key matches a
// row in webhook_settings.secret_key, the inserted candidate is owned by
// that user. Otherwise, owner_user_id may be passed in the body.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

// Recursively search a payload for the first value at any matching key (case-insensitive).
// Supports nested objects and arrays so we can dig through Vincere's raw envelopes.
function deepFind(
  data: unknown,
  keys: string[],
  predicate: (v: unknown) => boolean = (v) =>
    (typeof v === "string" && v.trim().length > 0) || typeof v === "number",
  depth = 0,
): unknown {
  if (data == null || depth > 6) return undefined;
  const wanted = keys.map((k) => k.toLowerCase());
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = deepFind(item, keys, predicate, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    // direct hits first
    for (const [k, v] of Object.entries(obj)) {
      if (wanted.includes(k.toLowerCase()) && predicate(v)) return v;
    }
    // then recurse
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") {
        const found = deepFind(v, keys, predicate, depth + 1);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return undefined;
}

function asTitleString(v: unknown): string | undefined {
  const direct = asString(v);
  if (direct) return direct;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const key of ["job_title", "jobTitle", "title", "text", "value", "name", "label", "position"]) {
      const nested = asString(o[key]);
      if (nested) return nested;
    }
  }
  return undefined;
}

function deepFindByPriority(data: unknown, keyGroups: string[][]): string | undefined {
  for (const keys of keyGroups) {
    const found = asTitleString(deepFind(data, keys, (v) => asTitleString(v) !== undefined));
    if (found) return found;
  }
  return undefined;
}

function directFindByPriority(data: unknown, keyGroups: string[][]): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const obj = data as Record<string, unknown>;
  for (const keys of keyGroups) {
    const wanted = keys.map((k) => k.toLowerCase());
    for (const [k, v] of Object.entries(obj)) {
      if (wanted.includes(k.toLowerCase())) {
        const found = asTitleString(v);
        if (found) return found;
      }
    }
  }
  return undefined;
}

function parseHistoryDate(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

// Extract a numeric salary from numbers, strings ("$95,000 per year"), or objects ({amount, currency}).
function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const m = v.replace(/[, ]/g, "").match(/-?\d+(\.\d+)?/);
    if (m) return Math.round(parseFloat(m[0]));
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["amount", "value", "salary", "min", "from"]) {
      const n = asNumber(o[k]);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

// Pull the current/most-recent employer from work-history arrays if no flat field exists.
function findEmployerFromHistory(data: unknown): string | undefined {
  const history = deepFind(
    data,
    ["work_experience", "workExperience", "experience", "employmentHistory", "employment_history", "positions", "jobs"],
    (v) => Array.isArray(v) && v.length > 0,
  ) as unknown[] | undefined;
  if (!Array.isArray(history)) return undefined;
  // Prefer current role (no end_date / current flag), else first entry.
  const current =
    history.find((h) => {
      if (!h || typeof h !== "object") return false;
      const o = h as Record<string, unknown>;
      return o.current === true || o.is_current === true || o.endDate == null && o.end_date == null && (o.company || o.employer || o.companyName);
    }) ?? history[0];
  if (current && typeof current === "object") {
    const o = current as Record<string, unknown>;
    return (
      asString(o.company) ??
      asString(o.companyName) ??
      asString(o.company_name) ??
      asString(o.employer) ??
      asString(o.organisation) ??
      asString(o.organization)
    );
  }
  return undefined;
}

// Pull the current/most-recent job title from work-history arrays.
// Vincere often stores titles inside work_history[*].job_title rather than a flat field.
function findJobTitleFromHistory(data: unknown): string | undefined {
  const history = deepFind(
    data,
    [
      "work_history", "workHistory",
      "work_experience", "workExperience",
      "employment_history", "employmentHistory",
      "experience", "experiences",
      "positions", "jobs", "roles",
    ],
    (v) => Array.isArray(v) && v.length > 0,
  ) as unknown[] | undefined;
  if (!Array.isArray(history) || history.length === 0) return undefined;

  const titleOf = (h: unknown): string | undefined => {
    if (!h || typeof h !== "object") return undefined;
    const o = h as Record<string, unknown>;
    return (
      asTitleString(o.job_title) ??
      asTitleString(o.jobTitle) ??
      asTitleString(o.current_job_title) ??
      asTitleString(o.currentJobTitle) ??
      asTitleString(o.title) ??
      asTitleString(o.position) ??
      asTitleString(o.role) ??
      asTitleString(o.positionTitle) ??
      asTitleString(o.position_title) ??
      deepFindByPriority(o, [["job_title", "jobTitle"], ["title"], ["position", "role", "positionTitle", "position_title"]])
    );
  };

  // Prefer the current role (current/is_current flag or no end date).
  const current = history.find((h) => {
    if (!h || typeof h !== "object") return false;
    const o = h as Record<string, unknown>;
    return (
      o.current === true ||
      o.is_current === true ||
      o.isCurrent === true ||
      ((o.end_date == null && o.endDate == null) && titleOf(o) !== undefined)
    );
  });
  if (current) {
    const t = titleOf(current);
    if (t) return t;
  }

  const latest = [...history]
    .filter((h) => titleOf(h) !== undefined)
    .sort((a, b) => {
      const ao = a && typeof a === "object" ? (a as Record<string, unknown>) : {};
      const bo = b && typeof b === "object" ? (b as Record<string, unknown>) : {};
      const aDate = Math.max(
        parseHistoryDate(ao.start_date),
        parseHistoryDate(ao.startDate),
        parseHistoryDate(ao.date_from),
        parseHistoryDate(ao.dateFrom),
        parseHistoryDate(ao.from),
      );
      const bDate = Math.max(
        parseHistoryDate(bo.start_date),
        parseHistoryDate(bo.startDate),
        parseHistoryDate(bo.date_from),
        parseHistoryDate(bo.dateFrom),
        parseHistoryDate(bo.from),
      );
      return bDate - aDate;
    })[0];
  if (latest) {
    const t = titleOf(latest);
    if (t) return t;
  }

  // Otherwise the first (latest) entry, then fall back through the array.
  for (const h of history) {
    const t = titleOf(h);
    if (t) return t;
  }
  // Finally try the last entry explicitly.
  return titleOf(history[history.length - 1]);
}

// Pull SourceWhale / Vincere call-log notes from any of: comments, notes, note,
// or an activities[] array. Concatenates multiple entries (newest first when
// dates are present) so the recruiter sees the full call-log thread.
function extractCommentText(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    const parts = v.map(extractCommentText).filter((s): s is string => !!s);
    return parts.length ? parts.join("\n\n---\n\n") : undefined;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const body =
      asString(o.text) ??
      asString(o.body) ??
      asString(o.content) ??
      asString(o.note) ??
      asString(o.notes) ??
      asString(o.comment) ??
      asString(o.comments) ??
      asString(o.description) ??
      asString(o.message) ??
      asString(o.summary);
    const meta = [
      asString(o.type) ?? asString(o.activity_type) ?? asString(o.activityType),
      asString(o.date) ?? asString(o.created_at) ?? asString(o.createdAt) ?? asString(o.timestamp),
      asString(o.author) ?? asString(o.user) ?? asString(o.created_by) ?? asString(o.createdBy),
    ].filter(Boolean).join(" • ");
    if (body) return meta ? `[${meta}]\n${body}` : body;
  }
  return undefined;
}

function extractComments(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const buckets: string[] = [];
  const seen = new Set<string>();
  const pushFrom = (val: unknown) => {
    const text = extractCommentText(val);
    if (text && !seen.has(text)) {
      seen.add(text);
      buckets.push(text);
    }
  };

  const wanted = ["comments", "notes", "note", "activities", "activity", "activity_log", "activityLog", "call_logs", "callLogs"];
  const visit = (node: unknown, depth = 0) => {
    if (node == null || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (wanted.includes(k.toLowerCase())) pushFrom(v);
      }
      for (const v of Object.values(obj)) {
        if (v && typeof v === "object") visit(v, depth + 1);
      }
    }
  };
  visit(data);
  if (!buckets.length) return undefined;
  return buckets.join("\n\n---\n\n").slice(0, 20000);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveOwner(req: Request, body: Record<string, unknown>): Promise<string | null> {
  const key = req.headers.get("x-webhook-key");
  if (key) {
    const { data } = await supabase
      .from("webhook_settings")
      .select("user_id")
      .eq("secret_key", key)
      .maybeSingle();
    if (data?.user_id) return data.user_id as string;
  }
  const fromBody = pick(body, ["owner_user_id", "ownerUserId", "user_id"]);
  if (fromBody) return fromBody;

  // Fallback: if there is exactly one configured webhook owner, assign to them.
  // This keeps Zapier integrations working when no x-webhook-key is sent (e.g.
  // raw unmapped payloads) so records always appear on the dashboard.
  const { data: owners } = await supabase
    .from("webhook_settings")
    .select("user_id")
    .limit(2);
  if (owners && owners.length === 1 && owners[0]?.user_id) {
    return owners[0].user_id as string;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Accept either a single record or { candidates: [...] }
  const records: Record<string, unknown>[] = Array.isArray(body)
    ? (body as Record<string, unknown>[])
    : Array.isArray((body as { candidates?: unknown }).candidates)
      ? ((body as { candidates: Record<string, unknown>[] }).candidates)
      : [body];

  const owner = await resolveOwner(req, body);

  const results: Array<{ ok: boolean; id?: string; email?: string; error?: string }> = [];

  for (const r of records) {
    const first = asString(deepFind(r, ["firstName", "first_name", "FirstName", "given_name", "givenName", "forename"]));
    const last = asString(deepFind(r, ["lastName", "last_name", "LastName", "family_name", "familyName", "surname", "lastname"]));
    const fullName = asString(deepFind(r, ["name", "fullName", "full_name", "candidateName", "candidate_name", "displayName"]));
    const email = asString(deepFind(r, ["email", "emailAddress", "email_address", "primary_email", "primaryEmail", "workEmail", "work_email", "personalEmail", "personal_email"]));
    const phone = asString(deepFind(r, ["phone", "mobile", "phone_number", "phoneNumber", "primary_phone", "primaryPhone", "mobileNumber"]));
    let jobTitle = directFindByPriority(r, [
      ["current_job_title", "currentJobTitle"],
      ["job_title", "jobTitle"],
    ]);
    if (!jobTitle) jobTitle = findJobTitleFromHistory(r);
    if (!jobTitle) jobTitle = deepFindByPriority(r, [
      ["job_title", "jobTitle"],
      ["title"],
      ["position", "role", "currentTitle", "current_title", "current_position", "currentPosition", "current_role", "currentRole", "functional_expertise", "functionalExpertise"],
    ]);
    let employer = asString(deepFind(r, ["currentEmployer", "current_employer", "company", "companyName", "company_name", "employer", "employerName", "current_company", "currentCompany", "organisation", "organization"]));
    if (!employer) employer = findEmployerFromHistory(r);
    const salary = asNumber(
      deepFind(
        r,
        [
          "salary", "currentSalary", "current_salary", "salaryCurrent", "salary_current",
          "salaryExpectation", "salary_expectation", "expectedSalary", "expected_salary",
          "desiredSalary", "desired_salary", "remuneration", "compensation", "package",
        ],
        (v) =>
          typeof v === "number" ||
          (typeof v === "string" && /\d/.test(v)) ||
          (!!v && typeof v === "object"),
      ),
    );
    const location = asString(deepFind(r, ["location", "city", "town", "address_city", "currentLocation", "current_location"]));
    const linkedin = asString(deepFind(r, ["linkedinUrl", "linkedin_url", "linkedin", "linkedInUrl"]));
    const comments = extractComments(r);

    const name =
      fullName ||
      [first, last].filter(Boolean).join(" ").trim() ||
      email ||
      "Unknown";

    if (!email && !fullName && !first && !last) {
      results.push({ ok: false, error: "Missing name and email" });
      continue;
    }

    // UPSERT: match existing candidate by email AND name (scoped to owner), then
    // update job_title, employer, and salary; otherwise insert as a new candidate.
    if (!owner) {
      results.push({ ok: false, email, error: "Missing owner: provide x-webhook-key header or owner_user_id" });
      continue;
    }

    // Normalize names so trivial spacing/casing differences still match.
    const normalizeName = (s: string) =>
      s.toLowerCase().replace(/\s+/g, " ").trim();
    const normalizedName = normalizeName(name);

    // Fetch candidates for this owner with the same email (case-insensitive),
    // then match in code on normalized name so "  John  Doe" == "john doe".
    let existingId: string | undefined;
    if (email) {
      const { data: candidatesByEmail } = await supabase
        .from("candidates")
        .select("id, name")
        .eq("owner_user_id", owner)
        .ilike("email", email);
      const match = (candidatesByEmail ?? []).find(
        (c) => c.name && normalizeName(c.name) === normalizedName,
      );
      existingId = match?.id;
    }

    if (existingId) {
      const { error: updateError } = await supabase
        .from("candidates")
        .update({
          job_title: jobTitle ?? null,
          current_employer: employer ?? null,
          salary_current: salary ?? null,
          ...(comments ? { comments } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingId)
        .select("id")
        .single();
      if (updateError) {
        results.push({ ok: false, email, error: updateError.message });
      } else {
        results.push({ ok: true, id: existingId, email, action: "updated" });
      }
      continue;
    }

    const { data, error } = await supabase
      .from("candidates")
      .insert({
        name,
        first_name: first ?? null,
        last_name: last ?? null,
        email: email ?? null,
        phone: phone ?? null,
        job_title: jobTitle ?? null,
        current_employer: employer ?? null,
        salary_current: salary ?? null,
        location: location ?? null,
        linkedin_url: linkedin ?? null,
        comments: comments ?? null,
        source: "Inbound",
        status: "New",
        owner_user_id: owner,
      })
      .select("id")
      .single();

    if (error) {
      results.push({ ok: false, email, error: error.message });
    } else {
      results.push({ ok: true, id: data.id, email, action: "inserted" });
    }
  }

  const inserted = results.filter((r) => r.ok && r.action === "inserted").length;
  const updated = results.filter((r) => r.ok && r.action === "updated").length;
  return json({ received: records.length, inserted, updated, results }, 200);

});
