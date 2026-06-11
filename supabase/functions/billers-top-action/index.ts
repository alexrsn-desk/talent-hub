import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const { sections } = await req.json();

    const system = `You are an experienced senior recruiter giving a one-line briefing. The data has two sections: closeProtect (money in motion — protect it) and feedTheBeast (future money — proactive growth). Identify the SINGLE highest-priority revenue action for today. Reply with ONE sentence in this exact format:

"[Specific action — include a name]. Do that first."

No explanation, no list, no preamble. Use a name from the data when possible. Prioritise: cold offers > backup needed at final/offer > client gone quiet on submitted CVs > long-notice counter-offer risk > thin pipelines > BD reactivation > silver medallist re-engagement > placed-candidate referrals > talent pool health. If recentPlacement is set, lean toward a feedTheBeast action. If navinMode is true, ignore closeProtect entirely and pick a BD call.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Sections:\n${JSON.stringify(sections).slice(0, 8000)}` },
        ],
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ line: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!response.ok) {
      return new Response(JSON.stringify({ line: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const j = await response.json();
    const line = j.choices?.[0]?.message?.content?.trim() || "";
    return new Response(JSON.stringify({ line }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ line: "", error: e instanceof Error ? e.message : "Unknown" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
