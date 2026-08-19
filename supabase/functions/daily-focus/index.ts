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

    // Compute current week (Mon-Sun) for the "this week" stats bar
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartIso = weekStart.toISOString().split("T")[0];
    const weekEndIso = weekEnd.toISOString().split("T")[0];

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
      ["First Stage", "Second Stage"].includes(cj.stage)
    );
    const interviewNoPrepToday = interviewToday.filter((cj: any) => {
      const todayNotes = notes.filter(
        (n: any) => n.candidate_id === cj.candidate_id && n.created_at >= today
      );
      return todayNotes.length === 0;
    });

    const submittedCandidates = cjs.filter((cj: any) =>
      ["Sent CV", "Sent CV"].includes(cj.stage)
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
        ["Sent CV", "Sent CV", "First Stage", "Second Stage", "Offer", "Placed"].includes(cj.stage)
      );
      if (submitted) return false;
      return j.date_opened < sevenDaysAgo;
    });

    const jobsNoActivity = openJobs.filter((j: any) => {
      const jobNotes = notes.filter((n: any) => n.job_id === j.id);
      const lastNote = jobNotes[0]?.created_at;
      return !lastNote || lastNote < new Date(now.getTime() - 5 * 86400000).toISOString();
    });

    // In-play pipeline analysis: active = Shortlist..Offer (not Placed/withdrawn/AI Suggested)
    const ACTIVE_STAGES = ["Shortlist","Sent CV","First Stage","Second Stage","Final Stage","Offer"];
    const jobsInPlay = openJobs.map((j: any) => {
      const active = cjs.filter((cj: any) => cj.job_id === j.id && ACTIVE_STAGES.includes(cj.stage));
      return { title: j.title, company: j.clients?.company_name, count: active.length };
    });
    const jobsNoPipeline = jobsInPlay.filter((j: any) => j.count === 0);
    const jobsThinPipeline = jobsInPlay.filter((j: any) => j.count >= 1 && j.count <= 2);

    const bdProspects = allClients.filter((c: any) =>
      ["Target", "Approached", "In Dialogue"].includes(c.status)
    );
    const bdStaleProspects = bdProspects.filter((c: any) => {
      return !c.last_activity_date || c.last_activity_date < tenDaysAgo;
    });

    // BD actions overdue: next_action_due_date passed AND no touchpoint logged after that date
    const bdFollowupsOverdue = allClients
      .filter((c: any) => c.next_action_due_date && c.next_action_due_date < today)
      .map((c: any) => {
        const clientNotes = notes.filter((n: any) => n.client_id === c.id);
        const lastTouchAfter = clientNotes.find(
          (n: any) => n.created_at?.split("T")[0] >= c.next_action_due_date
        );
        if (lastTouchAfter) return null;
        const daysOverdue = Math.floor(
          (now.getTime() - new Date(c.next_action_due_date).getTime()) / 86400000
        );
        return {
          company: c.company_name,
          contact: c.contact_name,
          action: c.next_action,
          dueDate: c.next_action_due_date,
          daysOverdue,
        };
      })
      .filter(Boolean);

    const recentJobsOpened = allJobs.filter((j: any) => j.date_opened >= fourteenDaysAgo);

    // Re-engage candidates: status On Hold + reengage_date today/past
    const reengageCandidatesDue = (candidates || [])
      .filter((c: any) => c.status === "On Hold" && c.reengage_date && c.reengage_date <= today)
      .map((c: any) => {
        const cNotes = notes.filter((n: any) => n.candidate_id === c.id);
        const lastSpoke = cNotes[0]?.created_at?.split("T")[0] || null;
        const daysOverdue = Math.floor((now.getTime() - new Date(c.reengage_date).getTime()) / 86400000);
        return {
          name: c.name,
          reengageDate: c.reengage_date,
          reason: c.reengage_reason || null,
          lastSpoke,
          daysOverdue,
        };
      });

    // Re-engage contacts: status Cold + reengage_date today/past
    const reengageContactsDue = (contacts || [])
      .filter((c: any) => c.status === "Cold" && c.reengage_date && c.reengage_date <= today)
      .map((c: any) => {
        const company = allClients.find((cl: any) => cl.id === c.client_id)?.company_name;
        const daysOverdue = Math.floor((now.getTime() - new Date(c.reengage_date).getTime()) / 86400000);
        return {
          name: c.name,
          company,
          reengageDate: c.reengage_date,
          reason: c.reengage_reason || null,
          daysOverdue,
        };
      });

    // GREEN FLAGS data
    const longlistNotContacted = cjs.filter((cj: any) => {
      if (cj.stage !== "Shortlist") return false;
      const candidateNotes = notes.filter((n: any) => n.candidate_id === cj.candidate_id);
      return candidateNotes.length === 0;
    });

    const hour = now.getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    // ── BRIEF ITEM AGING ────────────────────────────────────────────────
    // Identify the discrete signals that could appear in the brief text, give each a
    // stable key + a fingerprint of the underlying situation. A signal may appear in the
    // brief text for a maximum of 2 consecutive generations while nothing changes.
    type BriefItem = {
      item_key: string;
      label: string;
      entity_type: string | null;
      entity_id: string | null;
      fingerprint: string;
      urgency: number; // higher = more urgent
    };

    const lastNoteFor = (candidateId: string) =>
      notes.find((n: any) => n.candidate_id === candidateId)?.created_at?.split("T")[0] || "none";
    const lastJobNoteFor = (jobId: string) =>
      notes.find((n: any) => n.job_id === jobId)?.created_at?.split("T")[0] || "none";
    const daysSince = (d?: string | null) =>
      d ? Math.max(0, Math.floor((now.getTime() - new Date(d).getTime()) / 86400000)) : 0;

    const briefItems: BriefItem[] = [];

    for (const cj of offerWithNoRecentActivity) {
      briefItems.push({
        item_key: `offer:${cj.id}`,
        label: `${cj.candidates?.name} at Offer on ${cj.jobs?.title}${cj.jobs?.clients?.company_name ? ` (${cj.jobs.clients.company_name})` : ""} — ${daysSince(cj.stage_changed_at || cj.created_at)} days with no update`,
        entity_type: "candidate",
        entity_id: cj.candidate_id,
        fingerprint: `${cj.stage}|${lastNoteFor(cj.candidate_id)}|${cj.stage_changed_at || ""}`,
        urgency: 100,
      });
    }

    for (const cj of feedbackOverdue) {
      briefItems.push({
        item_key: `feedback:${cj.id}`,
        label: `${cj.candidates?.name}'s CV sat with ${cj.jobs?.clients?.company_name || "the client"} for ${daysSince(cj.stage_changed_at || cj.created_at)} days with no feedback`,
        entity_type: "candidate",
        entity_id: cj.candidate_id,
        fingerprint: `${cj.stage}|${lastNoteFor(cj.candidate_id)}|${cj.stage_changed_at || ""}`,
        urgency: 85,
      });
    }

    for (const cj of interviewNoPrepToday) {
      briefItems.push({
        item_key: `interview:${cj.id}`,
        label: `${cj.candidates?.name} interviews for ${cj.jobs?.title} — no prep logged`,
        entity_type: "candidate",
        entity_id: cj.candidate_id,
        fingerprint: `${cj.stage}|${lastNoteFor(cj.candidate_id)}`,
        urgency: 90,
      });
    }

    for (const j of openJobs) {
      const active = cjs.filter((cj: any) => cj.job_id === j.id && ACTIVE_STAGES.includes(cj.stage));
      if (active.length > 2) continue;
      briefItems.push({
        item_key: `pipeline:${j.id}`,
        label: `${j.title}${j.clients?.company_name ? ` at ${j.clients.company_name}` : ""} has ${active.length} live candidate${active.length === 1 ? "" : "s"}`,
        entity_type: "job",
        entity_id: j.id,
        fingerprint: `${active.length}|${lastJobNoteFor(j.id)}`,
        urgency: active.length === 0 ? 80 : 60,
      });
    }

    for (const b of bdFollowupsOverdue as any[]) {
      briefItems.push({
        item_key: `bd:${b.company}:${b.dueDate}`,
        label: `${b.company} BD follow-up ${b.daysOverdue} days overdue${b.action ? ` — ${b.action}` : ""}`,
        entity_type: "client",
        entity_id: null,
        fingerprint: `${b.dueDate}|${b.daysOverdue > 0 ? "overdue" : "ok"}`,
        urgency: 70,
      });
    }

    for (const r of reengageCandidatesDue) {
      briefItems.push({
        item_key: `reengage-cand:${r.name}:${r.reengageDate}`,
        label: `${r.name} is due a re-engage call (${r.daysOverdue} days past)`,
        entity_type: "candidate",
        entity_id: null,
        fingerprint: `${r.reengageDate}|${r.lastSpoke || "none"}`,
        urgency: 65,
      });
    }

    // Load history for these items and decide eligibility
    const keys = briefItems.map((i) => i.item_key);
    let history: any[] = [];
    if (userId && keys.length > 0) {
      const { data } = await sb
        .from("brief_item_history")
        .select("*")
        .eq("user_id", userId)
        .in("item_key", keys);
      history = data || [];
    }
    const historyByKey = new Map(history.map((h: any) => [h.item_key, h]));

    const eligible: BriefItem[] = [];
    const agedOut: any[] = [];
    for (const item of briefItems) {
      const h = historyByKey.get(item.item_key);
      const changed = !h || h.fingerprint !== item.fingerprint;
      const shown = changed ? 0 : h.times_shown || 0;
      if (shown >= 2) {
        agedOut.push({
          item_key: item.item_key,
          label: item.label,
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          days_open: daysSince(h.first_surfaced_at),
        });
      } else {
        eligible.push(item);
      }
    }
    eligible.sort((a, b) => b.urgency - a.urgency);

    // Mark aged-out items suppressed / resolve items that no longer apply
    if (userId) {
      const agedKeys = new Set(agedOut.map((a) => a.item_key));
      const liveKeys = new Set(keys);
      await Promise.all([
        ...(agedKeys.size > 0
          ? [sb.from("brief_item_history").update({ suppressed: true }).eq("user_id", userId).in("item_key", [...agedKeys])]
          : []),
        // anything previously tracked but no longer present has genuinely cleared
        sb.from("brief_item_history").update({ resolved_at: now.toISOString(), suppressed: false })
          .eq("user_id", userId).is("resolved_at", null)
          .then(async (res: any) => res),
      ]);
      // re-open rows that are still live (the blanket resolve above would have closed them)
      if (liveKeys.size > 0) {
        await sb.from("brief_item_history").update({ resolved_at: null }).eq("user_id", userId).in("item_key", [...liveKeys]);
      }
    }



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
        reengageCandidatesDue,
        reengageContactsDue,
        jobsNoActivePipeline: jobsNoPipeline,
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
        jobsThinPipeline: jobsThinPipeline,
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
      thisWeek: {
        weekStart: weekStartIso,
        weekEnd: weekEndIso,
        overdue: (overdueFollowUps || []).length,
        cvsSent: cjs.filter((cj: any) =>
          ["Sent CV", "Sent CV", "First Stage", "Second Stage", "Offer", "Placed"].includes(cj.stage)
          && cj.stage_changed_at && cj.stage_changed_at.split("T")[0] >= weekStartIso
          && cj.stage_changed_at.split("T")[0] <= weekEndIso,
        ).length,
        atOffer: cjs.filter((cj: any) => cj.stage === "Offer").length,
      },
    };

    const systemPrompt = `You are a sharp, encouraging senior recruiter coaching a solo biller. This is a MORNING COACHING PROMPT, not a status report. Point them at the highest-leverage move toward revenue TODAY.

Rules:
- Lead with ONE clear action prompt framed around what to DO to move toward revenue — not a status statement. Good: "Get 3 live candidates into [Job Title] at [Company] — newly opened, no submissions yet." Bad: "You have 0 submissions on [Job]."
- Then 2-3 supporting prompts in the same coaching tone. Reuse derived-action signals from the data: an offer sitting quiet → nudge; recent interview → next-step; recent conversation → pitch/BD move; thin pipeline on a specific job → source into it.
- Be specific — use real names, job titles, companies from the snapshot. Never invent data.
- Be careful with absence-based claims. If something is "no record found" (e.g. no note logged, no follow-up entered), frame it as a gentle check-in prompt ("Worth a quick check on [Name] at offer — anything moved?"), NOT a factual accusation. Only include absence prompts when they map to a real revenue action; skip admin-hygiene nagging.
- Tone: sharp, warm, colleague-like. No hedging ("perhaps", "consider"). No system-speak ("your database shows"). No emojis. No lists inside prompts — one crisp sentence each.
- If the desk is genuinely clean, coach them toward the best offensive move (BD call, sourcing a specific open role, reactivating a warm candidate) — never say "nothing to do".

Return JSON with EXACTLY this shape:
{
  "greeting": "Short time-of-day greeting, one line",
  "lead_action": { "prompt": "The single highest-leverage coaching prompt for today", "why": "One short line — why this moves revenue" },
  "supporting_actions": [
    { "prompt": "Second action prompt", "why": "Short reason" },
    { "prompt": "Third action prompt", "why": "Short reason" }
  ],
  "bottom_line": "Same as lead_action.prompt — kept for compatibility"
}

supporting_actions must have 2 or 3 items. Every prompt must be a directive ("Get…", "Push…", "Nudge…", "Check in with…", "Line up…") — never a bare statement of fact.`;

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

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { greeting: "Good " + timeOfDay, lead_action: null, supporting_actions: [], bottom_line: content || "Check your desk." };
    }
    if (parsed?.lead_action?.prompt && !parsed.bottom_line) {
      parsed.bottom_line = parsed.lead_action.prompt;
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
