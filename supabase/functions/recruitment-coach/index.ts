import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an elite recruitment performance coach built into a recruitment CRM called RecruiterCRM. You have 20+ years of experience billing at the highest level in tech recruitment across the UK market.

YOUR EXPERTISE:
You have deep, specific knowledge of:
- Tech recruitment in the UK (software engineers, DevOps, product, data, cloud — £60k-£250k salary range)
- The full 360 recruitment cycle from BD to placement
- What separates top billers (£500k+) from average recruiters
- BD strategy for winning clients as a solo or small agency
- Candidate pipeline management and urgency signals
- Client relationship development and account management
- Offer management and closing techniques
- How to structure a high performance recruitment desk
- Common reasons recruiters lose deals and how to avoid them
- Outreach messaging that actually gets responses
- How to re-engage cold candidates and clients
- Reading between the lines of candidate and client behaviour

YOUR PERSONALITY:
- Direct and specific — never waffle, never give generic advice
- Experienced — you've seen every situation before
- Commercially minded — everything ties back to billing
- Honest — you'll tell a recruiter when they're wasting time
- Encouraging but not soft — you push people to do more
- Talk like a brilliant billing manager, not a chatbot
- Use recruiter language naturally (BD, perm, contract, notice period, counter offer, exclusive, PSL etc)
- Never use corporate speak or HR language
- Short sentences. Get to the point.

WHAT YOU CAN SEE:
You have real time access to the recruiter's full desk data including all open jobs, candidate pipelines, BD pipeline, activity logs, call notes, overdue actions, and placement history.

HOW TO RESPOND:
When asked where to focus:
- Scan the desk data for revenue risk first
- Then pipeline health
- Then BD gaps
- Give a prioritised list, most urgent first
- Always end with one single "do this first" recommendation

When asked about a specific role or candidate:
- Reference their actual data specifically
- Don't give generic advice — use their names, their situations, their context
- Give one clear recommended action

When generating outreach messages:
- Write in a warm, human, direct tone
- Personalise using the candidate or client data available
- Never sound templated or mass-produced
- Keep it concise — recruiters and candidates are busy
- Always have a clear call to action
- Match the channel (email is slightly longer, LinkedIn is shorter, more casual)

When generating candidate submissions:
- Lead with why this person is right for THIS role specifically
- Use call notes and CV data to make it feel personal
- Keep it punchy — clients skim read
- Include: summary, key relevant experience, why they're a fit, availability, salary expectation
- Make the recruiter look like they really know their candidate

When spotting risk:
- Be direct — "this deal is at risk because..."
- Give a specific reason based on their data
- Give one action to mitigate it immediately

When the desk looks healthy:
- Acknowledge it briefly
- Then push for more — what's the next level move?
- A good desk can always be a great desk

CONTEXT RULES:
- Always reference specific names, companies and situations from their data — never be generic
- If data is missing that you need, ask one specific question to get it
- Never make up data or assume facts not in the context
- If the desk is genuinely quiet, say so and give a specific BD plan to fix it
- Use markdown formatting for readability: bold for emphasis, bullet lists for actions, headers for sections

STALE RECORDS:
When you see stale clients or contacts in the desk data, proactively flag them.
For each stale record, suggest something like:
"[Name] at [Company] has been inactive for [X] days. Worth checking their LinkedIn to see if anything has changed before re-engaging."
This surfaces the need to check manually rather than claiming to know what's happened.
Never assume you know why they've gone quiet — just flag it and suggest a manual check.
Stale records are a revenue risk — dormant relationships mean missed opportunities.

DO NOT CONTACT (GDPR):
Records marked Do Not Contact and GDPR-deleted records have already been excluded from your data.
NEVER suggest contacting them, NEVER surface them in shortlists, NEVER include them in AI Actions, NEVER reference them by name.
If a recruiter explicitly asks about a Do Not Contact person, refuse outreach suggestions and remind them the person has opted out.

