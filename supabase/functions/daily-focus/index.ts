import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(supabaseUrl, supabaseKey);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000).toISOString().split("T")[0];
    const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000).toISOString().split("T")[0];
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
    const tenDaysAgo = new Date(now.getTime() - 10 * 86400000).toISOString().split("T")[0];
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString().split("T")[0];
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];

    // Fetch all data in parallel
    const [
      { data: candidateJobs },
      { data: jobs },
      { data: clients },
      { data: recentNotes },
      { data: overdueFollowUps },
      { data: todayFollowUps },
      { data: candidates },
      { data: contacts },
    ] = await Promise.all([
      sb.from("candidate_jobs").select("*, candidates(*), jobs(*, clients(*))"),
      sb.from("jobs").select("*, clients(*)"),
      sb.from("clients").select("*"),
      sb.from("notes").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("notes").select("*, candidates(*), clients(*)").not("follow_up_date", "is", null).lt("follow_up_date", today),
      sb.from("notes").select("*, candidates(*), clients(*)").eq("follow_up_date", today),
      sb.from("candidates").select("id, name, status, reengage_date, reengage_reason"),
      sb.from("contacts").select("id, name, status, client_id, reengage_date, reengage_reason"),
    ]);

    // Build desk snapshot for AI
    const cjs = candidateJobs || [];
    const allJobs = jobs || [];
    const allClients = clients || [];
    const notes = recentNotes || [];

    // RED FLAGS data
    const offerCandidates = cjs.filter((cj: any) => cj.stage === "Offer");
    const offerWithNoRecentActivity = offerCandidates.filter((cj: any) => {
      const candidateNotes = notes.filter((n: any) => n.candidate_id === cj.candidate_id);
      const lastActivity = candidateNotes[0]?.created_at;
      return !lastActivity || lastActivity < new Date(now.getTime() - 2 * 86400000).toISOString();
    });

    const interviewToday = cjs.filter((cj: any) =>
      ["First Interview", "Second Interview"].includes(cj.stage)
    );
    const interviewNoPrepToday = interviewToday.filter((cj: any) => {
      const todayNotes = notes.filter(
        (n: any) => n.candidate_id === cj.candidate_id && n.created_at >= today
      );
      return todayNotes.length === 0;
    });

    const submittedCandidates = cjs.filter((cj: any) =>
      ["Submitted", "Client Review"].includes(cj.stage)
    );
    const feedbackOverdue = submittedCandidates.filter((cj: any) => {
      return cj.created_at < new Date(now.getTime() - 5 * 86400000).toISOString();
    });

    const placedCandidates = cjs.filter((cj: any) => cj.stage === "Placed");

    // AMBER FLAGS data
    const openJobs = allJobs.filter((j: any) => j.status === "Open");
    const jobsNoSubmissions = openJobs.filter((j: any) => {
      const jobCjs = cjs.filter((cj: any) => cj.job_id === j.id);
      const submitted = jobCjs.some((cj: any) =>
        ["Submitted", "Client Review", "First Interview", "Second Interview", "Offer", "Placed"].includes(cj.stage)
      );
      if (submitted) return false;
      return j.date_opened < sevenDaysAgo;
    });

    const jobsNoActivity = openJobs.filter((j: any) => {
      const jobNotes = notes.filter((n: any) => n.job_id === j.id);
      const lastNote = jobNotes[0]?.created_at;
      return !lastNote || lastNote < new Date(now.getTime() - 5 * 86400000).toISOString();
    });

    const bdProspects = allClients.filter((c: any) =>
      ["Target", "Approached", "In Dialogue"].includes(c.status)
    );
    const bdStaleProspects = bdProspects.filter((c: any) => {
      return !c.last_activity_date || c.last_activity_date < tenDaysAgo;
    });

    // BD follow-ups overdue: next_followup_date passed AND no touchpoint logged after that date
    const bdFollowupsOverdue = allClients
      .filter((c: any) => c.next_followup_date && c.next_followup_date < today)
      .map((c: any) => {
        const clientNotes = notes.filter((n: any) => n.client_id === c.id);
        const lastTouchAfter = clientNotes.find(
          (n: any) => n.created_at?.split("T")[0] >= c.next_followup_date
        );
        if (lastTouchAfter) return null;
        const daysOverdue = Math.floor(
          (now.getTime() - new Date(c.next_followup_date).getTime()) / 86400000
        );
        return {
          company: c.company_name,
          contact: c.contact_name,
          dueDate: c.next_followup_date,
          daysOverdue,
        };
      })
      .filter(Boolean);

    const recentJobsOpened = allJobs.filter((j: any) => j.date_opened >= fourteenDaysAgo);

    // GREEN FLAGS data
    const longlistNotContacted = cjs.filter((cj: any) => {
      if (cj.stage !== "Longlist") return false;
      const candidateNotes = notes.filter((n: any) => n.candidate_id === cj.candidate_id);
      return candidateNotes.length === 0;
    });

    const hour = now.getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    const deskSnapshot = {
      timeOfDay,
      date: today,
      redFlags: {
        offerNoActivity: offerWithNoRecentActivity.map((cj: any) => ({
          candidate: cj.candidates?.name,
          job: cj.jobs?.title,
          company: cj.jobs?.clients?.company_name,
        })),
        interviewsTodayNoPrep: interviewNoPrepToday.map((cj: any) => ({
          candidate: cj.candidates?.name,
          job: cj.jobs?.title,
          company: cj.jobs?.clients?.company_name,
        })),
        feedbackOverdue5Days: feedbackOverdue.map((cj: any) => ({
          candidate: cj.candidates?.name,
          job: cj.jobs?.title,
          company: cj.jobs?.clients?.company_name,
          submittedDate: cj.created_at?.split("T")[0],
        })),
        placedStartingSoon: placedCandidates.map((cj: any) => ({
          candidate: cj.candidates?.name,
          job: cj.jobs?.title,
          company: cj.jobs?.clients?.company_name,
        })),
        bdFollowUpsOverdue: bdFollowupsOverdue,
      },
      amberFlags: {
        jobsNoCVsSent7Days: jobsNoSubmissions.map((j: any) => ({
          title: j.title,
          company: j.clients?.company_name,
          dateOpened: j.date_opened,
        })),
        jobsNoActivity5Days: jobsNoActivity.map((j: any) => ({
          title: j.title,
          company: j.clients?.company_name,
        })),
        bdProspectsStale10Days: bdStaleProspects.map((c: any) => ({
          company: c.company_name,
          contact: c.contact_name,
          lastActivity: c.last_activity_date,
        })),
        totalBDProspects: bdProspects.length,
        noNewJobsIn14Days: recentJobsOpened.length === 0,
      },
      greenFlags: {
        longlistNotContacted: longlistNotContacted.map((cj: any) => ({
          candidate: cj.candidates?.name,
          job: cj.jobs?.title,
        })),
        followUpsDueToday: (todayFollowUps || []).length,
        overdueFollowUps: (overdueFollowUps || []).length,
      },
      summary: {
        totalOpenJobs: openJobs.length,
        totalCandidatesInPipeline: cjs.length,
        totalBDProspects: bdProspects.length,
      },
    };

    const systemPrompt = `You are an experienced senior tech recruiter giving your daily desk briefing to a solo recruiter. Be direct, practical, and specific. No fluff. Speak like a mentor who's been billing for 15 years.

Format your response as JSON with this exact structure:
{
  "greeting": "Short personalised greeting using time of day",
  "red_flags": [
    {"issue": "What the problem is", "why": "Why it matters for revenue/placement", "action": "One specific thing to do right now"}
  ],
  "amber_flags": [
    {"issue": "What needs attention", "why": "Why it matters for desk health", "action": "One specific thing to do"}
  ],
  "green_flags": [
    {"issue": "What's worth doing", "why": "Why it's a good use of time", "action": "Specific next step"}
  ],
  "bottom_line": "One sentence: Your biggest focus today should be X"
}

If a category has no flags, return an empty array for it. Keep each flag to 1-2 sentences max. Be specific — use names, companies, job titles from the data. Never say "there are no issues" — always find something actionable even if the desk is clean.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here is the full desk snapshot for today:\n\n${JSON.stringify(deskSnapshot, null, 2)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", status, errText);
      throw new Error(`AI gateway returned ${status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { greeting: "Good " + timeOfDay, red_flags: [], amber_flags: [], green_flags: [], bottom_line: content || "Check your desk." };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("daily-focus error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
