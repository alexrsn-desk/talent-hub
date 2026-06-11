import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const { sections } = await req.json();

    const system = `You are a senior recruiter giving the single most important briefing line of the day. Two data sections are provided:
- closeProtect: deals already in motion that may slip
- feedTheBeast: proactive actions building next month's revenue
- dailyBdTargets: named BD calls when pipeline is thin
- navinMode: true if desk is empty
- recentPlacement: a placement confirmed in the last 3 days

Pick ONE specific action. Reply in EXACTLY ONE sentence in this format:
"[Specific verb + a real name from the data]. Do that first."

Priority order:
1. If navinMode: pick a name from dailyBdTargets — "Call [Name] at [Company] before midday. That is the only thing that matters today."
2. Else if recentPlacement: pick a feedTheBeast item — "Placement confirmed. Call [Name] today — feed the beast."
3. Else: highest urgency closeProtect item (counter offer risk > no candidates > offer cold > backup missing > client silent) — name + verb.
4. Else: highest urgency feedTheBeast item.

Never hedge. No "consider", "perhaps", "might". Direct and confident.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Data:\n${JSON.stringify(sections).slice(0, 8000)}` },
        ],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ line: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const j = await response.json();
    const line = j.choices?.[0]?.message?.content?.trim() || "";
    return new Response(JSON.stringify({ line }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ line: "", error: e instanceof Error ? e.message : "Unknown" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
