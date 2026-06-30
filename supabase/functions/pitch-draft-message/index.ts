// Generates warm-pitch or cold-pitch messages following strict framing rules.
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
    const { type, candidate, story, why_now, target, recruiter_name } = await req.json();
    // type: "warm" | "cold"
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const framing = `CRITICAL FRAMING RULES (non-negotiable):
- ALWAYS lead with the candidate. NEVER lead with the role or a need.
- NEVER say "do you have any roles?" or anything resembling asking for something.
- OFFER something — do not ask for something.
- Use the candidate's FIRST NAME ONLY. Never use full name or formal address.
- Soft close — make it easy to say no.
- No emojis. No buzzwords. Plain professional UK English.`;

    let structure = "";
    if (type === "warm") {
      structure = `Structure (warm pitch to existing network):
1. Opening: "I've been speaking to someone I think you should know about — <story in 1-2 sentences using first name>"
2. Why this person specifically: "Thought of you immediately — <specific reason tied to their company/network/sector>"
3. Soft close: "No worries at all if the timing isn't right — just felt worth a quick note"`;
    } else {
      structure = `Structure (cold pitch to a new market company):
1. Opening: "I came across <Company> while working with a <candidate background> who I think could be interesting for you — <specific reason based on their business>"
2. Candidate brief (1-2 sentences): "<first name> <specific impressive thing>. Available <when>. Looking for <what they want — only if it plausibly matches this company>."
3. Soft close: "Happy to share more if useful — no obligation either way"`;
    }

    const sys = `You write recruitment outreach messages. ${framing}\n${structure}\nReturn strict JSON: {"subject":"<short>","body":"<plain text, 80-160 words>"}`;

    const user = `Type: ${type}\nRecruiter: ${recruiter_name || "the recruiter"}\nCandidate:\n${JSON.stringify(candidate, null, 2)}\nTheir story (lead with this): ${story}\nWhy now: ${why_now || "n/a"}\nTarget:\n${JSON.stringify(target, null, 2)}`;

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
    return json({ subject: parsed.subject || "", body: parsed.body || "" });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
