import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { action, token, client_id } = await req.json();

    if (action === "validate") {
      // Validate a magic link token
      const { data: access, error } = await supabase
        .from("client_portal_access")
        .select("*, clients(*)")
        .eq("magic_link_token", token)
        .eq("enabled", true)
        .single();

      if (error || !access) {
        return new Response(JSON.stringify({ error: "Invalid or expired link" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (access.token_expires_at && new Date(access.token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Link has expired" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update last accessed
      await supabase.from("client_portal_access").update({ last_accessed_at: new Date().toISOString() }).eq("id", access.id);

      return new Response(JSON.stringify({ client: access.clients, access_id: access.id, client_id: access.client_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate_link") {
      // Generate a new magic link for a client
      const token = crypto.randomUUID() + "-" + crypto.randomUUID();
      const expires = new Date();
      expires.setDate(expires.getDate() + 30); // 30 day expiry

      const { data: existing } = await supabase
        .from("client_portal_access")
        .select("id")
        .eq("client_id", client_id)
        .single();

      if (existing) {
        await supabase.from("client_portal_access").update({
          magic_link_token: token,
          token_expires_at: expires.toISOString(),
          enabled: true,
        }).eq("id", existing.id);
      } else {
        await supabase.from("client_portal_access").insert({
          client_id,
          magic_link_token: token,
          token_expires_at: expires.toISOString(),
          enabled: true,
        });
      }

      return new Response(JSON.stringify({ token }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle") {
      await supabase
        .from("client_portal_access")
        .update({ enabled: !!(await req.json()).enabled })
        .eq("client_id", client_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_portal_data") {
      // Get all data for a client's portal view
      const { data: jobs } = await supabase
        .from("jobs")
        .select("*")
        .eq("client_id", client_id)
        .in("status", ["Open", "Active"]);

      const jobIds = (jobs || []).map((j: any) => j.id);

      let candidateJobs: any[] = [];
      if (jobIds.length > 0) {
        const { data } = await supabase
          .from("candidate_jobs")
          .select("*, candidates(*), candidate_summaries(*)")
          .in("job_id", jobIds);
        candidateJobs = data || [];
      }

      // Get feedback already submitted
      const { data: feedback } = await supabase
        .from("client_feedback")
        .select("*")
        .eq("client_id", client_id);

      // Get recent notes/activity for these jobs
      let recentActivity: any[] = [];
      if (jobIds.length > 0) {
        const { data } = await supabase
          .from("notes")
          .select("*")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false })
          .limit(20);
        recentActivity = data || [];
      }

      return new Response(JSON.stringify({ jobs, candidateJobs, feedback, recentActivity }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "submit_feedback") {
      const { candidate_job_id, status, reason, rating, strengths, concerns, decision, feedback_type } = await req.json();

      // Insert feedback
      const { data: fb, error: fbError } = await supabase.from("client_feedback").insert({
        candidate_job_id,
        client_id,
        status: status || "pending",
        reason,
        rating,
        strengths,
        concerns,
        decision,
        feedback_type: feedback_type || "review",
      }).select().single();

      if (fbError) throw fbError;

      // Update candidate_jobs stage based on feedback
      if (status === "interested") {
        await supabase.from("candidate_jobs").update({ stage: "Client Interested" }).eq("id", candidate_job_id);
      } else if (status === "not_suitable") {
        await supabase.from("candidate_jobs").update({ stage: "Client Rejected" }).eq("id", candidate_job_id);
      }

      if (decision === "progress") {
        await supabase.from("candidate_jobs").update({ stage: "Progressed" }).eq("id", candidate_job_id);
      } else if (decision === "reject") {
        await supabase.from("candidate_jobs").update({ stage: "Client Rejected" }).eq("id", candidate_job_id);
      } else if (decision === "offer") {
        await supabase.from("candidate_jobs").update({ stage: "Offer" }).eq("id", candidate_job_id);
      }

      // Create notification for recruiter
      const { data: client } = await supabase.from("clients").select("company_name").eq("id", client_id).single();
      const { data: cj } = await supabase.from("candidate_jobs").select("candidates(name)").eq("id", candidate_job_id).single();

      const candidateName = (cj as any)?.candidates?.name || "A candidate";
      const companyName = client?.company_name || "A client";

      await supabase.from("notifications").insert({
        type: feedback_type === "interview" ? "interview_feedback" : "candidate_review",
        title: feedback_type === "interview" ? "Interview Feedback Received" : "Client Reviewed Candidate",
        message: `${companyName} ${feedback_type === "interview" ? "left interview feedback for" : "reviewed"} ${candidateName}: ${status || decision}`,
        data: { candidate_job_id, client_id, feedback_id: fb.id },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