PLACEMENT PROBABILITY SCORES:
Each open job has a placementScore (5-95%) with a band, trend, positives, negatives, and topAction.
You MUST follow these framing rules whenever you reference a score:
1. NEVER show a score without naming the next action to improve it.
2. NEVER validate a high score without finding the risk inside it. A 78% with no backup is not comfortable — it is fragile. Surface the vulnerability.
3. ALWAYS show the trend (rising / falling / stable). Falling = urgent. Rising = momentum.
4. Frame LOW scores as RECOVERABLE with action — never as failures. Never say "at risk", "failing", "lost", "unlikely", or "poor". Use "recoverable", "needs attention", "one action away", "opportunity to push higher".
5. Treat the score as a challenge to beat — not a verdict to accept.

RELATIONSHIP DECAY ALERTS:
You will receive a list of surfaced relationship decay alerts in deskData.decayAlerts. Each one ALREADY contains a genuine, specific reason to make contact (matching candidates, previous conversation context, market intel, candidate intel, or a BD signal). 
You MUST follow these rules:
1. NEVER tell the recruiter to contact someone just because it has been a long time. That is noise.
2. ONLY mention a decay alert when surfaced reason exists, and ALWAYS lead with that reason — not with the day count.
3. Frame contact as adding value, not catching up. Example: "Good time to call James Brown at Acme — you have three strong DevOps candidates and he mentioned Q2 hiring plans on your last call. That is a genuine reason to reach out, not just a check-in."
4. Never write a brief item like "you haven't spoken to X in 47 days — worth a check-in." If there is no surfaced reason, stay silent on that relationship.

Examples of correct language:
- High score with hidden risk: "Acme DevOps is at 78% but your only candidate has counter-offer risk and you have no backup. That 78% is fragile. Get a backup to shortlist today to protect it."
- Low score as opportunity: "TechCorp Staff Engineer has dropped to 31% — no client contact in 18 days. This is recoverable. One client call today and two new candidates this week could take this back to 55% by Friday."
- Stable score: "CloudBase Platform Engineer is holding at 62% but has not moved in two weeks. Stable is not progressing. What needs to happen this week to push it forward?"

UNREVIEWED QUICK NOTES:
deskData.quickNotes contains brain-dump notes the recruiter captured on the go. If any are older than 48 hours, flag this in the morning brief — for example: "You have N quick notes from the last few days that haven't been reviewed yet. Worth 5 minutes to process them before they get stale." Never paste the full text of the notes back at them; just nudge them to clear the inbox.

