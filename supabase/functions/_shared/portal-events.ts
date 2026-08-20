// Port of the source's events.server.ts, adapted to Deno / Supabase Edge Functions.
// Called server-side-to-server-side from portal-public and portal-agency.
import { createClient } from "npm:@supabase/supabase-js@2";

export function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type DomainEvent =
  | "candidate.created"
  | "candidate.stage_changed"
  | "candidate.rejected"
  | "feedback.created"
  | "interview.booked";

// deno-lint-ignore no-explicit-any
export type Db = any;

/* ------------------------------- WEBHOOKS -------------------------------- */

export async function dispatchWebhooks(db: Db, event: DomainEvent, payload: unknown) {
  const { data: hooks } = await db
    .from("portal_webhooks")
    .select("id, url, secret, events, active")
    .eq("active", true);
  if (!hooks?.length) return;

  const body = JSON.stringify({ event, sent_at: new Date().toISOString(), data: payload });

  await Promise.all(
    hooks
      .filter((h: { events: string[] }) => h.events.includes(event))
      .map(async (h: { id: string; url: string; secret: string }) => {
        let status: number | null = null;
        let error: string | null = null;
        try {
          const res = await fetch(h.url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-loop-event": event,
              "x-loop-secret": h.secret,
            },
            body,
          });
          status = res.status;
        } catch (e) {
          error = e instanceof Error ? e.message : "request failed";
        }
        await db.from("portal_webhook_deliveries").insert({
          webhook_id: h.id,
          event,
          payload: JSON.parse(body),
          status_code: status,
          error,
        });
      }),
  );
}

/* ---------------------------- CANDIDATE EMAILS ---------------------------- */

async function agencySettings(db: Db, userId?: string | null) {
  let q = db.from("portal_agency_settings").select("*");
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q.order("created_at").limit(1).maybeSingle();
  return data;
}

/** Resolve a per-job override against the agency default. */
export function resolveToggle(jobValue: boolean | null | undefined, fallback: boolean) {
  return jobValue === null || jobValue === undefined ? fallback : jobValue;
}

/* -------------------------------- AI LAYER -------------------------------- */

/** Single call into the Lovable AI gateway (Gemini 2.5 Flash). Returns null on any failure. */
export async function aiText(prompt: string, maxTokens = 700): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch (_e) {
    return null;
  }
}

const firstName = (name: string) => name.split(" ")[0];

export type BuiltEmail = { subject: string; body: string; ai: boolean };

/* ----------------------------- REJECTION EMAIL ---------------------------- */

export type EmailJob = {
  id?: string;
  title: string;
  client_name: string;
  stages?: string[];
  user_id?: string | null;
  notify_candidate_interview?: boolean | null;
  notify_candidate_rejection?: boolean | null;
  rejection_email_mode?: string | null;
};

export type EmailCandidate = {
  id: string;
  name: string;
  email: string | null;
  job_id?: string;
};

export function templateRejectionBody(candidate: EmailCandidate, job: EmailJob) {
  return [
    `Hi ${firstName(candidate.name)},`,
    "",
    `Thank you for the time you gave to the ${job.title} process with ${job.client_name}.`,
    "On this occasion they've decided not to take your application further.",
    "",
    "It was a genuinely competitive process and we'd be glad to keep you in mind for other roles.",
    "",
    "With best wishes,",
  ].join("\n");
}

/**
 * AI-worded rejection informed by that candidate's client feedback.
 * The feedback is read server-side only and is never quoted back to the candidate.
 */
