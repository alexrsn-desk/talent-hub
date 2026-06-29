import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert recruitment consultant preparing call prompts for a recruiter.

RULES:
- Never generate a question that previous notes already answer — do not ask what you already know
- If motivation was covered last call, go deeper this time not broader
- If counter offer risk was flagged before, prioritise it again in Phase 5
- Flag any phase that was skipped on last call with a note like: "This was not covered last time — make sure to cover it today"
- Adapt language to stage — first call warmer and broader, later calls more direct and specific
- If the candidate is linked to a specific job, add role-specific questions in Phase 2 and 3 based on the job spec
- Generate 2-3 natural conversational questions per phase
- Always include one AI-specific probe in Phase 2 for candidate calls

Return a JSON object with this structure:
{
  "phases": [
    {
      "number": 1,
      "title": "Phase title",
      "goal": "Brief goal description",
      "questions": ["Question 1", "Question 2", "Question 3"],
      "priority": "normal" | "critical",
      "skipped_last_time": false,
      "skipped_note": null
    }
  ]
}

For CANDIDATE calls use these 5 phases:
1. WARM UP — build rapport, gather basics about current role, tech stack, team size, what drew them to the company
2. PROBE CURRENT SITUATION — open questions about team changes, tech direction, management, AI impact, growth opportunities. Do NOT ask about motivation directly yet.
3. MOTIVATION — now ask directly about what prompted the conversation, ideal next move, must-haves vs nice-to-haves
4. PRACTICALITIES — notice period, other processes, current total package
5. CLOSE — counter offer risk, what makes them say yes/no, agreed next steps. Mark as priority: "critical"

For CLIENT calls use these 4 phases:
1. RELATIONSHIP CHECK — how things are going, business changes, team updates
2. ROLE AND URGENCY — what changed on the role, seen other candidates, risk of not filling, budget confirmed
3. PROCESS AND DECISION MAKING — who decides, process from here, timeline to offer
4. BD AND RELATIONSHIP — other roles coming up, referrals, how to add more value

