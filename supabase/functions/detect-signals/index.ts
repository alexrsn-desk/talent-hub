import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIGNAL_PROMPT = `You are an expert recruitment consultant reviewing a call transcript. Identify any of the following signals that appear in this conversation:

HIRING SIGNALS: Any mention of company growth, funding rounds, new leadership, team expansion, new offices, new products, technology changes, or dissatisfaction with current recruitment partners.

CANDIDATE SIGNALS: Any mention of company instability, acquisition, restructuring, colleagues also looking, lack of pay reviews, unhappy team, or manager changes.

REFERRAL OPPORTUNITIES: Any mention of colleagues, contacts or people by name who might be candidates or clients.

BD LEADS: Any company names mentioned that could be a new business target.

For each signal found:
- State the signal type (exactly one of: "Hiring Signal", "Candidate Signal", "Referral Opportunity", "BD Lead")
- Quote the exact phrase that triggered it (under 10 words)
- Explain why it matters in one sentence
- Suggest one specific action

If no signals are found, return an empty array — do not invent signals that are not there.

Return ONLY valid JSON in this format:
{"signals": [{"signal_type": "...", "trigger_phrase": "...", "explanation": "...", "suggested_action": "..."}]}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { note_id } = await req.json();
    if (!note_id) {
      return new Response(JSON.stringify({ error: "note_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch the note
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

    const transcript = note.transcript || note.content || "";
    if (transcript.length < 20) {
      return new Response(JSON.stringify({ signals: [], message: "Content too short for analysis" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contactName = note.candidates?.name || note.clients?.company_name || "Unknown";

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
          { role: "user", content: `Call with: ${contactName}\n\nTranscript/Notes:\n${transcript}` },
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

    // Parse JSON from response (handle markdown code blocks)
    let parsed: { signals?: any[] } = { signals: [] };
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
    }

    const signals = parsed.signals || [];

    if (signals.length > 0) {
      // Delete existing signals for this note and insert fresh
      await sb.from("call_signals").delete().eq("note_id", note_id);

      const rows = signals.map((s: any) => ({
        note_id,
        signal_type: s.signal_type,
        trigger_phrase: s.trigger_phrase,
        explanation: s.explanation,
        suggested_action: s.suggested_action,
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