export async function aiRejectionBody(db: Db, candidate: EmailCandidate, job: EmailJob) {
  const { data: feedback } = await db
    .from("portal_feedback")
    .select("comment, rating, stage_at_time, author_role")
    .eq("candidate_id", candidate.id)
    .order("created_at", { ascending: false })
    .limit(12);

  const notes = (feedback ?? [])
    .filter((f: { author_role?: string }) => (f.author_role ?? "client") === "client")
    .map(
      (f: { comment: string; rating: number | null; stage_at_time: string | null }) =>
        `- (${f.stage_at_time ?? "unspecified stage"}${f.rating ? `, ${f.rating}/5` : ""}) ${f.comment}`,
    )
    .join("\n");

  if (!notes) return null;

  const prompt = `You are a recruiter writing a rejection email to a candidate.

Role: ${job.title} at ${job.client_name}
Candidate first name: ${firstName(candidate.name)}

Private client feedback (NEVER quote, paraphrase closely, or attribute any of this — use it only to decide what constructive theme to mention):
${notes}

Write the email body only (no subject, no markdown, no placeholders like [Name]).
Rules:
- Warm, kind, human and brief: 100-150 words.
- Confirm they haven't been taken forward, without blame.
- Offer at most one genuinely useful, generically-worded piece of constructive insight drawn from the themes above.
- Never quote the client, never name individuals, never reveal that written feedback exists.
- End with a short line offering to keep in touch about other roles, then "With best wishes,".`;

  return await aiText(prompt, 500);
}

export async function buildRejectionEmail(
  db: Db,
  candidate: EmailCandidate,
  job: EmailJob,
): Promise<BuiltEmail> {
  const subject = `Update on your application — ${job.title}`;
  if ((job.rejection_email_mode ?? "template") === "ai") {
    const body = await aiRejectionBody(db, candidate, job);
    if (body) return { subject, body, ai: true };
  }
  return { subject, body: templateRejectionBody(candidate, job), ai: false };
}

/** Build and send a rejection email immediately, ignoring the per-job toggle. */
export async function sendRejectionEmailNow(db: Db, candidate: EmailCandidate, job: EmailJob) {
  const email = await buildRejectionEmail(db, candidate, job);
  await deliver(
    db,
    {
      candidate_id: candidate.id,
      kind: "rejection",
      to_email: candidate.email,
      subject: email.subject,
      body: email.body,
    },
    job.user_id ?? null,
  );
  return email;
}

export async function maybeEmailRejection(db: Db, candidate: EmailCandidate, job: EmailJob) {
  const settings = await agencySettings(db, job.user_id ?? null);
  if (
    !resolveToggle(job.notify_candidate_rejection, settings?.notify_candidate_rejection ?? false)
  ) {
    return;
  }
  await sendRejectionEmailNow(db, candidate, job);
}

/* ----------------------------- INTERVIEW EMAIL ---------------------------- */

type InterviewContext = {
  calendlyUrl: string | null;
  slots: { label: string }[];
  interviewDetails: string;
  prepMaterial: string;
  portalUrl: string | null;
};

async function interviewContext(
  db: Db,
  candidate: EmailCandidate,
  jobId: string,
  stage: string,
): Promise<InterviewContext> {
  const { data: cp } = await db
    .from("portal_client_portals")
    .select("calendly_url, availability_slots")
    .eq("job_id", jobId)
    .maybeSingle();
  const { data: portal } = await db
    .from("portal_candidate_portals")
    .select("access_token")
    .eq("candidate_id", candidate.id)
    .maybeSingle();
  const { data: content } = await db
    .from("portal_job_stage_content")
    .select("interview_details, prep_material")
    .eq("job_id", jobId)
    .eq("stage", stage)
    .maybeSingle();

  const base = Deno.env.get("PORTAL_PUBLIC_URL") ?? "";
  return {
    calendlyUrl: (cp?.calendly_url ?? null) as string | null,
    slots: ((cp?.availability_slots ?? []) as { label: string }[]),
    interviewDetails: content?.interview_details ?? "",
    prepMaterial: content?.prep_material ?? "",
    portalUrl: portal?.access_token
      ? `${base}/candidate/${portal.access_token}`
      : null,
  };
}

function schedulingBlock(ctx: InterviewContext) {
  if (ctx.calendlyUrl) return [`Book a time that suits you: ${ctx.calendlyUrl}`];
  if (ctx.slots.length) {
    return ["Available times:", ...ctx.slots.map((s) => `  • ${s.label}`)];
  }
  return [];
}

