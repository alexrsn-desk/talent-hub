import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Client-visible pipeline stages only. AI Suggested / Shortlist stay internal.
const PORTAL_STAGES = ["Sent CV", "First Stage", "Second Stage", "Final Stage", "Offer", "Placed"];
const INTERVIEW_STAGES = ["First Stage", "Second Stage", "Final Stage"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = await req.json();
    const { action, token } = payload ?? {};
    if (!token) return json({ error: "Missing token" }, 400);

    const { data: portal } = await supabase
      .from("client_portals")
      .select(
        "id, job_id, user_id, notify_candidate_on_interview, notify_candidate_on_reject, job_spec_synced_at",
      )
      .eq("access_token", token)
      .maybeSingle();

    if (!portal) return json({ error: "invalid_token" }, 401);

    const jobId = portal.job_id as string;

    const logActivity = async (actionType: string, extra: Record<string, unknown>) => {
      await supabase.from("activity_log").insert({
        user_id: portal.user_id,
        action_type: actionType,
        job_id: jobId,
        candidate_id: (extra.candidate_id as string) ?? null,
        candidate_job_id: (extra.candidate_job_id as string) ?? null,
        metadata: extra,
      });
    };

    if (action === "get") {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, title, client_id, location, description")
        .eq("id", jobId)
        .maybeSingle();
      if (!job) return json({ error: "invalid_token" }, 401);

      let clientName: string | null = null;
      if (job.client_id) {
        const { data: client } = await supabase
          .from("clients")
          .select("company_name")
          .eq("id", job.client_id)
          .maybeSingle();
        clientName = client?.company_name ?? null;
      }

      // Never select * from candidates — only client-safe fields.
      const { data: rows } = await supabase
        .from("candidate_jobs")
        .select("id, stage, withdrawn, candidate_id, candidates(name, job_title, client_ready_notes, cv_file_url)")
        .eq("job_id", jobId)
        .in("stage", PORTAL_STAGES);

      const candidates = (rows ?? []).map((r: any) => ({
        candidate_job_id: r.id,
        candidate_id: r.candidate_id,
        stage: r.stage,
        rejected: !!r.withdrawn,
        name: r.candidates?.name ?? "Candidate",
        headline: r.candidates?.job_title ?? null,
        client_ready_notes: r.candidates?.client_ready_notes ?? null,
        cv_url: r.candidates?.cv_file_url ?? null,
      }));

      const cjIds = candidates.map((c) => c.candidate_job_id);
      let feedback: any[] = [];
      if (cjIds.length) {
        const { data } = await supabase
          .from("portal_feedback")
          .select("id, candidate_job_id, client_email, stage_at_time, comment, rating, created_at")
          .in("candidate_job_id", cjIds)
          .order("created_at", { ascending: true });
        feedback = data ?? [];
      }

      const { data: notes } = await supabase
        .from("portal_notes")
        .select("id, author_email, body, created_at")
        .eq("client_portal_id", portal.id)
        .order("created_at", { ascending: false });

      const { data: stageContent } = await supabase
        .from("portal_stage_content")
        .select("stage, prep_material, interview_details")
        .eq("job_id", jobId);

      const { data: scheduling } = await supabase
        .from("portal_scheduling")
        .select("calendly_url, slots")
        .eq("job_id", jobId)
        .maybeSingle();

      const { data: settings } = await supabase
        .from("interview_settings")
        .select("auto_send_confirmation, auto_send_reminder")
        .eq("user_id", portal.user_id)
        .maybeSingle();

      return json({
        job: { id: job.id, title: job.title, location: job.location, description: job.description },
        job_spec_synced_at: portal.job_spec_synced_at ?? null,
        client_name: clientName,
        stages: PORTAL_STAGES,
        interview_stages: INTERVIEW_STAGES,
        candidates,
        feedback,
        notes: notes ?? [],
        stage_content: stageContent ?? [],
        scheduling: scheduling ?? { calendly_url: null, slots: [] },
        notification_settings: [
          { label: "Interview invitations sent to candidates", on: !!settings?.auto_send_confirmation },
          { label: "Interview reminders sent to candidates", on: !!settings?.auto_send_reminder },
          { label: "Outcome / rejection emails sent by the recruiter", on: true },
          { label: "Interview invitations sent to candidates on this job", on: !!portal.notify_candidate_on_interview },
          { label: "Rejection emails sent to candidates on this job", on: !!portal.notify_candidate_on_reject },
        ],
      });
    }

    if (action === "move") {
      const { candidate_job_id, to_stage, reject, actor_email } = payload;
      const { data: row } = await supabase
        .from("candidate_jobs")
        .select("id, stage, candidate_id, candidates(name)")
        .eq("id", candidate_job_id)
        .eq("job_id", jobId)
        .maybeSingle();
      if (!row) return json({ error: "Candidate not found on this job" }, 404);

      const update: Record<string, unknown> = reject
        ? { withdrawn: true, withdrawn_reason: `Rejected by client via portal${actor_email ? ` (${actor_email})` : ""}`, withdrawn_at: new Date().toISOString() }
        : { stage: to_stage, withdrawn: false };

      if (!reject && !PORTAL_STAGES.includes(to_stage)) return json({ error: "Invalid stage" }, 400);

      const { error } = await supabase.from("candidate_jobs").update(update).eq("id", candidate_job_id);
      if (error) throw error;

      const name = (row as any).candidates?.name ?? "Candidate";
      await logActivity("client_moved_stage", {
        candidate_id: row.candidate_id,
        candidate_job_id,
        actor_email: actor_email ?? null,
        content: `Client moved ${name} to ${reject ? "Rejected / Withdrawn" : to_stage} via portal`,
      });

      return json({ success: true });
    }

    if (action === "add_feedback") {
      const { candidate_job_id, comment, rating, stage, client_email } = payload;
      if (!comment?.trim()) return json({ error: "Comment required" }, 400);

      const { data: row } = await supabase
        .from("candidate_jobs")
        .select("id, candidate_id, candidates(name)")
        .eq("id", candidate_job_id)
        .eq("job_id", jobId)
        .maybeSingle();
      if (!row) return json({ error: "Candidate not found on this job" }, 404);

      const { error } = await supabase.from("portal_feedback").insert({
        candidate_job_id,
        client_email: client_email ?? null,
        stage_at_time: stage ?? null,
        comment: comment.trim(),
        rating: rating ?? null,
      });
      if (error) throw error;

      const name = (row as any).candidates?.name ?? "Candidate";
      await logActivity("client_feedback_received", {
        candidate_id: row.candidate_id,
        candidate_job_id,
        actor_email: client_email ?? null,
        rating: rating ?? null,
        content: `Client feedback on ${name}: ${comment.trim().slice(0, 160)}`,
      });

      return json({ success: true });
    }

    if (action === "add_note") {
      const { body, author_email } = payload;
      if (!body?.trim()) return json({ error: "Note required" }, 400);
      const { error } = await supabase.from("portal_notes").insert({
        client_portal_id: portal.id,
        author_email: author_email ?? null,
        body: body.trim(),
      });
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "save_stage_content") {
      const { stage, prep_material, interview_details } = payload;
      if (!stage) return json({ error: "Stage required" }, 400);
      const { error } = await supabase
        .from("portal_stage_content")
        .upsert(
          { job_id: jobId, stage, prep_material: prep_material ?? null, interview_details: interview_details ?? null },
          { onConflict: "job_id,stage" },
        );
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "save_scheduling") {
      const { calendly_url, slots } = payload;
      const { error } = await supabase
        .from("portal_scheduling")
        .upsert({ job_id: jobId, calendly_url: calendly_url ?? null, slots: slots ?? [] }, { onConflict: "job_id" });
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("client-portal error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
