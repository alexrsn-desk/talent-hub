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
    const first = pick(r, ["firstName", "first_name", "FirstName", "given_name"]);
    const last = pick(r, ["lastName", "last_name", "LastName", "family_name", "surname"]);
    const fullName = pick(r, ["name", "fullName", "full_name"]);
    const email = pick(r, ["email", "Email", "email_address", "emailAddress"]);
    const phone = pick(r, ["phone", "Phone", "mobile", "phone_number"]);
    const jobTitle = pick(r, ["jobTitle", "job_title", "title", "currentTitle"]);
    const employer = pick(r, ["currentEmployer", "current_employer", "company", "employer"]);
    const location = pick(r, ["location", "city"]);
    const linkedin = pick(r, ["linkedinUrl", "linkedin_url", "linkedin"]);

    const name = fullName || [first, last].filter(Boolean).join(" ").trim() || email || "Unknown";

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
