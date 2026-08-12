import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Real Desky stages in pipeline order.
const REAL_ORDER = [
  "AI Suggested",
  "Shortlist",
  "Sent CV",
  "First Stage",
  "Second Stage",
  "Final Stage",
  "Offer",
  "Placed",
];

// Internal-only stages the candidate never sees.
const INTERNAL_STAGES = ["AI Suggested", "Shortlist", "Screening", "Longlist"];
const INTERVIEW_STAGES = ["First Stage", "Second Stage", "Final Stage"];

// Simplified candidate-facing journey.
const CANDIDATE_STEPS = [
  { key: "submitted", label: "Application submitted", real: ["Sent CV"] },
  { key: "first", label: "First interview", real: ["First Stage"] },
  { key: "second", label: "Second interview", real: ["Second Stage"] },
  { key: "final", label: "Final interview", real: ["Final Stage"] },
  { key: "offer", label: "Offer", real: ["Offer", "Placed"] },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = await req.json();
    const { token } = payload ?? {};
    if (!token) return json({ error: "Missing token" }, 400);

    const { data: portal } = await supabase
      .from("candidate_portals")
      .select("id, candidate_job_id")
      .eq("access_token", token)
      .maybeSingle();

    if (!portal) return json({ error: "invalid_token" }, 401);

    const { data: cj } = await supabase
      .from("candidate_jobs")
      .select("id, stage, withdrawn, job_id, candidate_id, candidates(first_name)")
      .eq("id", portal.candidate_job_id)
      .maybeSingle();

    if (!cj) return json({ error: "invalid_token" }, 401);

    const { data: job } = await supabase
      .from("jobs")
      .select("id, title, location, description, client_id")
      .eq("id", cj.job_id)
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

    const rejected = !!cj.withdrawn;
    const stage = cj.stage as string;
    const visibleStage = INTERNAL_STAGES.includes(stage) ? "Sent CV" : stage;
    const reachedIndex = Math.max(0, REAL_ORDER.indexOf(visibleStage));

    // Progressive reveal: only steps the candidate has actually reached exist at all.
    const steps = CANDIDATE_STEPS.filter((s) =>
      s.real.some((r) => REAL_ORDER.indexOf(r) <= reachedIndex)
    ).map((s) => ({
      key: s.key,
      label: s.label,
      current: s.real.includes(visibleStage),
    }));

    const currentStepLabel = steps.find((s) => s.current)?.label ?? "Application submitted";

    // Prep/details only for interview stages already reached.
    const unlockedStages = INTERVIEW_STAGES.filter(
      (s) => REAL_ORDER.indexOf(s) <= reachedIndex,
    );

    let stageContent: { stage: string; prep_material: string | null; interview_details: string | null }[] = [];
    if (!rejected && unlockedStages.length) {
      const { data } = await supabase
        .from("portal_stage_content")
        .select("stage, prep_material, interview_details")
        .eq("job_id", job.id)
        .in("stage", unlockedStages);
      stageContent = (data ?? []).filter((c) => c.prep_material || c.interview_details);
    }

    // Scheduling only once an interview stage is reached.
    let scheduling: { calendly_url: string | null; slots: unknown } | null = null;
    if (!rejected && unlockedStages.length) {
      const { data } = await supabase
        .from("portal_scheduling")
        .select("calendly_url, slots")
        .eq("job_id", job.id)
        .maybeSingle();
      if (data && (data.calendly_url || (Array.isArray(data.slots) && data.slots.length))) {
        scheduling = data;
      }
    }

    return json({
      candidate_first_name: (cj as any).candidates?.first_name ?? null,
      rejected,
      job: {
        title: job.title,
        location: job.location,
        description: rejected ? null : job.description,
      },
      company_name: clientName,
      current_step: rejected ? null : currentStepLabel,
      steps: rejected ? [] : steps,
      // Ordered candidate-facing: details above prep.
      stage_content: stageContent.map((c) => ({
        stage: c.stage,
        interview_details: c.interview_details,
        prep_material: c.prep_material,
      })),
      scheduling,
    });
  } catch (err) {
    console.error("candidate-portal error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
