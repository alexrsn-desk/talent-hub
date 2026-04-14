import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIGNAL_PROMPT = `You are an expert recruitment consultant reviewing new information just added to a recruitment CRM. Identify two types of signals:

TYPE 1 — OPPORTUNITIES:
Hidden signals the recruiter may have missed.

HIRING SIGNALS: Company growth, funding rounds, new leadership, team expansion, technology changes, dissatisfaction with current recruitment partners.
CANDIDATE SIGNALS: Company instability, acquisition, restructuring, colleagues also looking, lack of pay reviews, unhappy team, manager changes.
REFERRAL OPPORTUNITIES: Colleagues or contacts mentioned who might be candidates or clients.
BD LEADS: Company names mentioned that could be a new business target.

TYPE 2 — MISSING ACTIONS:
Things the recruiter should have done but hasn't. Check for:
- A specific day, date or timeframe mentioned (Monday, next week, end of month, after the weekend) with no follow up date set on the record
- A commitment made by either party with no next action logged
- A candidate or client expressing clear intent (I will call you, I want to progress, let me think about it) with no follow up captured
- An interview or meeting referenced with no date logged in the system
- A salary figure or requirement mentioned that differs from what is on the record

For each signal found:
- State the signal_category: exactly "opportunity" or "missing_action"
- State the signal_type: for opportunities use exactly one of "Hiring Signal", "Candidate Signal", "Referral Opportunity", "BD Lead". For missing actions use exactly one of "Missing Follow-up", "Missing Next Action", "Missing Interview Date", "Salary Mismatch", "Missing Commitment"
- Quote the exact phrase that triggered it (under 10 words) as trigger_phrase
- Explain why it matters in one sentence as explanation
- Suggest one specific action as suggested_action
- For missing actions, if a date/day was mentioned, include it as suggested_date (ISO format or day name). Otherwise omit.

If no signals found, return an empty array — do not invent signals that are not there.

Return ONLY valid JSON in this format:
{"signals": [{"signal_category": "...", "signal_type": "...", "trigger_phrase": "...", "explanation": "...", "suggested_action": "...", "suggested_date": "..."}]}`;

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

      // Add record context (follow-up date, etc.)
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
          { role: "user", content: `Contact: ${contactName}\n\nContent:\n${transcript}${recordContext}` },
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

    if (signals.length > 0 && resolvedNoteId) {
      await sb.from("call_signals").delete().eq("note_id", resolvedNoteId);

      const rows = signals.map((s: any) => ({
        note_id: resolvedNoteId,
        signal_type: s.signal_type,
        signal_category: s.signal_category || "opportunity",
        trigger_phrase: s.trigger_phrase,
        explanation: s.explanation,
        suggested_action: s.suggested_action,
        suggested_date: s.suggested_date || null,
        status: "unactioned",
      }));

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
