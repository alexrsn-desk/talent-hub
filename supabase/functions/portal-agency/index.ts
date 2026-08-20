// Authenticated agency-side portal endpoints (port of agency.server.ts).
// Every read/write runs through the CALLER's own Supabase client (anon key +
// caller JWT), so RLS on the portal_* tables is what actually enforces
// ownership. The explicit ownership checks below are kept as defence in depth.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildInterviewEmail,
  buildRejectionEmail,
  dispatchWebhooks,
  sendCustomEmail,
  sendRejectionEmailNow,
} from "../_shared/portal-events.ts";

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
  if (!authHeader.startsWith("Bearer ")) throw new Error("Not authenticated");
  const token = authHeader.slice("Bearer ".length);
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data, error } = await db.auth.getClaims(token);
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

/** Map a Desky pipeline stage onto the portal job's own stage list. */
function mapStage(deskyStage: string | null, stages: string[]): string {
  const list = stages?.length ? stages : ["Longlist"];
  if (!deskyStage) return list[0];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const exact = list.find((s) => norm(s) === norm(deskyStage));
  if (exact) return exact;
  const partial = list.find(
    (s) => norm(s).includes(norm(deskyStage)) || norm(deskyStage).includes(norm(s)),
  );
  return partial ?? list[0];
}

/**
 * Push (or update) a Desky candidate onto a job's client portal.
 * Runs on the caller's RLS-scoped client, so ownership of both the Desky
 * candidate and the portal job is enforced by the database.
 */
async function pushCandidateToPortal(
  db: Db,
  userId: string,
  input: { deskyCandidateId: string; portalJobId: string },
) {
  const { data: candidate } = await db
    .from("candidates")
    .select("id, name, first_name, last_name, email, job_title, cv_file_url, client_ready_notes")
    .eq("id", input.deskyCandidateId)
    .maybeSingle();
  if (!candidate) throw new Error("Candidate not found");

  const { data: job } = await db
    .from("portal_jobs")
    .select("id, user_id, title, client_name, stages")
    .eq("id", input.portalJobId)
    .maybeSingle();
  if (!job || job.user_id !== userId) throw new Error("Portal not found for this job");

  // Current Desky pipeline stage for this candidate on the linked Desky job.
  const { data: link } = await db
    .from("candidate_jobs")
    .select("stage, jobs!inner(portal_job_id)")
    .eq("candidate_id", candidate.id)
    .eq("jobs.portal_job_id", job.id)
    .maybeSingle();

  const fullName =
    [candidate.first_name, candidate.last_name].filter(Boolean).join(" ").trim() ||
    candidate.name;

  const row = {
    job_id: job.id,
    desky_candidate_id: candidate.id,
    name: fullName,
    email: candidate.email,
    headline: candidate.job_title,
    cv_path: candidate.cv_file_url,
    client_notes: candidate.client_ready_notes,
    current_stage: mapStage(link?.stage ?? null, job.stages ?? []),
    pushed_at: new Date().toISOString(),
  };

  const { data: existing } = await db
    .from("portal_candidates")
    .select("id")
    .eq("job_id", job.id)
    .eq("desky_candidate_id", candidate.id)
    .maybeSingle();

  let portalCandidateId: string;
  let created = false;

  if (existing) {
    const { data, error } = await db
      .from("portal_candidates")
      .update(row)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    portalCandidateId = data.id;
  } else {
    const { data, error } = await db
      .from("portal_candidates")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    portalCandidateId = data.id;
    created = true;
  }

  // Ensure the candidate's own portal link exists.
  const { data: cp } = await db
    .from("portal_candidate_portals")
    .select("access_token")
    .eq("candidate_id", portalCandidateId)
    .maybeSingle();

  let accessToken: string | null = cp?.access_token ?? null;
  if (!accessToken) {
    const { data: inserted, error } = await db
      .from("portal_candidate_portals")
      .insert({ candidate_id: portalCandidateId })
      .select("access_token")
      .single();
    if (error) throw new Error(error.message);
    accessToken = inserted.access_token;
  }

  if (created) {
    await emitCandidateCreated(db, userId, portalCandidateId).catch((e) =>
      console.error("candidate.created emit failed", e),
    );
  }

  return {
    ok: true as const,
    created,
    portalCandidateId,
    accessToken,
    pushedAt: row.pushed_at,
    stage: row.current_stage,
  };
}

/* ------------------------- FEEDBACK THREADS (AGENCY) ---------------------- */

async function loadCandidateFeedback(db: Db, candidateId: string) {
  const { data, error } = await db
    .from("portal_feedback")
    .select(
      "id, candidate_id, client_email, stage_at_time, comment, rating, created_at, author_role, reply_to, updated_at",
    )
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { feedback: data ?? [] };
}

