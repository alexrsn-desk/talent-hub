import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine week boundaries (Mon-Fri of current or requested week)
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const now = new Date();
    const weekEnd = body.week_end ? new Date(body.week_end) : now;
    const dayOfWeek = weekEnd.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);

    const wsISO = weekStart.toISOString();
    const weISO = weekEnd.toISOString();
    const wsDate = wsISO.slice(0, 10);
    const weDate = weISO.slice(0, 10);

    // Fetch this week's notes (calls, meetings, emails etc)
    const { data: thisWeekNotes } = await sb
      .from("notes")
      .select("*, candidates(name), clients(company_name)")
      .gte("created_at", wsISO)
      .lte("created_at", weISO)
      .order("created_at", { ascending: false });

    // Fetch previous week's notes for comparison
    const prevWeekEnd = new Date(weekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    const prevWeekStart = new Date(prevWeekEnd);
    prevWeekStart.setDate(prevWeekEnd.getDate() - 6);
    const { data: prevWeekNotes } = await sb
      .from("notes")
      .select("id, activity_type")
      .gte("created_at", prevWeekStart.toISOString())
      .lte("created_at", prevWeekEnd.toISOString());

    // Fetch activity log for stage changes, CVs sent, jobs created
    const { data: thisWeekActivity } = await sb
      .from("activity_log")
      .select("*")
      .gte("created_at", wsISO)
      .lte("created_at", weISO);

    const { data: prevWeekActivity } = await sb
      .from("activity_log")
      .select("id, action_type")
      .gte("created_at", prevWeekStart.toISOString())
      .lte("created_at", prevWeekEnd.toISOString());

    // Fetch candidate_jobs that changed this week
    const { data: candidateJobs } = await sb
      .from("candidate_jobs")
      .select("*, candidates(name), jobs(title, clients(company_name))")
      .gte("created_at", wsISO)
      .lte("created_at", weISO);

    // Compute raw stats
    const notes = thisWeekNotes || [];
    const prevNotes = prevWeekNotes || [];
    const activity = thisWeekActivity || [];
    const prevActivity = prevWeekActivity || [];

    const callsThisWeek = notes.filter(n => n.activity_type === "Call").length;
    const callsPrevWeek = prevNotes.filter(n => n.activity_type === "Call").length;
    const meetingsThisWeek = notes.filter(n => n.activity_type === "Meeting").length;
    const meetingsPrevWeek = prevNotes.filter(n => n.activity_type === "Meeting").length;
    const cvsSent = activity.filter(a => a.action_type === "cv_sent").length;
    const cvsSentPrev = prevActivity.filter(a => a.action_type === "cv_sent").length;
    const newJobs = activity.filter(a => a.action_type === "job_created").length;
    const newJobsPrev = prevActivity.filter(a => a.action_type === "job_created").length;
    const stageChanges = activity.filter(a => a.action_type === "stage_change");
    const placements = stageChanges.filter(a => {
      const meta = a.metadata as any;
      return meta?.stage_to === "Placed";
    });
    const offers = stageChanges.filter(a => {
      const meta = a.metadata as any;
      return meta?.stage_to === "Offer";
    });

    // Build conversation content for AI analysis
    const callAndMeetingNotes = notes
      .filter(n => ["Call", "Meeting", "Email", "WhatsApp", "LinkedIn Message"].includes(n.activity_type))
      .map(n => ({
        type: n.activity_type,
        entity: n.candidate_id ? `Candidate` : `Client`,
        content: n.content,
        outcome: n.outcome,
      }));

    const statsSnapshot = {
      week: `${wsDate} to ${weDate}`,
      calls: { thisWeek: callsThisWeek, prevWeek: callsPrevWeek },
      meetings: { thisWeek: meetingsThisWeek, prevWeek: meetingsPrevWeek },
      cvsSent: { thisWeek: cvsSent, prevWeek: cvsSentPrev },
      newJobs: { thisWeek: newJobs, prevWeek: newJobsPrev },
      placements: placements.length,
      offersExtended: offers.length,
      totalStageChanges: stageChanges.length,
      totalNotes: notes.length,
    };

    const systemPrompt = `You are an expert recruitment business analyst. You produce weekly intelligence summaries for a solo recruiter.

IMPORTANT RULES:
- NEVER include real candidate or client names in content suggestions — fully anonymised insights only.
- Be direct, practical, market-informed. No generic advice.
- Use the recruiter's data to surface genuine patterns and actionable insights.
- Write content suggestions in a direct, first-person recruiter voice.

Return ONLY valid JSON with this exact structure:
{
  "performance": {
    "calls": { "count": number, "prevWeek": number, "trend": "up"|"down"|"same" },
    "meetings": { "count": number, "prevWeek": number, "trend": "up"|"down"|"same" },
    "cvsSent": { "count": number, "prevWeek": number, "trend": "up"|"down"|"same" },
    "newJobs": { "count": number, "prevWeek": number, "trend": "up"|"down"|"same" },
    "placements": number,
    "nearClose": number,
    "weekHighlight": "string"
  },
  "marketIntel": {
    "candidateThemes": ["string"],
    "clientThemes": ["string"],
    "hotSkills": ["string"],
    "salaryInsights": ["string"]
  },
  "pipeline": {
    "movedForward": ["string"],
    "goneQuiet": ["string"],
    "mondayPriorities": ["string"]
  },
  "contentSuggestions": [
    {
      "headline": "string",
      "insight": "string",
      "format": "LinkedIn post"|"short article"|"poll"
    }
  ]
}`;

    const userPrompt = `Here is my recruitment desk data for the week of ${wsDate} to ${weDate}:

## Raw Stats
${JSON.stringify(statsSnapshot, null, 2)}

## Conversations This Week (${callAndMeetingNotes.length} total touchpoints)
${callAndMeetingNotes.map((n, i) => `${i + 1}. [${n.type}] ${n.entity}: ${n.content}${n.outcome ? ` (Outcome: ${n.outcome})` : ""}`).join("\n")}

## Stage Changes This Week
${stageChanges.map(a => {
  const m = a.metadata as any;
  return `- ${m?.stage_from || "?"} → ${m?.stage_to || "?"}`;
}).join("\n") || "None"}

Analyse all of this and generate my Weekly Intelligence Summary. Remember — no real names in content suggestions.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Top up in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      throw new Error("AI generation failed");
    }

    const aiData = await aiRes.json();
    let content = aiData.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let summary;
    try {
      summary = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("AI returned invalid JSON");
    }

    // Upsert into weekly_summaries
    const { error: upsertErr } = await sb.from("weekly_summaries").upsert(
      {
        user_id: body.user_id || null,
        week_start: wsDate,
        week_end: weDate,
        summary,
      },
      { onConflict: "user_id,week_start" }
    );

    if (upsertErr) {
      console.error("Upsert error:", upsertErr);
    }

    return new Response(JSON.stringify({ summary, week_start: wsDate, week_end: weDate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("weekly-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