PLACEMENTS:
deskData.placements gives you visibility on every active placement — pre-start, active, guaranteed, at risk, fallen through — plus their check-ins, guarantee expiry and invoice status. Reference them naturally in the morning brief when relevant. Examples:
- "Sarah starts at TechCorp on Monday — have you confirmed all details with her this week?"
- "Invoice for Acme placement is overdue by 12 days — worth a chase today."
- "Guarantee period for James at CloudBase expires in 3 days — make sure you speak to both before it expires."
- "Maria's week 1 check-in is due tomorrow. Ask how the first week is going, if she's settling in, and whether the role matches what you described."
- "Tom's probation review at Acme is in 9 days. This is your guarantee window — confirm performance and happiness on both sides before it closes."
After a guarantee expires successfully, prompt the BD opportunity: the client is a proven partner worth a follow-up call about future hiring, and the candidate is now a long-term relationship worth a check-in in 9-12 months.
If a check-in note flags a concern (concern_flagged=true), treat the placement as recoverable and surface a one-action prompt — never call it failing or lost.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const dayOfWeek = now.toLocaleDateString("en-GB", { weekday: "long" });
    const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    // Fetch desk data + recruiter profile in parallel
    const [
      { data: candidateJobs },
      { data: jobs },
      { data: clients },
      { data: candidates },
      { data: recentNotes },
      { data: overdueFollowUps },
      { data: todayFollowUps },
      { data: profiles },
      { data: unactionedSignals },
      { data: priorityCandidates },
      { data: scoreHistory },
      { data: decayAlerts },
      { data: contactsList },
      { data: quickNotes },
    ] = await Promise.all([
      sb.from("candidate_jobs").select("*, candidates(*), jobs(*, clients(*))"),
      sb.from("jobs").select("*, clients(*)"),
      sb.from("clients").select("*"),
      sb.from("candidates").select("*").eq("do_not_contact", false).eq("gdpr_deleted", false),
      sb.from("notes").select("*, candidates(*), clients(*)").order("created_at", { ascending: false }).limit(500),
      sb.from("notes").select("*, candidates(*), clients(*)").not("follow_up_date", "is", null).lt("follow_up_date", today),
      sb.from("notes").select("*, candidates(*), clients(*)").eq("follow_up_date", today),
      sb.from("recruiter_profiles").select("*").limit(1),
      sb.from("call_signals").select("*, notes:note_id(*, candidates(*), clients(*))").eq("status", "unactioned").order("created_at", { ascending: false }).limit(50),
      sb.from("candidates").select("*").eq("priority_flag", true).eq("do_not_contact", false).eq("gdpr_deleted", false),
      sb.from("job_score_history").select("job_id, score, snapshot_date").order("snapshot_date", { ascending: false }),
      sb.from("decay_alerts").select("*").in("status", ["due", "at_risk", "critical"]).not("reason", "is", null),
      sb.from("contacts").select("id,name,client_id,do_not_contact").eq("do_not_contact", false),
      sb.from("quick_notes").select("id, content, created_at").eq("status", "inbox").order("created_at", { ascending: false }).limit(50),
      sb.from("placements").select("*").not("status", "eq", "fallen_through"),
      sb.from("placement_checkins").select("*").eq("completed", false),
    ]);

    const cjs = candidateJobs || [];
    const allJobs = jobs || [];
    const allClients = clients || [];
    const allCandidates = candidates || [];
    const notes = recentNotes || [];
    const openJobs = allJobs.filter((j: any) => j.status === "Open");
    const bdProspects = allClients.filter((c: any) => ["Target", "Approached", "In Dialogue"].includes(c.status));
    const profile = profiles?.[0] || null;

    // Detect stale clients and contacts
    const nowMs = Date.now();
    const dayMs = 1000 * 60 * 60 * 24;
    const ninetyDaysAgo = new Date(nowMs - 90 * dayMs).toISOString().split("T")[0];
    const sixMonthsAgo = new Date(nowMs - 180 * dayMs).toISOString().split("T")[0];

    const staleClients = allClients
      .filter((c: any) => c.status === "Active")
      .map((c: any) => {
        const lastActivity = c.last_activity_date || c.created_at?.split("T")[0];
        const hasOpenJobs = openJobs.some((j: any) => j.client_id === c.id);
        const daysSinceActivity = lastActivity ? Math.floor((nowMs - new Date(lastActivity).getTime()) / dayMs) : null;

        const flags: string[] = [];
        if (daysSinceActivity && daysSinceActivity >= 90) flags.push(`No activity in ${daysSinceActivity} days`);
        if (lastActivity && lastActivity < sixMonthsAgo) flags.push(`Last contacted over 6 months ago`);
        if (!hasOpenJobs) flags.push("No linked open jobs but status is Active");

        return flags.length > 0 ? {
          company: c.company_name,
          contact: c.contact_name,
          status: c.status,
          lastActivity: lastActivity,
          daysSinceActivity,
          flags,
        } : null;
      })
      .filter(Boolean);

    // Placement Probability Score (mirrors src/lib/placement-score.ts logic)
    const ACTIVE_BACKUP = new Set(["Screening", "Shortlist", "Submitted", "Client Review"]);
    const INTERVIEW_SET = new Set(["First Interview", "Second Interview", "Client Review"]);
    const ACTIVE_STAGES = ["Longlist", "Screening", "Shortlist", "Submitted", "Client Review", "First Interview", "Second Interview", "Offer"];
    const sevenDaysAgoDate = new Date(nowMs - 7 * dayMs);

    const computeScore = (job: any) => {
      const jobCjs = cjs.filter((cj: any) => cj.job_id === job.id);
      const positives: { label: string; points: number }[] = [];
      const negatives: { label: string; points: number; action: string }[] = [];
      let raw = 50;

      const hasOffer = jobCjs.some((cj: any) => cj.stage === "Offer");
      const hasInterview = jobCjs.some((cj: any) => INTERVIEW_SET.has(cj.stage));
      const hasShortlist = jobCjs.some((cj: any) => cj.stage === "Shortlist");
      const inPlay = jobCjs.filter((cj: any) => ACTIVE_STAGES.includes(cj.stage));
      const backupCount = jobCjs.filter((cj: any) => ACTIVE_BACKUP.has(cj.stage)).length;

      if (hasOffer) { raw += 35; positives.push({ label: "Candidate at offer stage", points: 35 }); }
      else if (hasInterview) { raw += 20; positives.push({ label: "Candidate at interview stage", points: 20 }); }
      else if (hasShortlist) { raw += 10; positives.push({ label: "Candidate at shortlist stage", points: 10 }); }

      if (inPlay.length >= 2) { raw += 5; positives.push({ label: `${inPlay.length} candidates in pipeline`, points: 5 }); }
      if ((hasOffer || hasInterview) && backupCount >= (hasOffer ? 1 : 2)) { raw += 10; positives.push({ label: "Backup at screening or above", points: 10 }); }

      if (inPlay.length === 0) { raw -= 30; negatives.push({ label: "No candidates in pipeline", points: -30, action: "Source 3 candidates this week to rebuild the pipeline" }); }
      else if (inPlay.length === 1 && !hasOffer && !hasInterview) { raw -= 10; negatives.push({ label: "Only one candidate, no backups", points: -10, action: "Add 2 backup candidates at shortlist this week" }); }
      else if ((hasOffer || hasInterview) && backupCount === 0) { raw -= 10; negatives.push({ label: "No backup at shortlist or above", points: -10, action: "Add a backup candidate to shortlist today to protect the offer" }); }

      const clientNotes = notes.filter((n: any) => n.client_id === job.client_id);
      const lastTouchMs = clientNotes[0]?.created_at ? new Date(clientNotes[0].created_at).getTime() : 0;
      const daysSinceClient = lastTouchMs ? Math.floor((nowMs - lastTouchMs) / dayMs) : 999;
      if (daysSinceClient <= 7) { raw += 10; positives.push({ label: "Client contacted this week", points: 10 }); }
      else if (daysSinceClient >= 14) { raw -= 15; negatives.push({ label: `No client contact in ${daysSinceClient} days`, points: -15, action: "Call the client today for an update on the role" }); }

      const weeksOpen = (nowMs - new Date(job.date_opened).getTime()) / (dayMs * 7);
      if (weeksOpen < 4) { raw += 5; positives.push({ label: "Role opened recently", points: 5 }); }
      else if (weeksOpen > 8) { raw -= 10; negatives.push({ label: `Role open ${Math.round(weeksOpen)} weeks`, points: -10, action: "Refresh the client brief this week to prevent further decline" }); }

      if (job.clients?.status === "Active") { raw += 5; positives.push({ label: "Client is Active", points: 5 }); }

      if (job.status === "On Hold") { raw -= 20; negatives.push({ label: "Role on hold", points: -20, action: "Call the client this week to confirm the role is still live" }); }

      const score = Math.max(5, Math.min(95, Math.round(raw)));
      const band = score >= 70 ? "green" : score >= 40 ? "amber" : "red";

      const history = (scoreHistory || []).filter((h: any) => h.job_id === job.id);
      const target = history.find((h: any) => new Date(h.snapshot_date) <= sevenDaysAgoDate) || history[history.length - 1];
      const previous = target?.score ?? null;
      const trendDelta = previous !== null ? score - previous : 0;
      const trend = trendDelta >= 3 ? "up" : trendDelta <= -3 ? "down" : "flat";

      let topAction = "";
      if (negatives.length > 0) topAction = [...negatives].sort((a, b) => a.points - b.points)[0].action;
      else if (band === "green") {
        if (backupCount === 0 && (hasOffer || hasInterview)) topAction = "Add a backup candidate to protect this score";
        else if (daysSinceClient > 5) topAction = "Touch base with the client to lock the placement in";
        else topAction = "Push to next stage this week — momentum is everything";
      } else topAction = "One action this week could push this higher";

      return { score, band, trend, trendDelta, positives, negatives, topAction };
    };

    // Build a concise desk snapshot
    const deskData = {
      currentTime: `${dayOfWeek}, ${today} at ${timeStr} (${timeOfDay})`,
      openJobs: openJobs.map((j: any) => {
        const jobCjs = cjs.filter((cj: any) => cj.job_id === j.id);
        const jobNotes = notes.filter((n: any) => n.job_id === j.id);
        return {
          title: j.title,
          client: j.clients?.company_name,
          location: j.location,
          salary: j.salary_min && j.salary_max ? `£${j.salary_min / 1000}k-£${j.salary_max / 1000}k` : null,
          type: j.job_type,
          fee: j.fee_value ? `${j.fee_value}%` : null,
          dateOpened: j.date_opened,
          status: j.status,
          placementScore: computeScore(j),
          pipeline: {
            longlist: jobCjs.filter((cj: any) => cj.stage === "Longlist").map((cj: any) => cj.candidates?.name),
            shortlist: jobCjs.filter((cj: any) => cj.stage === "Shortlist").map((cj: any) => cj.candidates?.name),
            submitted: jobCjs.filter((cj: any) => cj.stage === "Submitted").map((cj: any) => cj.candidates?.name),
            clientReview: jobCjs.filter((cj: any) => cj.stage === "Client Review").map((cj: any) => cj.candidates?.name),
            firstInterview: jobCjs.filter((cj: any) => cj.stage === "First Interview").map((cj: any) => cj.candidates?.name),
            secondInterview: jobCjs.filter((cj: any) => cj.stage === "Second Interview").map((cj: any) => cj.candidates?.name),
            offer: jobCjs.filter((cj: any) => cj.stage === "Offer").map((cj: any) => cj.candidates?.name),
            placed: jobCjs.filter((cj: any) => cj.stage === "Placed").map((cj: any) => cj.candidates?.name),
          },
          lastActivity: jobNotes[0]?.created_at?.split("T")[0] || "none",
        };
      }),
      bdPipeline: allClients.map((c: any) => {
        const followupOverdue =
          c.next_action_due_date && c.next_action_due_date < today;
        const clientNotes = notes.filter((n: any) => n.client_id === c.id);
        const touchedAfterFollowup =
          followupOverdue &&
          clientNotes.some(
            (n: any) => n.created_at?.split("T")[0] >= c.next_action_due_date
          );
        const daysOverdue = followupOverdue
          ? Math.floor(
              (Date.now() - new Date(c.next_action_due_date).getTime()) / dayMs
            )
          : null;
        return {
          company: c.company_name,
          contact: c.contact_name,
          status: c.status,
          lastActivity: c.last_activity_date,
          nextAction: c.next_action,
          nextActionDue: c.next_action_due_date,
          followupOverdue: followupOverdue && !touchedAfterFollowup,
          daysOverdue: followupOverdue && !touchedAfterFollowup ? daysOverdue : null,
        };
      }),
      overdueFollowUps: (overdueFollowUps || []).map((n: any) => ({
        type: n.activity_type,
        content: n.content?.slice(0, 100),
        dueDate: n.follow_up_date,
        candidate: n.candidates?.name,
        client: n.clients?.company_name,
      })),
      todayFollowUps: (todayFollowUps || []).map((n: any) => ({
        type: n.activity_type,
        content: n.content?.slice(0, 100),
        candidate: n.candidates?.name,
        client: n.clients?.company_name,
      })),
      recentActivity: notes.slice(0, 30).map((n: any) => ({
        type: n.activity_type,
        content: n.content?.slice(0, 80),
        date: n.created_at?.split("T")[0],
        candidate: n.candidates?.name,
        client: n.clients?.company_name,
      })),
      summary: {
        totalOpenJobs: openJobs.length,
        totalCandidates: allCandidates.length,
        totalInPipeline: cjs.length,
        totalBDProspects: bdProspects.length,
        activeClients: allClients.filter((c: any) => c.status === "Active").length,
        overdueCount: (overdueFollowUps || []).length,
        todayActionsCount: (todayFollowUps || []).length,
      },
      unactionedSignals: (unactionedSignals || []).filter((s: any) => s.signal_category !== "missing_action").map((s: any) => ({
        type: s.signal_type,
        triggerPhrase: s.trigger_phrase,
        explanation: s.explanation,
        suggestedAction: s.suggested_action,
        callContact: s.notes?.candidates?.name || s.notes?.clients?.company_name || "Unknown",
        callDate: s.notes?.created_at?.split("T")[0],
      })),
      missingActions: (unactionedSignals || []).filter((s: any) => s.signal_category === "missing_action").map((s: any) => ({
        type: s.signal_type,
        triggerPhrase: s.trigger_phrase,
        explanation: s.explanation,
        suggestedAction: s.suggested_action,
        suggestedDate: s.suggested_date,
        callContact: s.notes?.candidates?.name || s.notes?.clients?.company_name || "Unknown",
        callDate: s.notes?.created_at?.split("T")[0],
      })),
      priorityCandidates: (priorityCandidates || []).map((c: any) => ({
        name: c.name,
        jobTitle: c.job_title,
        employer: c.current_employer,
        reason: c.priority_reason,
        flaggedAt: c.priority_flagged_at?.split("T")[0],
        followUpDate: c.priority_followup_date,
        daysSinceFlagged: c.priority_flagged_at ? Math.floor((Date.now() - new Date(c.priority_flagged_at).getTime()) / (1000 * 60 * 60 * 24)) : null,
      })),
      reengageCandidatesDue: allCandidates
        .filter((c: any) => c.status === "On Hold" && c.reengage_date && c.reengage_date <= today)
        .map((c: any) => {
          const lastNote = notes.find((n: any) => n.candidate_id === c.id);
          return {
            name: c.name,
            reengageDate: c.reengage_date,
            reason: c.reengage_reason,
            lastSpoke: lastNote?.created_at?.split("T")[0] || null,
            daysOverdue: Math.floor((Date.now() - new Date(c.reengage_date).getTime()) / dayMs),
          };
        }),
      staleRecords: staleClients,
      decayAlerts: (decayAlerts || []).map((a: any) => {
        const today = new Date().toISOString().split("T")[0];
        if (a.snoozed_until && a.snoozed_until > today) return null;
        let name = "Unknown";
        let company: string | null = null;
        if (a.entity_type === "client") {
          const c = allClients.find((x: any) => x.id === a.entity_id);
          name = c?.contact_name || c?.company_name || "Unknown";
          company = c?.company_name || null;
        } else {
          const ct = (contactsList || []).find((x: any) => x.id === a.entity_id);
          const c = ct ? allClients.find((x: any) => x.id === ct.client_id) : null;
          name = ct?.name || "Unknown";
          company = c?.company_name || null;
        }
        return {
          name, company,
          status: a.status,
          daysSinceContact: a.days_since_contact,
          relationshipKind: a.relationship_kind,
          reason: a.reason,
          reasonSource: a.reason_source,
          suggestedApproach: a.suggested_approach,
          channelSuggestion: a.channel_suggestion,
        };
      }).filter(Boolean),
      quickNotes: (() => {
        const list = quickNotes || [];
        const stale = list.filter((n: any) => (nowMs - new Date(n.created_at).getTime()) / dayMs >= 2);
        return {
          total: list.length,
          olderThan48h: stale.length,
          oldestAgeDays: stale.length ? Math.floor((nowMs - new Date(stale[stale.length - 1].created_at).getTime()) / dayMs) : 0,
        };
      })(),
    };

    const recruiterContext = profile ? `
[RECRUITER PROFILE]
Name: ${profile.display_name || "Unknown"}
Specialisms: ${(profile.niches || []).join(", ")}${profile.niche_other ? ` (${profile.niche_other})` : ""}
Salary range: £${(profile.salary_min || 0) / 1000}k - £${(profile.salary_max || 0) / 1000}k
Placement type: ${profile.placement_type || "Both"}
Client locations: ${(profile.locations || []).join(", ")}${profile.location_regional_detail ? ` (${profile.location_regional_detail})` : ""}
Typical candidate: ${profile.ideal_candidate || "Not specified"}
BD approach: ${profile.bd_approach || "Not specified"}
Biggest challenge: ${profile.biggest_challenge || "Not specified"}
` : "";

    const deskContext = `${recruiterContext}
[LIVE DESK DATA]
${JSON.stringify(deskData, null, 2)}

Current date and time: ${dayOfWeek}, ${today} at ${timeStr}
Day of week: ${dayOfWeek}`;

    // Build messages array with system prompt + desk data injected
    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Here is my current desk data. Use this to inform all your responses:\n\n${deskContext}` },
      { role: "assistant", content: "Got it — I can see your full desk. What do you need?" },
      ...messages,
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again in a moment." }), {
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

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("recruitment-coach error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
