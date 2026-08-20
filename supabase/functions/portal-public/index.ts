// Token-gated public portal endpoints (client portal + candidate portal).
// Literal port of portal.server.ts — the token validation is the security gate,
// so this function runs without JWT verification and never queries as a user.
import {
  admin,
  dispatchWebhooks,
  maybeEmailInterview,
  maybeEmailRejection,
  resolveToggle,
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

type Slot = { id: string; label: string };

/* ----------------------------- TOKEN GATEWAY ----------------------------- */

async function requireClientPortal(token: string) {
  const db = admin();
  const { data: portal } = await db
    .from("portal_client_portals")
    .select("id, job_id, access_token, calendly_url, availability_slots")
    .eq("access_token", token)
    .maybeSingle();
  if (!portal) return null;

  const { data: job } = await db
    .from("portal_jobs")
    .select(
      "id, user_id, title, client_name, company_info, job_spec, job_spec_path, job_spec_filename, stages, status, notify_candidate_interview, notify_candidate_rejection, rejection_email_mode",
    )
    .eq("id", portal.job_id)
    .maybeSingle();
  if (!job) return null;

  return { db, portal, job };
}

async function requireCandidatePortal(token: string) {
  const db = admin();
  const { data: portal } = await db
    .from("portal_candidate_portals")
    .select("id, candidate_id, job_pack, prep_material, interview_details")
    .eq("access_token", token)
    .maybeSingle();
  if (!portal) return null;

  const { data: candidate } = await db
    .from("portal_candidates")
    .select("id, job_id, name, email, headline, current_stage, rejected")
    .eq("id", portal.candidate_id)
    .maybeSingle();
  if (!candidate) return null;

  const { data: job } = await db
    .from("portal_jobs")
    .select(
      "id, user_id, title, client_name, company_info, job_spec, job_spec_path, job_spec_filename, stages",
    )
    .eq("id", candidate.job_id)
    .maybeSingle();
  if (!job) return null;

  return { db, portal, candidate, job };
}

// deno-lint-ignore no-explicit-any
async function signed(db: any, bucket: string, path: string | null) {
  if (!path) return null;
  const { data } = await db.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// deno-lint-ignore no-explicit-any
async function agencyDefaults(db: any, userId: string) {
  const { data } = await db
    .from("portal_agency_settings")
    .select("notify_candidate_interview, notify_candidate_rejection")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return {
    interview: data?.notify_candidate_interview ?? false,
    rejection: data?.notify_candidate_rejection ?? false,
  };
}

const isInterviewStage = (stage: string) => /interview/i.test(stage);

/* ------------------------------ CLIENT SIDE ------------------------------ */

async function loadClientPortal(token: string) {
  const ctx = await requireClientPortal(token);
  if (!ctx) return null;
  const { db, portal, job } = ctx;

  const { data: candidates } = await db
    .from("portal_candidates")
    .select("id, name, headline, client_notes, current_stage, rejected, cv_path")
    .eq("job_id", job.id)
    .order("created_at");

  const ids = (candidates ?? []).map((c: { id: string }) => c.id);
  const { data: feedback } = ids.length
    ? await db
      .from("portal_feedback")
      .select(
        "id, candidate_id, client_email, stage_at_time, comment, rating, created_at, author_role, reply_to, updated_at",
      )
      .in("candidate_id", ids)
      .order("created_at", { ascending: true })
    : { data: [] };

  const { data: notes } = await db
    .from("portal_job_notes")
    .select("id, author_role, author_email, body, created_at")
    .eq("job_id", job.id)
    .order("created_at", { ascending: false });

  const { data: content } = await db
    .from("portal_job_stage_content")
    .select("stage, prep_material, interview_details")
    .eq("job_id", job.id);

  const defaults = await agencyDefaults(db, job.user_id);

  const stageContent = (job.stages as string[]).map((stage) => {
    const row = (content ?? []).find((c: { stage: string }) => c.stage === stage);
    return {
      stage,
      prepMaterial: row?.prep_material ?? "",
      interviewDetails: row?.interview_details ?? "",
    };
  });

  return {
    job: {
      id: job.id,
      title: job.title,
      clientName: job.client_name,
      stages: job.stages as string[],
      jobSpecUrl: await signed(db, "job-specs", job.job_spec_path),
      jobSpecFilename: job.job_spec_filename,
    },
    candidates: await Promise.all(
      (candidates ?? []).map(async (c: Record<string, unknown>) => ({
        id: c.id as string,
        name: c.name as string,
        headline: c.headline as string | null,
        clientNotes: c.client_notes as string | null,
        currentStage: c.current_stage as string,
        rejected: c.rejected as boolean,
        cvUrl: await signed(db, "cvs", c.cv_path as string | null),
        feedback: (feedback ?? []).filter(
          (f: { candidate_id: string }) => f.candidate_id === c.id,
        ),
      })),
    ),
    scheduling: {
      calendlyUrl: portal.calendly_url as string | null,
      slots: (portal.availability_slots ?? []) as Slot[],
    },
    notes: notes ?? [],
    stageContent,
    notifications: {
      interview: resolveToggle(job.notify_candidate_interview, defaults.interview),
      rejection: resolveToggle(job.notify_candidate_rejection, defaults.rejection),
      interviewOverridden: job.notify_candidate_interview !== null,
      rejectionOverridden: job.notify_candidate_rejection !== null,
      defaults,
    },
  };
}

async function moveCandidate(input: {
  token: string;
  candidateId: string;
  toStage: string;
  reject?: boolean;
  actorEmail?: string | null;
}) {
  const ctx = await requireClientPortal(input.token);
  if (!ctx) throw new Error("Invalid portal token");
  const { db, job } = ctx;

  const { data: candidate } = await db
    .from("portal_candidates")
    .select("id, job_id, name, email, current_stage, rejected")
    .eq("id", input.candidateId)
    .eq("job_id", job.id)
    .maybeSingle();
  if (!candidate) throw new Error("Candidate not found for this job");

  const reject = input.reject ?? false;
  const toStage = reject ? candidate.current_stage : input.toStage;

  const { error } = await db
    .from("portal_candidates")
    .update({ current_stage: toStage, rejected: reject })
    .eq("id", candidate.id);
  if (error) throw new Error(error.message);

  if (!reject && toStage !== candidate.current_stage) {
    await db.from("portal_stage_history").insert({
      candidate_id: candidate.id,
      from_stage: candidate.current_stage,
      to_stage: toStage,
      changed_by: input.actorEmail ?? "client",
    });
  }

  await db.from("portal_notifications").insert({
    kind: reject ? "candidate.rejected" : "candidate.stage_changed",
    title: reject
      ? `${candidate.name} was rejected`
      : `${candidate.name} moved to ${toStage}`,
    body: `${input.actorEmail ?? "A client reviewer"} updated ${job.title}.`,
    job_id: job.id,
    candidate_id: candidate.id,
  });

  const payload = {
    candidate_id: candidate.id,
    job_id: job.id,
    name: candidate.name,
    from_stage: candidate.current_stage,
    to_stage: toStage,
    rejected: reject,
    actor: input.actorEmail ?? null,
  };
  await dispatchWebhooks(db, reject ? "candidate.rejected" : "candidate.stage_changed", payload);

  if (reject) {
    await maybeEmailRejection(db, { id: candidate.id, name: candidate.name, email: candidate.email }, job);
  } else if (isInterviewStage(toStage) && toStage !== candidate.current_stage) {
    await maybeEmailInterview(
      db,
      { id: candidate.id, name: candidate.name, email: candidate.email, job_id: job.id },
      job,
      toStage,
    );
  }

  return { ok: true };
}

async function addFeedback(input: {
  token: string;
  candidateId: string;
  comment: string;
  stage: string;
  rating?: number | null;
  clientEmail?: string | null;
  replyTo?: string | null;
}) {
  const ctx = await requireClientPortal(input.token);
  if (!ctx) throw new Error("Invalid portal token");
  const { db, job } = ctx;

  const { data: candidate } = await db
    .from("portal_candidates")
    .select("id, name")
    .eq("id", input.candidateId)
    .eq("job_id", job.id)
    .maybeSingle();
  if (!candidate) throw new Error("Candidate not found for this job");

  // A reply must belong to the same candidate thread.
  if (input.replyTo) {
    const { data: parent } = await db
      .from("portal_feedback")
      .select("id")
      .eq("id", input.replyTo)
      .eq("candidate_id", candidate.id)
      .maybeSingle();
    if (!parent) throw new Error("Cannot reply to that comment");
  }

  const { data: row, error } = await db
    .from("portal_feedback")
    .insert({
      candidate_id: candidate.id,
      client_email: input.clientEmail ?? null,
      stage_at_time: input.stage,
      comment: input.comment,
      rating: input.rating ?? null,
      author_role: "client",
      reply_to: input.replyTo ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await db.from("portal_notifications").insert({
    kind: "feedback.created",
    title: `New feedback on ${candidate.name}`,
    body: input.comment.slice(0, 240),
    job_id: job.id,
    candidate_id: candidate.id,
  });

  await dispatchWebhooks(db, "feedback.created", {
    feedback_id: row.id,
    candidate_id: candidate.id,
    job_id: job.id,
    stage: input.stage,
    rating: input.rating ?? null,
    comment: input.comment,
    client_email: input.clientEmail ?? null,
  });

  return { ok: true };
}

/** Clients may edit only their own comments, and only within this portal's job. */
async function clientEditFeedback(input: {
  token: string;
  feedbackId: string;
  comment: string;
  rating?: number | null;
  clientEmail?: string | null;
}) {
  const ctx = await requireClientPortal(input.token);
  if (!ctx) throw new Error("Invalid portal token");
  const { db, job } = ctx;

  const { data: row } = await db
    .from("portal_feedback")
    .select("id, candidate_id, client_email, author_role")
    .eq("id", input.feedbackId)
    .maybeSingle();
  if (!row) throw new Error("Comment not found");
  if ((row.author_role ?? "client") !== "client") {
    throw new Error("Recruiter replies can only be edited by the agency");
  }

  const { data: candidate } = await db
    .from("portal_candidates")
    .select("id")
    .eq("id", row.candidate_id)
    .eq("job_id", job.id)
    .maybeSingle();
  if (!candidate) throw new Error("Comment not found for this job");

  const actor = (input.clientEmail ?? "").trim().toLowerCase();
  const author = (row.client_email ?? "").trim().toLowerCase();
  if (!actor || actor !== author) throw new Error("You can only edit your own comments");

  const { error } = await db
    .from("portal_feedback")
    .update({
      comment: input.comment,
      rating: input.rating ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) throw new Error(error.message);

  return { ok: true };
}


async function saveScheduling(input: {
  token: string;
  calendlyUrl: string | null;
  slots: Slot[];
}) {
  const ctx = await requireClientPortal(input.token);
  if (!ctx) throw new Error("Invalid portal token");
  const { db, portal } = ctx;

  const { error } = await db
    .from("portal_client_portals")
    .update({ calendly_url: input.calendlyUrl, availability_slots: input.slots })
    .eq("id", portal.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function addJobNote(input: { token: string; body: string; authorEmail?: string | null }) {
  const ctx = await requireClientPortal(input.token);
  if (!ctx) throw new Error("Invalid portal token");
  const { db, job } = ctx;

  const { error } = await db.from("portal_job_notes").insert({
    job_id: job.id,
    author_role: "client",
    author_email: input.authorEmail ?? null,
    body: input.body,
  });
  if (error) throw new Error(error.message);

  await db.from("portal_notifications").insert({
    kind: "note.created",
    title: `New note on ${job.title}`,
    body: input.body.slice(0, 240),
    job_id: job.id,
  });

  return { ok: true };
}

async function saveStageContent(input: {
  token: string;
  stage: string;
  prepMaterial: string;
  interviewDetails: string;
}) {
  const ctx = await requireClientPortal(input.token);
  if (!ctx) throw new Error("Invalid portal token");
  const { db, job } = ctx;

  const { data: existing } = await db
    .from("portal_job_stage_content")
    .select("id")
    .eq("job_id", job.id)
    .eq("stage", input.stage)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from("portal_job_stage_content")
      .update({
        prep_material: input.prepMaterial,
        interview_details: input.interviewDetails,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("portal_job_stage_content").insert({
      job_id: job.id,
      stage: input.stage,
      prep_material: input.prepMaterial,
      interview_details: input.interviewDetails,
    });
    if (error) throw new Error(error.message);
  }

  return { ok: true };
}

/* ---------------------------- CANDIDATE SIDE ---------------------------- */

async function loadCandidatePortal(token: string) {
  const ctx = await requireCandidatePortal(token);
  if (!ctx) return null;
  const { db, portal, candidate, job } = ctx;

  const stages = job.stages as string[];
  const currentIndex = stages.indexOf(candidate.current_stage);

  const { data: cp } = await db
    .from("portal_client_portals")
    .select("calendly_url, availability_slots")
    .eq("job_id", job.id)
    .maybeSingle();

  const { data: booking } = await db
    .from("portal_interview_bookings")
    .select("slot, status, created_at")
    .eq("candidate_id", candidate.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: content } = await db
    .from("portal_job_stage_content")
    .select("stage, prep_material, interview_details")
    .eq("job_id", job.id);

  // Stage content unlocks only once the candidate has reached that stage.
  const reachedStages = stages.slice(0, currentIndex + 1);
  const stageContent = (content ?? [])
    .filter(
      (c: { stage: string; prep_material: string | null; interview_details: string | null }) =>
        reachedStages.includes(c.stage) &&
        isInterviewStage(c.stage) &&
        (c.prep_material || c.interview_details),
    )
    .sort(
      (a: { stage: string }, b: { stage: string }) =>
        stages.indexOf(a.stage) - stages.indexOf(b.stage),
    )
    .map((c: { stage: string; prep_material: string | null; interview_details: string | null }) => ({
      stage: c.stage,
      prepMaterial: c.prep_material ?? "",
      interviewDetails: c.interview_details ?? "",
    }));

  const showScheduling = isInterviewStage(candidate.current_stage) && !candidate.rejected;

  // Candidate-facing stage labels: "Submitted" reads as "Application Submitted",
  // and the internal "Reviewed" stage is hidden from candidates entirely.
  const candidateStages = stages
    .map((label, i) => ({
      label: /^submitted$/i.test(label) ? "Application Submitted" : label,
      raw: label,
      reached: currentIndex >= i,
      current: i === currentIndex,
    }))
    .filter((s) => !/^reviewed$/i.test(s.raw));

  return {
    candidate: {
      id: candidate.id,
      name: candidate.name,
      currentStage: /^submitted$/i.test(candidate.current_stage)
        ? "Application Submitted"
        : candidate.current_stage,
      rejected: candidate.rejected,
    },
    job: {
      title: job.title,
      clientName: job.client_name,
      companyInfo: job.company_info,
      companyWebsite: (job.company_info ?? "").match(/https?:\/\/\S+/)?.[0] ?? null,
    },
    stages: candidateStages,
    pack: {
      jobPack: portal.job_pack,
      jobSpec: job.job_spec,
      jobSpecUrl: await signed(db, "job-specs", job.job_spec_path),
      jobSpecFilename: job.job_spec_filename,
      // Prep material and interview details unlock only at interview stage.
      prepMaterial: showScheduling ? portal.prep_material : null,
      interviewDetails: showScheduling ? portal.interview_details : null,
    },
    stageContent,
    scheduling: showScheduling
      ? {
        calendlyUrl: (cp?.calendly_url ?? null) as string | null,
        slots: ((cp?.availability_slots ?? []) as Slot[]),
      }
      : null,
    booking: booking ?? null,
  };
}

async function requestSlot(input: { token: string; slot: string }) {
  const ctx = await requireCandidatePortal(input.token);
  if (!ctx) throw new Error("Invalid portal token");
  const { db, candidate, job } = ctx;

  const { data: row, error } = await db
    .from("portal_interview_bookings")
    .insert({ candidate_id: candidate.id, slot: input.slot, status: "requested" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await db.from("portal_notifications").insert({
    kind: "interview.booked",
    title: `${candidate.name} requested a slot`,
    body: `${input.slot} — ${job.title}`,
    job_id: job.id,
    candidate_id: candidate.id,
  });

  await dispatchWebhooks(db, "interview.booked", {
    booking_id: row.id,
    candidate_id: candidate.id,
    job_id: job.id,
    slot: input.slot,
    status: "requested",
  });

  return { ok: true };
}

/* -------------------------------- ROUTER -------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { action, payload } = await req.json();
    switch (action) {
      case "loadClientPortal":
        return json(await loadClientPortal(payload.token));
      case "moveCandidate":
        return json(await moveCandidate(payload));
      case "addFeedback":
        return json(await addFeedback(payload));
      case "clientEditFeedback":
        return json(await clientEditFeedback(payload));
      case "saveScheduling":
        return json(await saveScheduling(payload));
      case "addJobNote":
        return json(await addJobNote(payload));
      case "saveStageContent":
        return json(await saveStageContent(payload));
      case "loadCandidatePortal":
        return json(await loadCandidatePortal(payload.token));
      case "requestSlot":
        return json(await requestSlot(payload));
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("portal-public error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 400);
  }
});
