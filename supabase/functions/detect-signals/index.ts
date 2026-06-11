import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIGNAL_PROMPT = `You are an expert recruitment consultant reviewing new information just added to a recruitment CRM.

CRITICAL CONFIDENCE RULE:
Only fire a signal when there is CLEAR, EXPLICIT evidence in the note. Do NOT invent signals from vague hints. False positives are worse than missed signals.

You identify THREE classes of signal.

═══════════════════════════════════════
TYPE 1 — OPPORTUNITIES
═══════════════════════════════════════
HIRING SIGNALS, CANDIDATE SIGNALS, REFERRAL OPPORTUNITIES, BD LEADS as before.

═══════════════════════════════════════
TYPE 2 — MISSING ACTIONS
═══════════════════════════════════════
Specific date / commitment / interview / salary mentioned without a follow-up logged.

═══════════════════════════════════════
TYPE 3 — INBOUND REPLY DETECTION (AI INTENT — NOT KEYWORDS)
═══════════════════════════════════════
For candidate notes only. Read the note the way a senior recruiter would.

Step A. IS THIS AN INBOUND REPLY?
Judge by tone and content — conversational responses, reactions to an approach,
answers to questions, questions back to the recruiter. Do NOT rely on keyword
matching. A note saying "Funny timing — I was thinking about moving" is a positive
reply even though it contains no keyword like "interested".

If the note is clearly NOT an inbound reply (e.g. recruiter's own notes about a
candidate, an internal observation, a call log written by the recruiter), do not
emit a Campaign Reply signal.

Step B. WHAT IS THE INTENT? Pick exactly ONE:

(a) "Campaign Reply — Positive"
  Candidate is interested OR curious OR asking questions about the role / package
  / client / location. Any question about the opportunity, any expression of
  openness, any indication that exploring further is welcome. Recognise INTENT
  not vocabulary. Treat soft-positive ("maybe — depends on the role", "I'm fairly
  settled but would listen") as Positive.
  priority_score: 8.

(b) "Campaign Reply — Future Timing"
  Candidate is open in principle but timing is later — "check back in September",
  "after my bonus in March", "give me a few months", "not right now but keep me
  in mind". Extract a specific ISO date in suggested_date if possible (assume the
  next future occurrence of the month named). Otherwise leave suggested_date null.
  priority_score: 5.

(c) "Campaign Reply — Not Interested"
  Clear rejection — "not looking", "happy where I am", "please remove", "wrong
  person", "not for me". This is handled silently by the system (candidate is
  auto-marked Cold). Still emit the signal so the system can act on it.
  priority_score: 2.

(d) "Campaign Reply — Review Needed"
  Note appears to be a reply but the intent is genuinely ambiguous.
  priority_score: 5. confidence: "low" or "medium".

Step C. CONFIDENCE
- "high"  — intent is unmistakable
- "medium"— probably X but not certain
- "low"   — genuinely ambiguous → use "Campaign Reply — Review Needed"

Step D. JOB LINKING
You are given a list of the recruiter's ACTIVE JOBS and the CANDIDATE PROFILE.
- If the note mentions a campaign / sequence / role title, match it to a job in
  the list when one fits well.
- Otherwise, match the candidate profile (current title, location, etc.) to the
  best-fitting active job.
- Output suggested_job_id (the exact id from the list) and match_percent (0–100,
  honest estimate of fit). If no reasonable match exists, omit both fields.

═══════════════════════════════════════
OUTPUT
═══════════════════════════════════════
For Campaign Reply signals include ALL of:
  signal_category: "opportunity"
  signal_type: one of the four exact strings above
  trigger_phrase: short quote from the reply (≤ 12 words)
  explanation: one sentence describing the intent
  suggested_action: one specific next action
  suggested_date: ISO date (Future Timing only, when extractable)
  confidence: "high" | "medium" | "low"
  priority_score: 1–10
  reply_excerpt: first ~120 chars of the actual reply content
  intent_label: "Positive" | "Curious" | "Open" | "Future timing" | "Not interested" | "Unclear"
  suggested_job_id: string from ACTIVE JOBS list (omit if no good match)
  match_percent: 0–100 (omit if no match)
  campaign_name: only if explicitly named in note
  source_label: only if explicitly stated (e.g. "Via email")

For TYPE 1 / TYPE 2 signals, omit the reply-specific fields.

Return ONLY valid JSON: {"signals":[...]} — empty array if nothing clear.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { note_id, context } = await req.json();
    if (!note_id && !context) {
      return new Response(JSON.stringify({ error: "note_id or context required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let transcript = "";
    let contactName = "Unknown";
    let recordContext = "";
    let resolvedNoteId = note_id;
    let candidateId: string | null = null;
    let ownerUserId: string | null = null;
    let candidateProfile = "";
    let activeJobsBlock = "";
    let activeJobsList: { id: string; title: string; company: string }[] = [];

    if (note_id) {
      const { data: note, error: noteErr } = await sb
        .from("notes")
        .select("*, candidates(id,name,job_title,location,salary_expectation), clients(company_name)")
        .eq("id", note_id)
        .single();

      if (noteErr || !note) {
        return new Response(JSON.stringify({ error: "Note not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      transcript = note.transcript || note.content || "";
      contactName = note.candidates?.name || note.clients?.company_name || "Unknown";
      candidateId = note.candidate_id || null;
      ownerUserId = note.owner_user_id || null;

      const parts: string[] = [];
      if (note.follow_up_date) parts.push(`Follow-up date already set: ${note.follow_up_date}`);
      if (note.outcome) parts.push(`Outcome: ${note.outcome}`);
      recordContext = parts.length > 0 ? `\n\nRecord metadata: ${parts.join(". ")}` : "";

      if (note.candidates) {
        const c: any = note.candidates;
        candidateProfile = `Name: ${c.name || "?"} · Title: ${c.job_title || "?"} · Location: ${c.location || "?"}${c.salary_expectation ? " · Expects: " + c.salary_expectation : ""}`;
      }

      if (ownerUserId) {
        const { data: jobs } = await sb
          .from("jobs")
          .select("id,title,status,location,clients(company_name)")
          .eq("owner_user_id", ownerUserId)
          .eq("status", "Active")
          .limit(40);
        activeJobsList = (jobs || []).map((j: any) => ({
          id: j.id,
          title: j.title,
          company: j.clients?.company_name || "—",
        }));
        if (activeJobsList.length) {
          activeJobsBlock = "\n\nACTIVE JOBS (id · title · client):\n" +
            activeJobsList.map((j) => `${j.id} · ${j.title} · ${j.company}`).join("\n");
        }
      }
    } else if (context) {
      transcript = context.content || "";
      contactName = context.contact_name || "Unknown";
      recordContext = context.record_metadata || "";
      resolvedNoteId = context.note_id || null;
      candidateId = context.candidate_id || null;
    }

    if (transcript.length < 20) {
      return new Response(JSON.stringify({ signals: 0, detected: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const replyHint = candidateId
      ? `\n\nThis note is on a CANDIDATE record — assess whether it represents an inbound reply per TYPE 3 above using full intent analysis (not keyword matching). If it is a reply, emit exactly ONE Campaign Reply signal.`
      : "";

    const userBlock = [
      `Contact: ${contactName}`,
      candidateProfile ? `Candidate profile: ${candidateProfile}` : "",
      activeJobsBlock,
      `\nNote content:\n${transcript}${recordContext}${replyHint}`,
    ].filter(Boolean).join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SIGNAL_PROMPT },
          { role: "user", content: userBlock },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "{}";

    let parsed: { signals?: any[] } = { signals: [] };
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
    }

    const signals = parsed.signals || [];

    const fallbackPriority = (s: any): number => {
      const t = (s.signal_type || "").toLowerCase();
      if (t.includes("not interested")) return 2;
      if (t.includes("campaign reply") && t.includes("positive")) return 8;
      if (t.includes("campaign reply")) return 5;
      if (t.includes("counter") || t.includes("offer")) return 9;
      if (t.includes("hiring") || t.includes("bd")) return 6;
      if (t.includes("candidate")) return 6;
      if (t.includes("referral")) return 5;
      if (t.includes("missing salary") || t.includes("profile")) return 2;
      if (s.signal_category === "missing_action") return 5;
      return 4;
    };

    // Validate suggested_job_id against the list we actually sent.
    const jobIds = new Set(activeJobsList.map((j) => j.id));
    const jobMeta = new Map(activeJobsList.map((j) => [j.id, j] as const));

    // Duplicate prevention — skip new Campaign Reply if one fired for this candidate
    // in the last 7 days on a different note.
    let recentCampaignReplyForCandidate = false;
    if (candidateId) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recent } = await sb
        .from("call_signals")
        .select("id, note_id, notes!inner(candidate_id)")
        .gte("created_at", sevenDaysAgo)
        .ilike("signal_type", "Campaign Reply%")
        .eq("notes.candidate_id", candidateId)
        .neq("note_id", resolvedNoteId || "");
      recentCampaignReplyForCandidate = !!(recent && recent.length > 0);
    }

    const sideEffects: string[] = [];
    const signalsToStore: any[] = [];

    for (const s of signals) {
      const stype = String(s.signal_type || "");
      const isReply = /campaign reply/i.test(stype);
      const conf = ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "medium";

      // Low-confidence replies are downgraded to Review Needed
      if (isReply && conf === "low" && !/review needed/i.test(stype)) {
        s.signal_type = "Campaign Reply — Review Needed";
      }

      if (isReply && /not interested/i.test(stype)) {
        if (candidateId) {
          await sb.from("candidates").update({ status: "Cold" }).eq("id", candidateId);
          await sb.from("notes").insert({
            owner_user_id: ownerUserId,
            candidate_id: candidateId,
            activity_type: "Touchpoint",
            outcome: "Negative reply",
            content: `Inbound reply: not interested. Auto-marked Cold. Trigger: "${s.trigger_phrase || ""}"`,
          });
          sideEffects.push("marked_cold");
        }
        continue; // silent — do not store signal
      }

      if (isReply && recentCampaignReplyForCandidate) {
        sideEffects.push("duplicate_reply_skipped");
        continue;
      }

      if (isReply && /future timing/i.test(stype) && candidateId && s.suggested_date) {
        const { data: cand } = await sb
          .from("candidates")
          .select("reengage_date")
          .eq("id", candidateId)
          .maybeSingle();
        if (cand && !cand.reengage_date) {
          await sb.from("candidates").update({ reengage_date: s.suggested_date }).eq("id", candidateId);
          sideEffects.push("reengage_set");
        }
      }

      signalsToStore.push(s);
    }

    if (signalsToStore.length > 0 && resolvedNoteId) {
      await sb.from("call_signals").delete().eq("note_id", resolvedNoteId);

      const rows = signalsToStore.map((s: any) => {
        const conf = ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "medium";
        const score = Number.isFinite(s.priority_score)
          ? Math.max(1, Math.min(10, Math.round(s.priority_score)))
          : fallbackPriority(s);

        // Encode reply metadata into the explanation field so the UI can render it
        // without a schema change. Format: free text + JSON tag block.
        let explanation = s.explanation || "";
        if (/campaign reply/i.test(s.signal_type || "")) {
          const validJobId = s.suggested_job_id && jobIds.has(s.suggested_job_id) ? s.suggested_job_id : null;
          const job = validJobId ? jobMeta.get(validJobId) : null;
          const meta: Record<string, any> = {
            intent: s.intent_label || null,
            confidence: conf,
            excerpt: s.reply_excerpt ? String(s.reply_excerpt).slice(0, 120) : null,
            campaign: s.campaign_name || null,
            source: s.source_label || null,
            suggestedJobId: validJobId,
            suggestedJobTitle: job?.title || null,
            suggestedJobClient: job?.company || null,
            matchPercent: Number.isFinite(s.match_percent)
              ? Math.max(0, Math.min(100, Math.round(s.match_percent)))
              : null,
          };
          const summaryBits: string[] = [];
          if (meta.intent) summaryBits.push(`Intent: ${meta.intent}`);
          summaryBits.push(`Confidence: ${conf}`);
          if (job) summaryBits.push(`Likely role: ${job.title} at ${job.company}${meta.matchPercent != null ? ` (${meta.matchPercent}% match)` : ""}`);
          if (meta.excerpt) summaryBits.push(`Reply: "${meta.excerpt}"`);
          explanation = `${explanation}${explanation ? " · " : ""}${summaryBits.join(" · ")}\n<reply-meta>${JSON.stringify(meta)}</reply-meta>`;
        }

        return {
          note_id: resolvedNoteId,
          signal_type: s.signal_type,
          signal_category: s.signal_category || "opportunity",
          trigger_phrase: s.trigger_phrase,
          explanation,
          suggested_action: s.suggested_action,
          suggested_date: s.suggested_date || null,
          status: "unactioned",
          confidence: conf,
          priority_score: score,
        };
      });

      const { error: insertErr } = await sb.from("call_signals").insert(rows);
      if (insertErr) console.error("Insert signals error:", insertErr);
    }

    return new Response(
      JSON.stringify({ signals: signalsToStore.length, detected: signalsToStore, sideEffects }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("detect-signals error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
