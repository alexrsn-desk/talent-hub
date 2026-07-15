// Suggest similar job titles and key skills for a role.
// Uses standard OpenAI-compatible chat completions via Lovable AI Gateway (works with Gemini & Claude).
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ titles: [], skills: [] });
    const { title, description, ideal_candidate_line, model } = await req.json();

    const system = `You help recruiters expand a role brief into search signals.
Return ONLY JSON: {"titles":["..."],"skills":["..."]}.
- 5-8 SIMILAR JOB TITLES (adjacent disciplines / seniority variants a suitable candidate might actually hold today). Short titles, no company names.
- 6-10 KEY SKILLS or experience words (lowercase phrases, 1-3 words each, no punctuation) that would appear in a strong candidate's profile or CV.
No duplicates. No generic filler like "team player".`;

    const user = `ROLE TITLE: ${title || "?"}
JOB DESCRIPTION: ${(description || "").slice(0, 3000) || "—"}
IDEAL CANDIDATE: ${ideal_candidate_line || "—"}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ titles: [], skills: [], error: `AI ${r.status}: ${t.slice(0, 200)}` });
    }
    const d = await r.json();
    const parsed = JSON.parse(d.choices?.[0]?.message?.content || "{}");
    const titles = Array.from(new Set(((parsed.titles || []) as string[]).map((s) => String(s).trim()).filter(Boolean))).slice(0, 8);
    const skills = Array.from(new Set(((parsed.skills || []) as string[]).map((s) => String(s).trim().toLowerCase()).filter(Boolean))).slice(0, 10);
    return json({ titles, skills });
  } catch (e: any) {
    return json({ titles: [], skills: [], error: e?.message || "unknown" }, 200);
  }
});
