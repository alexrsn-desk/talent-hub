// Suggests market companies for a candidate via LLM knowledge.
// Uses standard chat-completions — works for Gemini, Claude, OpenAI alike.
// Results MUST be labelled "verify before approaching" in the UI.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MODEL = "google/gemini-2.5-flash";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { profile, exclude_companies = [] } = await req.json();
    if (!profile) return json({ error: "profile required" }, 400);

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const sys = `You are a recruitment market researcher. Given a candidate profile and search criteria, suggest companies the recruiter should approach.
Use general industry knowledge. Each suggestion must be a real, plausible company a recruiter could verify.
Output strict JSON: {"companies":[{"name":"...","description":"<one line>","why_match":"<specific reason citing product, stage, funding, or hiring signal>","hint":"<eg. 'Recent Series B' or 'Hiring engineers per LinkedIn'>","source":"general market knowledge"}]}
Rules:
- 6-10 companies. Real-world, well-known or established names where possible.
- EXCLUDE any company in the exclude list.
- "why_match" must be specific to the candidate's background — never generic.
- Do not invent funding rounds or news you are not confident about; phrase signals as "known for", "typically hires", or "operates in".`;

    const user = `Candidate / Search profile:\n${JSON.stringify(profile, null, 2)}\n\nExclude companies (already in DB):\n${JSON.stringify(exclude_companies)}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return json({ error: "ai_error", detail: await r.text() }, 500);
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]);
    }
    return json({ companies: parsed.companies ?? [] });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
