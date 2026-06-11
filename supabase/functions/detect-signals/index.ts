import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tool-agnostic reply phrase libraries — used for heuristics + parsing.
const POSITIVE_PHRASES = [
  "interested", "open to", "worth a call", "happy to chat", "good timing",
  "currently looking", "open to opportunities", "would like to know more",
  "tell me more", "sounds interesting", "could be relevant",
];
const INBOUND_PHRASES = [
  "replied", "got back to me", "they responded", "came back to me",
  "messaged back", "reached out", "reply received", "responded to",
  "email reply",
];
const NEGATIVE_PHRASES = [
  "not looking", "happy where i am", "not right now", "not interested",
  "not for me", "please remove", "unsubscribe", "take me off",
];
const TIMING_PHRASES = [
  "check back", "get back to me in", "not until", "in a few months",
  "end of year", "new year", "after my review", "after my bonus",
];

const buildRegex = (phrases: string[]) =>
  new RegExp(`\\b(${phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");

const POSITIVE_RE = buildRegex(POSITIVE_PHRASES);
const INBOUND_RE = buildRegex(INBOUND_PHRASES);
const NEGATIVE_RE = buildRegex(NEGATIVE_PHRASES);
const TIMING_RE = buildRegex(TIMING_PHRASES);
const AFTER_DATE_RE = /\bafter\s+([a-z]+(?:\s+\d{1,4})?)/i;

const SIGNAL_PROMPT = `You are an expert recruitment consultant reviewing new information just added to a recruitment CRM.

CRITICAL CONFIDENCE RULE:
Only fire a signal when there is CLEAR, EXPLICIT evidence in the note or transcript. Do NOT fire signals based on vague hints, implications, or guesses. False positives are worse than missed signals — be conservative.

Identify these signal types:

TYPE 1 — OPPORTUNITIES:
HIRING SIGNALS / CANDIDATE SIGNALS / REFERRAL OPPORTUNITIES / BD LEADS as before.

TYPE 2 — MISSING ACTIONS:
Specific date / commitment / interview / salary mentioned without a follow-up logged.

TYPE 3 — INBOUND REPLY DETECTION (tool-agnostic — do NOT look for tool names, look for content + intent):
A note represents an inbound reply when:
- The wording shows the candidate is responding (positive, negative, timing, or unclear), OR
- The note clearly states a reply was received ("replied", "got back to me", "they responded", "messaged back", "reached out", "reply received", "responded to").

Fire ONE of these specific signal_types when an inbound reply is detected. NEVER require a specific source tool — fire on content.

(a) "Campaign Reply — Positive"
  When the note shows interest: phrases like "interested", "open to", "worth a call", "happy to chat", "good timing", "currently looking", "open to opportunities", "would like to know more", "tell me more", "sounds interesting", "could be relevant".
  trigger_phrase: the exact interest phrase quoted from the note.
  explanation: one sentence — candidate replied positively to outreach.
  suggested_action: "Call [Name] today — review fit and put forward for matching live roles."
  priority_score: 8. confidence: "high".

(b) "Campaign Reply — Not Interested"
  When the note shows clear rejection: "not looking", "happy where I am", "not right now", "not interested", "not for me", "please remove", "unsubscribe", "take me off".
  trigger_phrase: the exact rejection phrase.
  explanation: one sentence — candidate declined outreach.
  suggested_action: "Mark candidate as Cold and stop outreach."
  priority_score: 2. confidence: "high".

(c) "Campaign Reply — Future Timing"
  When the note shows interest but later: "check back", "get back to me in", "not until", "after [month/date]", "in a few months", "end of year", "new year", "after my review".
  trigger_phrase: the timing phrase.
  explanation: one sentence — candidate interested but timing is later.
  suggested_action: "Set a re-engage date based on the timing they mentioned."
  suggested_date: if a specific month/date is mentioned, output ISO date YYYY-MM-DD (assume the next future occurrence). Otherwise omit.
  priority_score: 5. confidence: "high".

(d) "Campaign Reply — Review Needed"
  Note appears to be an inbound reply but the intent is unclear.
  trigger_phrase: short quote from the reply.
  explanation: "Inbound reply received — intent unclear from note content."
  suggested_action: "[Name] replied to your outreach. Review the note to assess their interest."
  priority_score: 5. confidence: "medium".

Optional metadata you MAY include on any Campaign Reply signal (omit if unknown — never invent):
- campaign_name: if the note explicitly names a campaign or sequence (e.g. "Replied to Head of Product campaign")
- source_label: short label like "Via Sourcewhale", "Via email" — only if the note explicitly says so. Otherwise leave blank.
- reply_excerpt: the first 100 characters of the actual reply content if quoted in the note.
- sentiment: "Positive" | "Not interested" | "Future timing" | "Unclear"

Return ONLY valid JSON:
{"signals":[{"signal_category":"opportunity","signal_type":"Campaign Reply — Positive","trigger_phrase":"...","explanation":"...","suggested_action":"...","suggested_date":"YYYY-MM-DD","confidence":"high","priority_score":8,"campaign_name":"...","source_label":"...","reply_excerpt":"...","sentiment":"Positive"}]}
If no clear signals, return {"signals":[]}.`;

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

    if (note_id) {
      const { data: note, error: noteErr } = await sb
        .from("notes")
        .select("*, candidates(name), clients(company_name)")
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

    // Tool-agnostic reply heuristic — bias the model when reply content is present.
    const hasPositive = POSITIVE_RE.test(transcript);
    const hasNegative = NEGATIVE_RE.test(transcript);
    const hasTiming = TIMING_RE.test(transcript) || AFTER_DATE_RE.test(transcript);
    const hasInbound = INBOUND_RE.test(transcript);
    const replyLikely = hasPositive || hasNegative || hasTiming || hasInbound;

    const replyHint = replyLikely
      ? `\n\nIMPORTANT: This note contains inbound reply indicators (positive=${hasPositive}, negative=${hasNegative}, timing=${hasTiming}, inbound=${hasInbound}). You MUST emit exactly ONE "Campaign Reply — ..." signal per TYPE 3, choosing the most specific sub-type from Positive / Not Interested / Future Timing / Review Needed based on the wording. Do not look for tool names — judge on content alone.`
      : "";

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
          { role: "user", content: `Contact: ${contactName}\n\nContent:\n${transcript}${recordContext}${replyHint}` },
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

    // ── Duplicate prevention: skip Campaign Reply inserts if one already fired for this
    //    candidate in the last 7 days (against a DIFFERENT note — same note re-runs are
    //    handled by the delete-then-insert further down).
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

    // Side-effects: handle Not Interested silently (no signal stored).
    const sideEffects: string[] = [];
    const signalsToStore: any[] = [];

    for (const s of signals) {
      const stype = String(s.signal_type || "");
      const isReply = /campaign reply/i.test(stype);

      if (isReply && /not interested/i.test(stype)) {
        // Silent: mark candidate Cold + log touchpoint. No signal shown.
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
        continue;
      }

      if (isReply && recentCampaignReplyForCandidate) {
        // Duplicate prevention — skip new reply signals if one fired in last 7d.
        sideEffects.push("duplicate_reply_skipped");
        continue;
      }

      if (isReply && /future timing/i.test(stype) && candidateId && s.suggested_date) {
        // Set re-engage date if AI extracted one and none currently set.
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

        // Build a rich explanation for reply signals so the UI can show campaign + source + excerpt.
        let explanation = s.explanation || "";
        if (/campaign reply/i.test(s.signal_type || "")) {
          const meta: string[] = [];
          if (s.campaign_name) meta.push(`Campaign: ${s.campaign_name}`);
          else meta.push("Outreach reply");
          if (s.source_label) meta.push(s.source_label);
          if (s.sentiment) meta.push(`Sentiment: ${s.sentiment}`);
          if (s.reply_excerpt) meta.push(`Reply: "${String(s.reply_excerpt).slice(0, 100)}"`);
          explanation = `${explanation}${explanation ? " · " : ""}${meta.join(" · ")}`;
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
