// Natural-language advanced search over candidates / contacts.
// Uses standard OpenAI-compatible chat completions API so it works with any model.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Record = {
  id: string;
  type: "candidate" | "contact";
  name: string;
  job_title?: string | null;
  company?: string | null;
  sector?: string | null;
  location?: string | null;
  status?: string | null;
  last_contacted?: string | null;
  notes_excerpt?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, scope, records } = await req.json() as {
      query: string;
      scope: "candidate" | "contact" | "global";
      records: Record[];
    };

    if (!query || !Array.isArray(records)) {
      return new Response(JSON.stringify({ error: "query and records required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Cap records sent to model to keep prompts safe
    const trimmed = records.slice(0, 250);
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const system = `You are a search assistant for a recruitment CRM. The user gives a natural language query and you must find the records that best match.
Read every record's job title, employer/company, sector, location, status, last contacted date, and notes excerpt.
Return ONLY a JSON object of the form: { "matches": [ { "id": "<record id>", "reason": "<one short sentence why it matches>" } ] }.
Order matches by relevance (best first). If nothing matches, return an empty array. Do not invent records — only return ids that exist in the input.`;

    const userMsg = `Query: ${query}
Scope: ${scope}
Today: ${new Date().toISOString().slice(0, 10)}

Records (${trimmed.length}):
${JSON.stringify(trimmed)}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return new Response(JSON.stringify({ error: "AI gateway error", status: r.status, detail: text }), {
        status: r.status === 429 || r.status === 402 ? r.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await r.json();
    const content: string = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: { matches?: { id: string; reason: string }[] } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try to extract a JSON object substring
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }

    const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
    return new Response(JSON.stringify({ matches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