Return ONLY valid JSON, no markdown.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entity_type, entity_id } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch entity data
    let entityData: any = null;
    let entityName = "";
    if (entity_type === "candidate") {
      const { data } = await supabase.from("candidates").select("*").eq("id", entity_id).single();
      entityData = data;
      entityName = data?.name || "Unknown";
    } else {
      const { data } = await supabase.from("clients").select("*").eq("id", entity_id).single();
      entityData = data;
      entityName = data?.company_name || "Unknown";
    }

    // Fetch notes, signals, candidate_jobs in parallel
    const [notesRes, signalsRes, jobsRes, profileRes] = await Promise.all([
      supabase.from("notes")
        .select("*")
        .eq(entity_type === "candidate" ? "candidate_id" : "client_id", entity_id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("call_signals")
        .select("*, notes!inner(candidate_id, client_id)")
        .eq("status", "unactioned"),
      entity_type === "candidate"
        ? supabase.from("candidate_jobs").select("*, jobs(*)").eq("candidate_id", entity_id)
        : Promise.resolve({ data: [] }),
      supabase.from("recruiter_profiles").select("*").limit(1).single(),
    ]);

    const notes = notesRes.data || [];
    const allSignals = signalsRes.data || [];
    const relevantSignals = allSignals.filter((s: any) => {
      const note = s.notes;
      if (entity_type === "candidate") return note?.candidate_id === entity_id;
      return note?.client_id === entity_id;
    });
    const linkedJobs = jobsRes.data || [];
    const profile = profileRes.data;

    // Screening framework gaps — used to nudge coverage on this call.
    const SECTION_TITLES: Record<number, string> = {
      1: "Who they are", 2: "The money", 3: "Why they're looking", 4: "What they want",
      5: "What they won't do", 6: "Skills and background", 7: "Market feedback",
      8: "Current role insights", 9: "Referrals",
    };
    let screeningGapsContext = "";
    if (entity_type === "candidate") {
      const { data: sfi } = await supabase
        .from("screening_framework_items")
        .select("section, value")
        .eq("candidate_id", entity_id);
      const covered = new Set<number>();
      for (const r of (sfi || []) as any[]) {
        if (r.value && r.value.trim().length > 0) covered.add(r.section);
      }
      const missing = [1,2,3,4,5,6,7,8,9].filter((s) => !covered.has(s));
      if (missing.length > 0) {
        screeningGapsContext = `SCREENING FRAMEWORK — sections still missing for this candidate: ${missing.map((s) => `${s} ${SECTION_TITLES[s]}`).join("; ")}. Weave at least 1-2 questions from each missing section into the phases below.`;
      } else {
        screeningGapsContext = `SCREENING FRAMEWORK — all nine sections already captured. Focus on what has changed since last contact.`;
      }
    }

    // Build context
    const notesContext = notes.map((n: any) =>
      `[${n.created_at?.split("T")[0]}] ${n.activity_type}: ${n.content}${n.outcome ? ` | Outcome: ${n.outcome}` : ""}${n.transcript ? ` | Transcript excerpt: ${n.transcript.slice(0, 500)}` : ""}`
    ).join("\n");

    const signalsContext = relevantSignals.map((s: any) =>
      `Signal: ${s.signal_type} — "${s.trigger_phrase}" — ${s.suggested_action}`
    ).join("\n");

    const jobsContext = linkedJobs.map((cj: any) =>
      `Linked job: ${cj.jobs?.title || "Unknown"} at stage ${cj.stage}${cj.jobs?.location ? ` (${cj.jobs.location})` : ""}${cj.jobs?.salary_min ? ` £${cj.jobs.salary_min}-${cj.jobs.salary_max}` : ""}`
    ).join("\n");

    const profileContext = profile
      ? `Recruiter specialises in: ${(profile.niches || []).join(", ")}. Markets: ${(profile.locations || []).join(", ")}. Placement type: ${profile.placement_type || "Both"}.`
      : "";

    const userPrompt = `Generate call prep prompts for a ${entity_type.toUpperCase()} call.

ENTITY: ${entityName}
${entity_type === "candidate" ? `Job Title: ${entityData?.job_title || "Unknown"}\nEmployer: ${entityData?.current_employer || "Unknown"}\nStatus: ${entityData?.status || "Unknown"}\nSalary: ${entityData?.salary_current ? `£${entityData.salary_current}` : "Not recorded"}` : `Contact: ${entityData?.contact_name || "Unknown"}\nSector: ${entityData?.sector || "Unknown"}\nStatus: ${entityData?.status || "Unknown"}`}

PREVIOUS NOTES (most recent first):
${notesContext || "No previous notes"}

UNACTIONED SIGNALS:
${signalsContext || "None"}

${entity_type === "candidate" ? `LINKED JOBS:\n${jobsContext || "None"}` : ""}

RECRUITER PROFILE:
${profileContext || "No profile data"}

${screeningGapsContext}

TODAY: ${new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Number of previous calls/notes: ${notes.length}. ${notes.length === 0 ? "This is a FIRST CALL — be warmer and broader." : "This is a follow-up — be more direct and specific."}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_call_prep",
            description: "Generate structured call prep phases with questions",
            parameters: {
              type: "object",
              properties: {
                phases: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      number: { type: "number" },
                      title: { type: "string" },
                      goal: { type: "string" },
                      questions: { type: "array", items: { type: "string" } },
                      priority: { type: "string", enum: ["normal", "critical"] },
                      skipped_last_time: { type: "boolean" },
                      skipped_note: { type: "string" },
                    },
                    required: ["number", "title", "goal", "questions", "priority", "skipped_last_time"],
                  },
                },
              },
              required: ["phases"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_call_prep" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let phases;
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      phases = parsed.phases;
    } else {
      // Fallback: try parsing content directly
      const content = aiData.choices?.[0]?.message?.content || "{}";
      const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
      phases = JSON.parse(cleaned).phases || [];
    }

    return new Response(JSON.stringify({ phases, entity_name: entityName, entity_type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("call-prep error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
