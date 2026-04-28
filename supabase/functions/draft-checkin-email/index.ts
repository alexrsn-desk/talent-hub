// Drafts a personalised candidate check-in email.
// Uses the Lovable AI Gateway (OpenAI-compatible chat completions) — works with any supported model.
// Returns { subject, body } — no Gemini-specific features used.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Body {
  candidate_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { candidate_id } = (await req.json()) as Body;
    if (!candidate_id) return json({ error: "candidate_id required" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

    // Candidate
    const candRes = await fetch(
      `${SUPABASE_URL}/rest/v1/candidates?id=eq.${candidate_id}&select=*`,
      { headers }
    );
    const candArr = await candRes.json();
    const candidate = candArr?.[0];
    if (!candidate) return json({ error: "Candidate not found" }, 404);

    const firstName = candidate.first_name || (candidate.name || "").split(" ")[0] || "there";

    // Tags (motivations/preferences/sectors)
    let tagLabels: string[] = [];
    try {
      const tRes = await fetch(
        `${SUPABASE_URL}/rest/v1/candidate_tags?candidate_id=eq.${candidate_id}&select=tag_definitions(label,category)`,
        { headers }
      );
      const tArr = await tRes.json();
      tagLabels = (tArr || [])
        .map((t: any) => t.tag_definitions?.label)
        .filter(Boolean);
    } catch (_) { /* best effort */ }

    // Most recent note + days since
    let lastNote = "";
    let daysSinceContact: number | null = null;
    try {
      const nRes = await fetch(
        `${SUPABASE_URL}/rest/v1/notes?candidate_id=eq.${candidate_id}&select=content,activity_type,created_at&order=created_at.desc&limit=1`,
        { headers }
      );
      const nArr = await nRes.json();
      lastNote = nArr?.[0]?.content ?? "";
      if (nArr?.[0]?.created_at) {
        const ms = Date.now() - new Date(nArr[0].created_at).getTime();
        daysSinceContact = Math.floor(ms / (1000 * 60 * 60 * 24));
      }
    } catch (_) { /* best effort */ }

    // Recruiter writing style examples (from screening preferences)
    let styleExamples: string[] = [];
    let recruiterName = "";
    try {
      const pRes = await fetch(
        `${SUPABASE_URL}/rest/v1/screening_preferences?select=examples&limit=1`,
        { headers }
      );
      const pArr = await pRes.json();
      styleExamples = (pArr?.[0]?.examples || []).slice(0, 2);

      const rpRes = await fetch(
        `${SUPABASE_URL}/rest/v1/recruiter_profiles?select=display_name&limit=1`,
        { headers }
      );
      const rpArr = await rpRes.json();
      recruiterName = rpArr?.[0]?.display_name ?? "";
    } catch (_) { /* best effort */ }

    const systemPrompt = [
      "You draft short, warm candidate check-in emails for a recruiter.",
      "Voice: direct, human, no corporate jargon. Never use 'I hope this finds you well' or 'just touching base'.",
      "Length: 3–5 short sentences in the body. Reference relevant context naturally — don't list facts.",
      "End the body with a single clear question inviting a quick reply about whether they're still open to roles.",
      "Do NOT include any sign-off, signature, salutation footer, GDPR text, or unsubscribe text — those are added separately.",
      "Return ONLY a JSON object with exactly two string keys: subject and body. No prose, no markdown, no code fences.",
    ].join(" ");

    const userPrompt = [
      `Candidate first name: ${firstName}`,
      candidate.job_title ? `Current role: ${candidate.job_title}${candidate.current_employer ? ` at ${candidate.current_employer}` : ""}` : "",
      candidate.location ? `Location: ${candidate.location}` : "",
      candidate.salary_current ? `Current salary: £${candidate.salary_current.toLocaleString()}` : "",
      candidate.availability ? `Availability: ${candidate.availability}` : "",
      tagLabels.length ? `Profile tags (motivations / preferences / sectors): ${tagLabels.join(", ")}` : "",
      daysSinceContact !== null ? `Days since last contact: ${daysSinceContact}` : "Not contacted recently.",
      lastNote ? `Most recent note: ${lastNote.slice(0, 600)}` : "",
      styleExamples.length ? `Recruiter writing samples (match this voice):\n${styleExamples.map((e, i) => `Sample ${i + 1}: ${e.slice(0, 400)}`).join("\n")}` : "",
      "",
      `Subject must follow this exact pattern: "Quick check in — ${firstName}"`,
      "Now produce the JSON object.",
    ].filter(Boolean).join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429) return json({ error: "Rate limited — try again in a moment." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted. Add credits in Settings." }, 402);
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return json({ error: `AI gateway error: ${errText}` }, 500);
    }

    const data = await aiRes.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? "{}";

    let parsed: { subject?: string; body?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Fallback if model wrapped output
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    const subject = (parsed.subject || `Quick check in — ${firstName}`).trim();
    const body = (parsed.body || "").trim();

    return json({ subject, body, recruiter_name: recruiterName });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});
