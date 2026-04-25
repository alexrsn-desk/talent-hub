// Drafts a personal-sequence outreach message in the recruiter's voice.
// Uses the Lovable AI Gateway (OpenAI-compatible chat completions) so the
// same code works with any supported model — no Gemini-specific features.

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
  channel: string;
  message_prompt: string | null;
  sequence_name: string;
  step_number: number;
  entity_type: "candidate" | "contact" | "client";
  entity_id: string;
  entity_name: string;
  company: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.entity_name || !body?.channel) {
      return json({ error: "entity_name and channel are required" }, 400);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    // Pull lightweight context: latest note + entity summary
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

    let lastNote = "";
    let summary = "";
    try {
      const filterCol = body.entity_type === "candidate" ? "candidate_id" : "client_id";
      const filterId = body.entity_type === "contact"
        ? await (async () => {
            const r = await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${body.entity_id}&select=client_id`, { headers });
            const arr = await r.json();
            return arr?.[0]?.client_id ?? null;
          })()
        : body.entity_id;
      if (filterId) {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/notes?${filterCol}=eq.${filterId}&select=content,activity_type,created_at&order=created_at.desc&limit=1`,
          { headers }
        );
        const arr = await r.json();
        lastNote = arr?.[0]?.content ?? "";
      }
      if (body.entity_type === "candidate") {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/candidates?id=eq.${body.entity_id}&select=summary,job_title`, { headers });
        const arr = await r.json();
        summary = arr?.[0]?.summary ?? arr?.[0]?.job_title ?? "";
      } else if (body.entity_type === "client") {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${body.entity_id}&select=summary`, { headers });
        const arr = await r.json();
        summary = arr?.[0]?.summary ?? "";
      } else if (body.entity_type === "contact") {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${body.entity_id}&select=summary,job_title`, { headers });
        const arr = await r.json();
        summary = arr?.[0]?.summary ?? arr?.[0]?.job_title ?? "";
      }
    } catch (_) {
      // Context fetch is best-effort
    }

    const channelGuidance: Record<string, string> = {
      Email: "Short, warm, professional email. 3–5 sentences max. Plain text. No subject line.",
      LinkedIn: "Brief LinkedIn message. 2–4 sentences. Conversational, no fluff.",
      Phone: "A short voicemail / opening line script if they pick up. 2–3 sentences.",
      WhatsApp: "Casual, brief WhatsApp message. 1–3 sentences.",
    };

    const systemPrompt = [
      "You draft outreach messages for a recruiter to send themselves.",
      "Write in the recruiter's natural voice — direct, warm, no corporate jargon.",
      "Never use phrases like 'I hope this message finds you well' or 'just touching base'.",
      "Reference the context provided when relevant. Do not invent facts.",
      "Output only the message text — no preamble, no sign-off boilerplate, no quotes.",
    ].join(" ");

    const userPrompt = [
      `Sequence: ${body.sequence_name} — Step ${body.step_number}`,
      `Channel: ${body.channel}. ${channelGuidance[body.channel] ?? ""}`,
      `Recipient: ${body.entity_name}${body.company ? ` (${body.company})` : ""}`,
      body.message_prompt ? `Angle for this step: ${body.message_prompt}` : "",
      summary ? `Context on recipient: ${summary}` : "",
      lastNote ? `Most recent note: ${lastNote.slice(0, 600)}` : "",
      "",
      "Draft the message now.",
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
      }),
    });

    if (aiRes.status === 429) return json({ error: "Rate limited — try again in a moment." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted. Add credits in Settings." }, 402);
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return json({ error: `AI gateway error: ${errText}` }, 500);
    }

    const data = await aiRes.json();
    const message = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return json({ message });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});