export function templateInterviewBody(
  candidate: EmailCandidate,
  job: EmailJob,
  stage: string,
  ctx: InterviewContext,
) {
  const lines = [
    `Hi ${firstName(candidate.name)},`,
    "",
    `Good news — you've been moved to the ${stage} stage for ${job.title} at ${job.client_name}.`,
    "",
    ...schedulingBlock(ctx),
  ];
  if (schedulingBlock(ctx).length) lines.push("");
  if (ctx.interviewDetails) lines.push("Interview details:", ctx.interviewDetails, "");
  if (ctx.prepMaterial) lines.push("How to prepare:", ctx.prepMaterial, "");
  if (ctx.portalUrl) lines.push(`Everything is also in your portal: ${ctx.portalUrl}`, "");
  lines.push("Good luck!");
  return lines.join("\n");
}

export async function aiInterviewBody(
  candidate: EmailCandidate,
  job: EmailJob,
  stage: string,
  ctx: InterviewContext,
) {
  const scheduling = ctx.calendlyUrl
    ? `Booking link (reproduce this URL exactly, character for character): ${ctx.calendlyUrl}`
    : ctx.slots.length
      ? `Availability slots (reproduce every one of these verbatim as a bulleted list, changing nothing):\n${ctx.slots.map((s) => `  • ${s.label}`).join("\n")}`
      : "No booking link or slots are available — tell them their recruiter will be in touch to arrange a time.";

  const prompt = `You are a recruiter emailing a candidate who has just reached the "${stage}" stage.

Role: ${job.title} at ${job.client_name}
Candidate first name: ${firstName(candidate.name)}

${scheduling}

Interview details for this stage (include under a clear "Interview details" heading, preserving all specifics):
${ctx.interviewDetails || "(none provided)"}

Prep material for this stage (include under a clear "How to prepare" heading):
${ctx.prepMaterial || "(none provided)"}

${ctx.portalUrl ? `Candidate portal link (reproduce exactly): ${ctx.portalUrl}` : ""}

Write the email body only — no subject line, no markdown formatting, no placeholders.
Rules:
- Warm, encouraging and concise.
- Reproduce every URL and every availability slot label EXACTLY as given. Never invent, reword, reformat or omit a time or link.
- Keep a dedicated section for the interview details and one for the prep material when they are provided; omit a section entirely if it says "(none provided)".
- Finish with a short encouraging sign-off.`;

  return await aiText(prompt, 900);
}

export async function buildInterviewEmail(
  db: Db,
  candidate: EmailCandidate,
  job: EmailJob,
  stage: string,
): Promise<BuiltEmail> {
  const jobId = candidate.job_id ?? job.id!;
  const ctx = await interviewContext(db, candidate, jobId, stage);
  const subject = `${stage} — ${job.title}`;
  const body = await aiInterviewBody(candidate, job, stage, ctx);
  if (body) return { subject, body, ai: true };
  return { subject, body: templateInterviewBody(candidate, job, stage, ctx), ai: false };
}

export async function maybeEmailInterview(
  db: Db,
  candidate: EmailCandidate,
  job: EmailJob,
  stage: string,
) {
  const settings = await agencySettings(db, job.user_id ?? null);
  if (
    !resolveToggle(job.notify_candidate_interview, settings?.notify_candidate_interview ?? false)
  ) {
    return;
  }
  const email = await buildInterviewEmail(db, candidate, job, stage);
  await deliver(
    db,
    {
      candidate_id: candidate.id,
      kind: "interview",
      to_email: candidate.email,
      subject: email.subject,
      body: email.body,
    },
    job.user_id ?? null,
  );
}

/* ------------------------------ CUSTOM EMAIL ------------------------------ */

export async function sendCustomEmail(
  db: Db,
  candidate: EmailCandidate,
  job: EmailJob,
  subject: string,
  body: string,
) {
  const personalised = body.replaceAll("{{first_name}}", firstName(candidate.name))
    .replaceAll("{{name}}", candidate.name)
    .replaceAll("{{job_title}}", job.title)
    .replaceAll("{{client_name}}", job.client_name);
  await deliver(
    db,
    {
      candidate_id: candidate.id,
      kind: "custom",
      to_email: candidate.email,
      subject,
      body: personalised,
    },
    job.user_id ?? null,
  );
  return { subject, body: personalised };
}
