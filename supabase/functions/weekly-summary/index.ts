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

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // Determine the "week" we're generating for (used as the storage key).
    // Default: the Mon-Fri window containing the supplied week_end (or today).
    const now = new Date();
    const weekEnd = body.week_end ? new Date(body.week_end) : now;
    const dayOfWeek = weekEnd.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekFriday = new Date(weekStart);
    weekFriday.setDate(weekStart.getDate() + 4);
    weekFriday.setHours(23, 59, 59, 999);

    const wsDate = weekStart.toISOString().slice(0, 10);
    const weDate = weekFriday.toISOString().slice(0, 10);

    // For DATA fetch we use the full Mon-Sun calendar week so weekend
    // activity is captured. For the current/future week we cap the end at
    // "now" so we summarize everything up to this moment.
    const weekSunday = new Date(weekStart);
    weekSunday.setDate(weekStart.getDate() + 6);
    weekSunday.setHours(23, 59, 59, 999);

    const dataWindowEnd = weekSunday > now ? now : weekSunday;
    const dataWindowStart = new Date(weekStart);

    const dwsISO = dataWindowStart.toISOString();
    const dweISO = dataWindowEnd.toISOString();

    // Previous calendar week for trend comparison
    const prevWindowEnd = new Date(weekStart);
    prevWindowEnd.setMilliseconds(prevWindowEnd.getMilliseconds() - 1);
    const prevWindowStart = new Date(prevWindowEnd);
    prevWindowStart.setDate(prevWindowEnd.getDate() - 6);
    prevWindowStart.setHours(0, 0, 0, 0);

    console.log("weekly-summary: window", {
      wsDate, weDate,
      dataWindow: [dwsISO, dweISO],
      prevWindow: [prevWindowStart.toISOString(), prevWindowEnd.toISOString()],
      user_id: body.user_id ?? null,
    });

    // Fetch this period's notes (calls, meetings, emails, etc) — include transcripts
    const { data: thisPeriodNotes, error: notesErr } = await sb
      .from("notes")
      .select("id, activity_type, content, outcome, transcript, duration, created_at, candidates(name), clients(company_name)")
      .gte("created_at", dwsISO)
      .lte("created_at", dweISO)
      .order("created_at", { ascending: false });
    if (notesErr) console.error("notes fetch error:", notesErr);

    const { data: prevPeriodNotes } = await sb
      .from("notes")
      .select("id, activity_type")
      .gte("created_at", prevWindowStart.toISOString())
      .lte("created_at", prevWindowEnd.toISOString());

    const { data: thisPeriodActivity } = await sb
      .from("activity_log")
      .select("*")
      .gte("created_at", dwsISO)
      .lte("created_at", dweISO);

    const { data: prevPeriodActivity } = await sb
      .from("activity_log")
      .select("id, action_type")
      .gte("created_at", prevWindowStart.toISOString())
      .lte("created_at", prevWindowEnd.toISOString());

    const { data: candidateJobs } = await sb
      .from("candidate_jobs")
      .select("*, candidates(name), jobs(title, clients(company_name))")
      .gte("created_at", dwsISO)
      .lte("created_at", dweISO);

    // Signals fired this week (for Signal Summary in Section 1)
    const noteIdsThisWeek = (thisPeriodNotes || []).map((n) => n.id);
    let signalsThisWeek: any[] = [];
    if (noteIdsThisWeek.length > 0) {
      const { data: sigs } = await sb
        .from("call_signals")
        .select("signal_type, signal_category, trigger_phrase, suggested_action, status, priority_score, days_unactioned, created_at")
        .in("note_id", noteIdsThisWeek);
      signalsThisWeek = sigs || [];
    }

    const notes = thisPeriodNotes || [];

    const prevNotes = prevPeriodNotes || [];
    const activity = thisPeriodActivity || [];
    const prevActivity = prevPeriodActivity || [];

    const callsThisWeek = notes.filter((n) => n.activity_type === "Call").length;
    const callsPrevWeek = prevNotes.filter((n) => n.activity_type === "Call").length;
    const meetingsThisWeek = notes.filter((n) => n.activity_type === "Meeting").length;
    const meetingsPrevWeek = prevNotes.filter((n) => n.activity_type === "Meeting").length;
    const cvsSent = activity.filter((a) => a.action_type === "cv_sent").length;
    const cvsSentPrev = prevActivity.filter((a) => a.action_type === "cv_sent").length;
    const newJobs = activity.filter((a) => a.action_type === "job_created").length;
    const newJobsPrev = prevActivity.filter((a) => a.action_type === "job_created").length;
    const stageChanges = activity.filter((a) => a.action_type === "stage_change");
    const placements = stageChanges.filter((a) => (a.metadata as any)?.stage_to === "Placed");
    const offers = stageChanges.filter((a) => (a.metadata as any)?.stage_to === "Offer");
    const touchpoints = activity.filter((a) => a.action_type === "touchpoint_logged");

    const totalDataPoints =
      notes.length + activity.length + (candidateJobs?.length || 0);

    console.log("weekly-summary: data snapshot", {
      notes: notes.length,
      withTranscripts: notes.filter((n) => n.transcript).length,
      activity: activity.length,
      stageChanges: stageChanges.length,
      candidateJobs: candidateJobs?.length || 0,
      totalDataPoints,
    });

    // If there's truly nothing to summarize, return an explicit empty
    // response instead of asking the AI to invent generic platitudes.
    if (totalDataPoints === 0) {
      const emptySummary = {
        performance: {
          calls: { count: 0, prevWeek: callsPrevWeek, trend: "same" },
          meetings: { count: 0, prevWeek: meetingsPrevWeek, trend: "same" },
          cvsSent: { count: 0, prevWeek: cvsSentPrev, trend: "same" },
          newJobs: { count: 0, prevWeek: newJobsPrev, trend: "same" },
          placements: 0,
          nearClose: 0,
          weekHighlight:
            "No notes, calls, touchpoints or pipeline movement recorded in the last 7 days. Log activity through the week and re-run this summary on Friday.",
        },
        desk: {
          candidateSentiment: { label: "Unknown", evidence: "" },
          themes: [],
          salaryIntel: { summary: "", examples: [] },
          companiesMentioned: { wantToJoin: [], leaving: [] },
          signalSummary: { total: 0, byCategory: {}, topUnactioned: "" },
          companySignalsFromNotes: [],
        },
        marketIntel: {
          candidateThemes: [],
          clientThemes: [],
          hotSkills: [],
          salaryInsights: [],
        },
        pipeline: {
          movedForward: [],
          goneQuiet: [],
          mondayPriorities: [
            "Log every call, meeting and touchpoint as they happen so this brief has something to analyse.",
          ],
        },
        contentSuggestions: [],
        meta: { dataAvailable: false, dataPoints: 0 },
      };

      const { error: upsertErr } = await sb.from("weekly_summaries").upsert(
        {
          user_id: body.user_id || null,
          week_start: wsDate,
          week_end: weDate,
          summary: emptySummary,
        },
        { onConflict: "user_id,week_start" },
      );
      if (upsertErr) console.error("Upsert error (empty):", upsertErr);

      return new Response(
        JSON.stringify({
          summary: emptySummary,
          week_start: wsDate,
          week_end: weDate,
          dataAvailable: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build the conversation content for AI analysis. Include transcripts
    // (truncated) when present — these are the richest source of intel.
    const conversationContent = notes
      .filter((n) =>
        ["Call", "Meeting", "Email", "WhatsApp", "LinkedIn Message", "Note"].includes(
          n.activity_type,
        ),
      )
      .map((n) => {
        const entity =
          (n as any).candidates?.name || (n as any).clients?.company_name || "Unknown";
        const transcript = n.transcript
          ? `\n   TRANSCRIPT: ${String(n.transcript).slice(0, 1500)}`
          : "";
        return {
          type: n.activity_type,
          entity,
          createdAt: n.created_at ? new Date(n.created_at).toISOString().slice(0, 10) : "",
          content: n.content || "",
          outcome: n.outcome || "",
          transcript,
        };
      });

    const statsSnapshot = {
      window: `${dwsISO.slice(0, 10)} to ${dweISO.slice(0, 10)}`,
      calls: { thisWeek: callsThisWeek, prevWeek: callsPrevWeek },
      meetings: { thisWeek: meetingsThisWeek, prevWeek: meetingsPrevWeek },
      cvsSent: { thisWeek: cvsSent, prevWeek: cvsSentPrev },
      newJobs: { thisWeek: newJobs, prevWeek: newJobsPrev },
      placements: placements.length,
      offersExtended: offers.length,
      touchpoints: touchpoints.length,
      totalStageChanges: stageChanges.length,
      totalNotes: notes.length,
      notesWithTranscripts: notes.filter((n) => n.transcript).length,
    };

    // Aggregate signals by category for the Signal Summary block
    const sigByCat: Record<string, number> = {};
    for (const s of signalsThisWeek) {
      const c = (s.signal_category || "other").toString();
      sigByCat[c] = (sigByCat[c] || 0) + 1;
    }
    const topUnactioned = signalsThisWeek
      .filter((s) => s.status !== "actioned" && s.status !== "dismissed")
      .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))[0];

    const signalsDigest = {
      total: signalsThisWeek.length,
      byCategory: sigByCat,
      topUnactioned: topUnactioned
        ? {
            type: topUnactioned.signal_type,
            category: topUnactioned.signal_category,
            phrase: topUnactioned.trigger_phrase,
            action: topUnactioned.suggested_action,
            daysUnactioned: topUnactioned.days_unactioned,
          }
        : null,
    };

    const systemPrompt = `You are an expert recruitment business analyst. You produce a weekly intelligence summary for a solo recruiter, focused on what they heard on their own calls this week.

IMPORTANT RULES:
- Base every insight strictly on the data provided. Do NOT invent facts.
- NEVER include real candidate or client names in contentSuggestions — fully anonymised insights only.
- In "desk" sections, you MAY name specific companies and people because those come from the recruiter's own notes.
- Be direct, practical, market-informed. No generic advice.
- If a section has no supporting data, return an empty array / null rather than filler.

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
  "desk": {
    "candidateSentiment": {
      "label": "Cautious"|"Active"|"Optimistic"|"Mixed"|"Unknown",
      "evidence": "one short sentence citing language patterns from the notes"
    },
    "themes": [
      { "topic": "string", "mentions": number, "note": "short context, e.g. 'recurring theme this week'" }
    ],
    "salaryIntel": {
      "summary": "one short sentence on salary expectations heard this week",
      "examples": ["string"]
    },
    "companiesMentioned": {
      "wantToJoin": ["Company name — short reason / count"],
      "leaving": ["Company name — short reason / count"]
    },
    "signalSummary": {
      "total": number,
      "byCategory": { "revenue": number, "bd": number, "pipeline": number, "other": number },
      "topUnactioned": "one sentence describing the most important unactioned signal, or empty string"
    },
    "companySignalsFromNotes": [
      { "company": "string", "person": "string|optional", "signal": "funding|hiring|leadership|restructure|other", "detail": "string", "source": "e.g. 'call note Tuesday'" }
    ]
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
    { "headline": "string", "insight": "string", "format": "LinkedIn post"|"short article"|"poll" }
  ]
}`;

    const userPrompt = `Here is my recruitment desk data for the rolling 7-day window ${dwsISO.slice(0, 10)} to ${dweISO.slice(0, 10)}:

## Raw Stats
${JSON.stringify(statsSnapshot, null, 2)}

## Signals fired this week
${JSON.stringify(signalsDigest, null, 2)}

## Conversations & Notes (${conversationContent.length} touchpoints)
${conversationContent
  .map(
    (n, i) =>
      `${i + 1}. [${n.type}] ${n.entity} (${n.createdAt || ""}): ${n.content}${n.outcome ? ` (Outcome: ${n.outcome})` : ""}${n.transcript}`,
  )
  .join("\n")}

## Stage Changes
${stageChanges
  .map((a) => {
    const m = a.metadata as any;
    return `- ${m?.stage_from || "?"} → ${m?.stage_to || "?"}`;
  })
  .join("\n") || "None"}

Analyse all of this and generate my Weekly Intelligence Summary. For the "desk" object, extract sentiment, recurring themes (with mention counts), salary numbers actually mentioned, company names candidates want to join or are leaving, and any funding/hiring/leadership/restructure signals you can spot in the notes. No real candidate names in contentSuggestions.`;


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
        max_tokens: 4096,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits exhausted. Top up in Settings > Workspace > Usage.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      throw new Error("AI generation failed");
    }

    const aiData = await aiRes.json();
    const finishReason = aiData.choices?.[0]?.finish_reason;
    let content: string = aiData.choices?.[0]?.message?.content || "";
    console.log("weekly-summary: AI response", {
      finishReason,
      contentLength: content.length,
      usage: aiData.usage,
    });

    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let summary;
    try {
      summary = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", content.slice(0, 500));
      throw new Error("AI returned invalid JSON");
    }

    summary.meta = { dataAvailable: true, dataPoints: totalDataPoints };

    const { error: upsertErr } = await sb.from("weekly_summaries").upsert(
      {
        user_id: body.user_id || null,
        week_start: wsDate,
        week_end: weDate,
        summary,
      },
      { onConflict: "user_id,week_start" },
    );

    if (upsertErr) console.error("Upsert error:", upsertErr);

    return new Response(
      JSON.stringify({ summary, week_start: wsDate, week_end: weDate, dataAvailable: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("weekly-summary error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
