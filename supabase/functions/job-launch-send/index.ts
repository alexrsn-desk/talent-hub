// Job Launch — finalises a launch:
// - Saves a job_launches record with the chosen outputs
// - Adds known/LI candidates to the job pipeline at the Contact stage
// - Logs touchpoint activities for every message marked as sent/queued
// - Marks the job as launched (search_launched_at, launch_summary)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

type MessageRecord = {
  candidate_id: string;
  channel: "email" | "linkedin" | "manual";
  status: "sent" | "queued" | "skipped";
  subject?: string;
  body?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const {
      job_id,
      personal_records = [] as MessageRecord[],
      li_records = [] as MessageRecord[],
      linkedin_post = "",
      campaign = { subject: "", body: "" },
      client_email = { subject: "", body: "" },
      client_email_sent = false,
    } = body;

    if (!job_id) return json({ error: "job_id required" }, 400);

    const knownCount = personal_records.filter((r) => r.status !== "skipped").length;
    const liCount = li_records.filter((r) => r.status !== "skipped").length;

    // 1) Insert job_launches record
    const { data: launch, error: launchErr } = await sb
      .from("job_launches")
      .insert({
        owner_user_id: user.id,
        job_id,
        known_count: knownCount,
        li_count: liCount,
        post_text: linkedin_post || null,
        campaign_subject: campaign?.subject || null,
        campaign_body: campaign?.body || null,
        client_email_sent: !!client_email_sent,
        outputs: { personal_records, li_records, linkedin_post, campaign, client_email },
      })
      .select()
      .single();
    if (launchErr) return json({ error: launchErr.message }, 500);

    // 2) Pipeline links + activity logs for each non-skipped message
    const allMsgs = [...personal_records, ...li_records].filter((r) => r.status !== "skipped" && r.candidate_id);

    // existing links
    const candIds = Array.from(new Set(allMsgs.map((m) => m.candidate_id)));
    const { data: existing = [] } = candIds.length
      ? await sb.from("candidate_jobs").select("id, candidate_id").eq("job_id", job_id).in("candidate_id", candIds)
      : { data: [] };
    const haveLink = new Set((existing as any[]).map((e) => e.candidate_id));

    const newLinks = candIds.filter((id) => !haveLink.has(id)).map((id) => ({
      owner_user_id: user.id,
      candidate_id: id,
      job_id,
      stage: "Contact",
      source: "Job Launch",
    }));
    if (newLinks.length) {
      await sb.from("candidate_jobs").insert(newLinks as any);
    }

    // activity logs (touchpoints)
    const noteRows = allMsgs.map((m) => ({
      owner_user_id: user.id,
      candidate_id: m.candidate_id,
      job_id,
      activity_type: m.channel === "email" ? "email_sent" : m.channel === "linkedin" ? "linkedin_message" : "touchpoint",
      content: `[Job Launch · ${m.status}] ${m.subject ? m.subject + " — " : ""}${(m.body || "").slice(0, 600)}`,
    }));
    if (noteRows.length) {
      await sb.from("notes").insert(noteRows as any);
    }

    // 3) Mark job as launched + summary
    const summary = {
      launched_at: new Date().toISOString(),
      known_count: knownCount,
      li_count: liCount,
      post_published: !!linkedin_post,
      campaign_ready: !!(campaign?.body),
      client_email_sent: !!client_email_sent,
    };
    await sb
      .from("jobs")
      .update({ search_launched_at: new Date().toISOString(), launch_summary: summary } as any)
      .eq("id", job_id);

    // 4) Job-level activity log
    await sb.from("notes").insert({
      owner_user_id: user.id,
      job_id,
      activity_type: "job_launched",
      content: `Search launched — ${knownCount} personal message${knownCount === 1 ? "" : "s"}, ${liCount} LI DM${liCount === 1 ? "" : "s"}${linkedin_post ? ", LinkedIn post created" : ""}${campaign?.body ? ", campaign ready" : ""}${client_email_sent ? ", client confirmation sent" : ""}.`,
    } as any);

    return json({ ok: true, launch_id: launch.id, summary });
  } catch (e: any) {
    return json({ error: e?.message || "unknown" }, 500);
  }
});
