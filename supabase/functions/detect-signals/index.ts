import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIGNAL_PROMPT = `You are an expert recruitment consultant reviewing new information just added to a recruitment CRM.

CRITICAL CONFIDENCE RULE:
Only fire a signal when there is CLEAR, EXPLICIT evidence in the note or transcript. Do NOT fire signals based on vague hints, implications, or guesses. If a signal is not obvious from a direct quote, do NOT include it. False positives are worse than missed signals — be conservative.

Identify two types of signals:

TYPE 1 — OPPORTUNITIES:
HIRING SIGNALS: Company growth, funding rounds, new leadership, team expansion, technology changes, dissatisfaction with current recruitment partners.
CANDIDATE SIGNALS: Company instability, acquisition, restructuring, colleagues also looking, lack of pay reviews, unhappy team, manager changes.
REFERRAL OPPORTUNITIES: Colleagues or contacts mentioned who might be candidates or clients.
BD LEADS: Company names mentioned that could be a new business target.

TYPE 2 — MISSING ACTIONS:
- A specific day/date/timeframe mentioned with no follow up date set
- A commitment made by either party with no next action logged
- A candidate or client expressing clear intent with no follow up captured
- An interview or meeting referenced with no date logged
- A salary figure mentioned that differs from what is on the record

TYPE 3 — CAMPAIGN REPLY (special handling):
ALWAYS fire a "Campaign Reply" signal when the note represents an inbound reply to an outreach campaign. Triggers:
- Phrases like "reply received", "replied to", "responded to", "email reply", "replied:"
- Note that mentions Sourcewhale or any sourcing-tool reply forward
- Inbound message wording where the candidate is responding, not the recruiter writing about them

For Campaign Reply signals:
- signal_type: "Campaign Reply"
- signal_category: "opportunity"
- trigger_phrase: the reply indicator quoted
- explanation: identify which campaign/role they replied to if available, else "Inbound reply from outreach campaign"
- suggested_action — assess fit from the reply content + candidate profile and use ONE of these exact patterns:
    STRONG FIT → "[Name] replied positively and matches [Job] at [Client]. Call today — get them in front of the client."
    UNCLEAR FIT → "[Name] replied to your campaign. Review their profile and reply content to assess fit."
    NEGATIVE → "[Name] replied but indicated not interested or wrong timing. Update their status."
  If the full reply content is NOT in the note, use UNCLEAR FIT and append " — Reply received, check Sourcewhale for content."
- priority_score: STRONG=8 (amber, today), UNCLEAR=5 (green, this week), NEGATIVE=2 (grey, status update).
- confidence: "high" for any clear inbound reply.

For each signal, provide:
- signal_category: exactly "opportunity" or "missing_action"
- signal_type: opportunities → "Hiring Signal" | "Candidate Signal" | "Referral Opportunity" | "BD Lead" | "Campaign Reply". missing_action → "Missing Follow-up" | "Missing Next Action" | "Missing Interview Date" | "Salary Mismatch" | "Missing Commitment"
- trigger_phrase: exact quote (under 10 words)
- explanation: one sentence why it matters
- suggested_action: one specific action
- suggested_date: optional ISO date or day name
- confidence: "high" | "medium" | "low"
- priority_score: 1-10 integer based on revenue/urgency impact:
    * 8-10 = Revenue at risk OR strong-fit campaign reply
    * 5-7  = Pipeline/BD opportunity (hiring signal, BD lead, candidate signal, unclear campaign reply)
    * 1-3  = Admin/info OR negative campaign reply

If no clear signals, return empty array. Do NOT invent signals.

Return ONLY valid JSON:
{"signals": [{"signal_category":"...","signal_type":"...","trigger_phrase":"...","explanation":"...","suggested_action":"...","suggested_date":"...","confidence":"high","priority_score":8}]}`;

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

      const parts: string[] = [];
      if (note.follow_up_date) parts.push(`Follow-up date already set: ${note.follow_up_date}`);
      if (note.outcome) parts.push(`Outcome: ${note.outcome}`);
      recordContext = parts.length > 0 ? `\n\nRecord metadata: ${parts.join(". ")}` : "";
    } else if (context) {
      transcript = context.content || "";
      contactName = context.contact_name || "Unknown";
      recordContext = context.record_metadata || "";
      resolvedNoteId = context.note_id || null;
    }

    if (transcript.length < 20) {
      return new Response(JSON.stringify({ signals: 0, detected: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-check for campaign reply triggers — bias the model when found.
    const replyRegex = /\b(reply received|replied to|responded to|email reply|replied:)\b/i;
    const sourcewhaleMention = /sourcewhale/i.test(transcript);
    const hasReplyTrigger = replyRegex.test(transcript) || sourcewhaleMention;
    const replyHint = hasReplyTrigger
      ? `\n\nIMPORTANT: This note contains an inbound campaign reply indicator${sourcewhaleMention ? " (Sourcewhale source detected)" : ""}. You MUST emit a "Campaign Reply" signal per TYPE 3 above, assessing fit (strong / unclear / negative) from the reply text and candidate context. Do this in addition to any other signals.`
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

    // Compute fallback priority score by category if AI omitted
    const fallbackPriority = (s: any): number => {
      const t = (s.signal_type || "").toLowerCase();
      if (t.includes("counter") || t.includes("offer")) return 9;
      if (t.includes("hiring") || t.includes("bd")) return 6;
      if (t.includes("candidate")) return 6;
      if (t.includes("referral")) return 5;
      if (t.includes("missing salary") || t.includes("profile")) return 2;
      if (s.signal_category === "missing_action") return 5;
      return 4;
    };

    if (signals.length > 0 && resolvedNoteId) {
      await sb.from("call_signals").delete().eq("note_id", resolvedNoteId);

      const rows = signals.map((s: any) => {
        const conf = ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "medium";
        const score = Number.isFinite(s.priority_score)
          ? Math.max(1, Math.min(10, Math.round(s.priority_score)))
          : fallbackPriority(s);
        return {
          note_id: resolvedNoteId,
          signal_type: s.signal_type,
          signal_category: s.signal_category || "opportunity",
          trigger_phrase: s.trigger_phrase,
          explanation: s.explanation,
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

    return new Response(JSON.stringify({ signals: signals.length, detected: signals }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-signals error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
