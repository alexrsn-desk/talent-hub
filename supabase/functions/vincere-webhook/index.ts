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
  return fromBody ?? null;
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
    const jobTitle = asString(deepFind(r, ["jobTitle", "job_title", "title", "currentTitle", "current_title", "position", "current_position", "currentPosition", "role", "current_role"]));
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

    const name =
      fullName ||
      [first, last].filter(Boolean).join(" ").trim() ||
      email ||
      "Unknown";

    if (!email && !fullName && !first && !last) {
      results.push({ ok: false, error: "Missing name and email" });
      continue;
    }

    // De-dupe on email per owner
    if (email && owner) {
      const { data: existing } = await supabase
        .from("candidates")
        .select("id")
        .eq("owner_user_id", owner)
        .ilike("email", email)
        .maybeSingle();
      if (existing?.id) {
        results.push({ ok: true, id: existing.id, email, error: "duplicate-skipped" });
        continue;
      }
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
        source: "Inbound",
        status: "New",
        owner_user_id: owner,
      })
      .select("id")
      .single();

    if (error) {
      results.push({ ok: false, email, error: error.message });
    } else {
      results.push({ ok: true, id: data.id, email });
    }
  }


  const inserted = results.filter((r) => r.ok && r.error !== "duplicate-skipped").length;
  return json({ received: records.length, inserted, results }, 200);
});
