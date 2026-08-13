// Authenticated agency-side portal endpoints (port of agency.server.ts).
// Every read/write runs through the CALLER's own Supabase client (anon key +
// caller JWT), so RLS on the portal_* tables is what actually enforces
// ownership. The explicit ownership checks below are kept as defence in depth.
import { createClient } from "npm:@supabase/supabase-js@2";
import { dispatchWebhooks } from "../_shared/portal-events.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

/** Authenticated client scoped to the caller — RLS applies to every query. */
async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data, error } = await db.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (error || !userId) throw new Error("Not authenticated");
  return { db, userId };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// deno-lint-ignore no-explicit-any
type Db = any;

async function createApiKey(db: Db, userId: string, input: { name: string; canWrite: boolean }) {

  const raw = `loop_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
  const { data, error } = await db
    .from("portal_api_keys")
    .insert({
      user_id: userId,
      name: input.name,
      key_prefix: raw.slice(0, 12),
      key_hash: await sha256(raw),
      can_read: true,
      can_write: input.canWrite,
    })
    .select("id, key_prefix, name, can_write, created_at")
    .single();
  if (error) throw new Error(error.message);
  // The raw key is returned exactly once — it is never stored in full.
  return { ...data, key: raw };
}

async function emitCandidateCreated(db: Db, userId: string, candidateId: string) {

  const { data: candidate } = await db
    .from("portal_candidates")
    .select("id, job_id, name, email, headline, current_stage")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) throw new Error("Candidate not found");

  const { data: job } = await db
    .from("portal_jobs")
    .select("id, user_id, title, client_name")
    .eq("id", candidate.job_id)
    .maybeSingle();
  if (!job || job.user_id !== userId) throw new Error("Not authorised for this candidate");

  await db.from("portal_notifications").insert({
    kind: "candidate.created",
    title: `${candidate.name} added to ${job.title}`,
    body: candidate.headline ?? "",
    job_id: job.id,
    candidate_id: candidate.id,
  });

  await dispatchWebhooks(db, "candidate.created", {
    candidate_id: candidate.id,
    job_id: job.id,
    name: candidate.name,
    email: candidate.email,
    headline: candidate.headline,
    stage: candidate.current_stage,
    job_title: job.title,
    client_name: job.client_name,
  });

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { db, userId } = await requireUser(req);
    const { action, payload } = await req.json();
    switch (action) {
      case "generateApiKey":
        return json(await createApiKey(db, userId, payload));
      case "notifyCandidateCreated":
        return json(await emitCandidateCreated(db, userId, payload.candidateId));

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("portal-agency error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 400);
  }
});