/** Agency staff reply inside a candidate's feedback thread. */
async function addAgencyReply(
  db: Db,
  input: { candidateId: string; comment: string; stage?: string | null; replyTo?: string | null },
) {
  if (!input.comment?.trim()) throw new Error("Reply cannot be empty");

  const { data: candidate } = await db
    .from("portal_candidates")
    .select("id, name, job_id, current_stage")
    .eq("id", input.candidateId)
    .maybeSingle();
  if (!candidate) throw new Error("Candidate not found");

  const { data, error } = await db
    .from("portal_feedback")
    .insert({
      candidate_id: candidate.id,
      stage_at_time: input.stage ?? candidate.current_stage,
      comment: input.comment.trim(),
      author_role: "agency",
      reply_to: input.replyTo ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { ok: true as const, id: data.id };
}

/** Agency staff may edit any comment on their own jobs (their replies and client comments). */
async function editFeedback(
  db: Db,
  input: { feedbackId: string; comment: string; rating?: number | null },
) {
  if (!input.comment?.trim()) throw new Error("Comment cannot be empty");
  const update: Record<string, unknown> = {
    comment: input.comment.trim(),
    updated_at: new Date().toISOString(),
  };
  if (input.rating !== undefined) update.rating = input.rating;

  const { error } = await db.from("portal_feedback").update(update).eq("id", input.feedbackId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

/* ------------------------------ JOB SETTINGS ----------------------------- */

async function setRejectionEmailMode(db: Db, input: { jobId: string; mode: string }) {
  if (!["template", "ai"].includes(input.mode)) throw new Error("Invalid mode");
  const { error } = await db
    .from("portal_jobs")
    .update({ rejection_email_mode: input.mode })
    .eq("id", input.jobId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

/* ------------------------------ BULK EMAILS ------------------------------ */

async function candidatesForEmail(db: Db, ids: string[]) {
  const { data, error } = await db
    .from("portal_candidates")
    .select("id, name, email, job_id, current_stage")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function jobForEmail(db: Db, jobId: string) {
  const { data, error } = await db
    .from("portal_jobs")
    .select(
      "id, user_id, title, client_name, stages, rejection_email_mode, notify_candidate_interview, notify_candidate_rejection",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Job not found");
  return data;
}

async function bulkSendEmails(
  db: Db,
  input: {
    candidateIds: string[];
    kind: "general" | "reject";
    subject?: string;
    body?: string;
    markRejected?: boolean;
  },
) {
  const ids = (input.candidateIds ?? []).filter(Boolean);
  if (!ids.length) throw new Error("No candidates selected");

  const candidates = await candidatesForEmail(db, ids);
  const results: { candidateId: string; name: string; ok: boolean; error?: string }[] = [];
  const jobs = new Map<string, Awaited<ReturnType<typeof jobForEmail>>>();

  for (const candidate of candidates) {
    try {
      if (!jobs.has(candidate.job_id)) jobs.set(candidate.job_id, await jobForEmail(db, candidate.job_id));
      const job = jobs.get(candidate.job_id)!;

      if (input.kind === "reject") {
        await sendRejectionEmailNow(db, candidate, job);
        if (input.markRejected !== false) {
          await db.from("portal_candidates").update({ rejected: true }).eq("id", candidate.id);
        }
      } else {
        if (!input.subject?.trim() || !input.body?.trim()) {
          throw new Error("Subject and message are required");
        }
        await sendCustomEmail(db, candidate, job, input.subject.trim(), input.body);
      }
      results.push({ candidateId: candidate.id, name: candidate.name, ok: true });
    } catch (e) {
      results.push({
        candidateId: candidate.id,
        name: candidate.name,
        ok: false,
        error: e instanceof Error ? e.message : "send failed",
      });
    }
  }

  return { ok: true as const, sent: results.filter((r) => r.ok).length, results };
}

/* -------------------------- EMAIL PREVIEW (AI) --------------------------- */

async function previewInterviewEmail(
  db: Db,
  input: { candidateId: string; stage?: string | null },
) {
  const { data: candidate } = await db
    .from("portal_candidates")
    .select("id, name, email, job_id, current_stage")
    .eq("id", input.candidateId)
    .maybeSingle();
  if (!candidate) throw new Error("Candidate not found");

  const job = await jobForEmail(db, candidate.job_id);
  const stage = input.stage ?? candidate.current_stage;
  const email = await buildInterviewEmail(db, candidate, job, stage);
  return { ...email, stage, toEmail: candidate.email };
}

async function previewRejectionEmail(db: Db, input: { candidateId: string; mode?: string }) {
  const { data: candidate } = await db
    .from("portal_candidates")
    .select("id, name, email, job_id, current_stage")
    .eq("id", input.candidateId)
    .maybeSingle();
  if (!candidate) throw new Error("Candidate not found");

  const job = await jobForEmail(db, candidate.job_id);
  const email = await buildRejectionEmail(db, candidate, {
    ...job,
    rejection_email_mode: input.mode ?? job.rejection_email_mode,
  });
  return { ...email, toEmail: candidate.email };
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
      case "pushCandidateToPortal":
        return json(await pushCandidateToPortal(db, userId, payload));
      case "loadCandidateFeedback":
        return json(await loadCandidateFeedback(db, payload.candidateId));
      case "addAgencyReply":
        return json(await addAgencyReply(db, payload));
      case "editFeedback":
        return json(await editFeedback(db, payload));
      case "setRejectionEmailMode":
        return json(await setRejectionEmailMode(db, payload));
      case "bulkSendEmails":
        return json(await bulkSendEmails(db, payload));
      case "previewInterviewEmail":
        return json(await previewInterviewEmail(db, payload));
      case "previewRejectionEmail":
        return json(await previewRejectionEmail(db, payload));
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("portal-agency error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 400);
  }
});
