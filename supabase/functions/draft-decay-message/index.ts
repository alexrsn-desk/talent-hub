// Draft a specific opening message for a Relationship Decay alert.
// Uses the contact reason — never a generic check-in. Vendor-neutral
// chat completions API; works with any supported model.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Body {
  entity_name: string;
  company?: string | null;
  channel: string; // Email / LinkedIn / WhatsApp / Phone
  reason: string;
  approach?: string | null;
  days_since_contact?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body?.entity_name || !body?.reason || !body?.channel) {
      return json({ error: "entity_name, reason and channel are required" }, 400);
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    const channelGuidance: Record<string, string> = {
      Email: "Short warm email. 3–5 sentences. Plain text, no subject line.",
      LinkedIn: "Brief LinkedIn message. 2–4 sentences. Conversational.",
      WhatsApp: "Casual WhatsApp message. 1–3 sentences.",
      Phone: "A short call opener / voicemail script. 2–3 sentences.",
    };

    const system = [
      "You draft opening messages for a recruiter to send themselves after a relationship has gone quiet.",
      "The message MUST reference the specific contact reason provided — never a generic check-in or 'just touching base'.",
      "Tone: warm, direct, no corporate jargon. Recruiter's natural voice.",
      "Do not invent facts. Use only the reason and approach supplied.",
      "Output only the message text — no preamble, quotes, or sign-off boilerplate.",
    ].join(" ");

    const user = [
      `Recipient: ${body.entity_name}${body.company ? ` (${body.company})` : ""}`,
      `Channel: ${body.channel}. ${channelGuidance[body.channel] ?? ""}`,
      typeof body.days_since_contact === "number" ? `Last contact: ${body.days_since_contact} days ago` : "",
      `Reason to reach out now: ${body.reason}`,
      body.approach ? `Suggested approach: ${body.approach}` : "",
      "",
      "Draft the message now.",
    ].filter(Boolean).join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (aiRes.status === 429) return json({ error: "Rate limited — try again shortly." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted. Add credits in Settings." }, 402);
    if (!aiRes.ok) return json({ error: `AI gateway error: ${await aiRes.text()}` }, 500);

    const data = await aiRes.json();
    const message = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return json({ message });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});
