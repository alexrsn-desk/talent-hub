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

async function deliver(
  db: Db,
  row: {
    candidate_id: string;
    kind: string;
    to_email: string | null;
    subject: string;
    body: string;
  },
  ownerUserId?: string | null,
) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!row.to_email) {
    await db
      .from("portal_candidate_emails")
      .insert({ ...row, status: "skipped", error: "no email on file" });
    return;
  }
  if (!key) {
    await db
      .from("portal_candidate_emails")
      .insert({ ...row, status: "pending", error: "no email provider configured" });
    return;
  }
  const settings = await agencySettings(db, ownerUserId);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: settings?.from_email || "onboarding@resend.dev",
        to: [row.to_email],
        subject: row.subject,
        text: row.body,
      }),
    });
    const ok = res.ok;
    await db.from("portal_candidate_emails").insert({
      ...row,
      status: ok ? "sent" : "error",
      error: ok ? null : `provider responded ${res.status}`,
    });
  } catch (e) {
    await db
      .from("portal_candidate_emails")
      .insert({ ...row, status: "error", error: e instanceof Error ? e.message : "send failed" });
  }
}

export async function maybeEmailInterview(
  db: Db,
  candidate: { id: string; name: string; email: string | null; job_id: string },
  job: {
    title: string;
    client_name: string;
    notify_candidate_interview: boolean | null;
    stages: string[];
    user_id?: string;
  },
  stage: string,
) {
  const settings = await agencySettings(db, job.user_id ?? null);
  if (
    !resolveToggle(job.notify_candidate_interview, settings?.notify_candidate_interview ?? false)
  ) {
    return;
  }

  const { data: cp } = await db
    .from("portal_client_portals")
    .select("calendly_url, availability_slots")
    .eq("job_id", candidate.job_id)
    .maybeSingle();
  const { data: portal } = await db
    .from("portal_candidate_portals")
    .select("access_token")
    .eq("candidate_id", candidate.id)
    .maybeSingle();
  const { data: content } = await db
    .from("portal_job_stage_content")
    .select("interview_details, prep_material")
    .eq("job_id", candidate.job_id)
    .eq("stage", stage)
    .maybeSingle();

  const slots = (cp?.availability_slots ?? []) as unknown as { label: string }[];
  const lines = [
    `Hi ${candidate.name.split(" ")[0]},`,
    "",
    `Good news — you've been moved to the ${stage} stage for ${job.title} at ${job.client_name}.`,
    "",
  ];
  if (cp?.calendly_url) lines.push(`Book a time that suits you: ${cp.calendly_url}`, "");
  else if (slots.length) {
    lines.push("Available times:", ...slots.map((s) => `  • ${s.label}`), "");
  }
  if (content?.interview_details) lines.push("Interview details:", content.interview_details, "");
  if (content?.prep_material) lines.push("Prep material:", content.prep_material, "");
  if (portal?.access_token) {
    lines.push(`Everything is also in your portal: /candidate/${portal.access_token}`, "");
  }
  lines.push("Good luck!");

  await deliver(
    db,
    {
      candidate_id: candidate.id,
      kind: "interview",
      to_email: candidate.email,
      subject: `${stage} — ${job.title}`,
      body: lines.join("\n"),
    },
    job.user_id ?? null,
  );
}

export async function maybeEmailRejection(
  db: Db,
  candidate: { id: string; name: string; email: string | null },
  job: {
    title: string;
    client_name: string;
    notify_candidate_rejection: boolean | null;
    user_id?: string;
  },
) {
  const settings = await agencySettings(db, job.user_id ?? null);
  if (
    !resolveToggle(job.notify_candidate_rejection, settings?.notify_candidate_rejection ?? false)
  ) {
    return;
  }

  const body = [
    `Hi ${candidate.name.split(" ")[0]},`,
    "",
    `Thank you for the time you gave to the ${job.title} process with ${job.client_name}.`,
    "On this occasion they've decided not to take your application further.",
    "",
    "It was a genuinely competitive process and we'd be glad to keep you in mind for other roles.",
    "",
    "With best wishes,",
  ].join("\n");

  await deliver(
    db,
    {
      candidate_id: candidate.id,
      kind: "rejection",
      to_email: candidate.email,
      subject: `Update on your application — ${job.title}`,
      body,
    },
    job.user_id ?? null,
  );
}
