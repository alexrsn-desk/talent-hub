// Compare & Submit — draft a client-facing submission email (subject + body)
// for the selected candidates, in the recruiter's saved style if available.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Selected = {
  ref_id: string;
  name: string;
  first_name?: string;
  job_title?: string;
  current_employer?: string;
  salary_expectation?: number | null;
  availability?: string | null;
  reason?: string;
  extra_context?: string;
};

type Body = {
  job_id: string;
  format: "individual" | "shortlist";
  candidates: Selected[];
  recruiter_style?: string | null;
  recruiter_first_name?: string | null;
  model?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const body: Body = await req.json();
    const { job_id, format, candidates, recruiter_style, recruiter_first_name, model } = body;
    if (!job_id || !Array.isArray(candidates) || candidates.length === 0) {
      return json({ error: "job_id and candidates required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: job } = await sb
      .from("jobs")
      .select("title, description, salary_min, salary_max, location, clients(company_name, contact_name, email)")
      .eq("id", job_id)
      .single();

    const client = (job as any)?.clients || {};
    const jobCtx = `Role: ${job?.title || "?"} at ${client.company_name || "client"}
Contact: ${client.contact_name || "?"}
Salary band: £${job?.salary_min || "?"} – £${job?.salary_max || "?"}
Location: ${job?.location || "?"}
JD excerpt: ${(job?.description || "").slice(0, 1200)}`;

    const candBlock = candidates.map((c, i) => `### Candidate ${i + 1}
ref_id: ${c.ref_id}
Name: ${c.name}
Current: ${c.job_title || "?"} @ ${c.current_employer || "?"}
Salary expectation: ${c.salary_expectation ? `£${Number(c.salary_expectation).toLocaleString()}` : "—"}
Availability: ${c.availability || "—"}
Recruiter's selling angle: ${c.reason || "—"}
Extra context: ${c.extra_context || "—"}`).join("\n\n");

    const styleLine = recruiter_style?.trim()
      ? `Match this recruiter's writing style as closely as possible:\n"""\n${recruiter_style.trim()}\n"""`
      : "Use a confident, professional, recruiter-to-client tone. Punchy. Specific. No filler. No emojis.";

    const formatRule = format === "shortlist"
      ? `Format: ONE shortlist email containing all candidates as separate paragraphs in a clear order. Each candidate paragraph: name, current role, 2–3 sentences selling them for THIS role, salary/availability line.`
      : `Format: A SEPARATE email per candidate. Each is a complete email (greeting, intro paragraph, why this candidate, salary/availability, sign-off).`;

    const system = `You draft client-facing recruitment submission emails.

CRITICAL:
- Client-facing tone: punchy, selling, professional. NOT internal/analytical.
- Reference THIS role specifically — do not write generic text.
- Use the candidate's FIRST NAME only.
- 2–3 sentences per candidate, max ~70 words.
- Plain prose only. No bullets. No markdown.
- Do NOT add unsubscribe text, signatures with placeholders like [Your Name], or footers — the recruiter will add their own signature.
- Sign off with first name "${recruiter_first_name || ""}" if provided, otherwise leave a blank line.

${formatRule}

${styleLine}

Return ONLY this JSON and nothing else:
${format === "shortlist"
  ? `{"subject":"...","body":"... full email body ..."}`
  : `{"emails":[{"ref_id":"<id>","subject":"...","body":"..."}]}`}`;

    const user = `JOB\n${jobCtx}\n\nCANDIDATES (${candidates.length})\n${candBlock}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.6,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: `AI error ${resp.status}`, detail: t }, resp.status);
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch {}
    return json(parsed);
  } catch (e: any) {
    return json({ error: e?.message || "unknown" }, 500);
  }
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
