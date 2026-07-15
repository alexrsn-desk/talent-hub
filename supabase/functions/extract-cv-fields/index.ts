import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You extract structured candidate details from CV/resume text.

Return ONLY a JSON object (no prose, no markdown fences) with these exact keys:
{
  "first_name": string,
  "last_name": string,
  "email": string,
  "phone": string,
  "current_job_title": string,
  "current_employer": string,
  "location": string,
  "current_salary": string,
  "notice_period": string,
  "linkedin_url": string,
  "summary": string
}

Rules:
- Use "" (empty string) for anything not clearly present. Never invent.
- current_job_title/current_employer = the most recent role.
- current_salary: only if explicitly stated (numeric or "£85,000"). Otherwise "".
- notice_period: e.g. "1 month", "3 months", "immediate". Otherwise "".
- summary: 2-3 short sentences describing seniority, specialism, standout experience. British English.
- Output MUST be valid JSON and nothing else.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 30) {
      return new Response(JSON.stringify({ error: "CV text too short" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const truncated = text.slice(0, 20000);
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `CV TEXT:\n\n${truncated}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const raw = (aiData.choices?.[0]?.message?.content || "").trim();
    let parsed: Record<string, string> = {};
    try {
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("JSON parse failed:", raw);
      throw new Error("Could not parse CV output");
    }

    const out = {
      first_name: (parsed.first_name || "").trim(),
      last_name: (parsed.last_name || "").trim(),
      email: (parsed.email || "").trim(),
      phone: (parsed.phone || "").trim(),
      current_job_title: (parsed.current_job_title || "").trim(),
      current_employer: (parsed.current_employer || "").trim(),
      location: (parsed.location || "").trim(),
      current_salary: (parsed.current_salary || "").trim(),
      notice_period: (parsed.notice_period || "").trim(),
      linkedin_url: (parsed.linkedin_url || "").trim(),
      summary: (parsed.summary || "").trim(),
    };

    return new Response(JSON.stringify({ fields: out }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-cv-fields error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
