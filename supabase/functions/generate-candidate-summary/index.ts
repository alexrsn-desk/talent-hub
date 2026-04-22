import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { candidate, job, mode } = await req.json();

    // Overview mode: no job context — used for the candidate profile Summary field.
    const isOverview = mode === "overview" || !job;

    const prompt = isOverview
      ? `Write a concise candidate overview for a recruiter's internal profile. Cover who they are, what they want, and why they stand out. No headings, no markdown — just 2-3 short paragraphs (around 120-180 words). Direct, recruiter tone.

CANDIDATE:
- Name: ${candidate.name}
- Current Role: ${candidate.job_title || "Not specified"}
- Current Employer: ${candidate.current_employer || "Not specified"}
- Location: ${candidate.location || "Not specified"}
- Current Salary: ${candidate.salary_current ? `£${candidate.salary_current.toLocaleString()}` : "Not disclosed"}
- Salary Expectation: ${candidate.salary_expectation ? `£${candidate.salary_expectation.toLocaleString()}` : "Not disclosed"}
- Availability: ${candidate.availability || "Not specified"}
- Source: ${candidate.source || "Direct"}

If a field is missing, infer sensibly from what's there or skip it. Do not invent specific employers, achievements, or skills that aren't present.`
      : `Write a professional one-page candidate profile summary for a recruitment client. Be concise, compelling, and highlight key strengths.

CANDIDATE:
- Name: ${candidate.name}
- Current Role: ${candidate.job_title || "Not specified"}
- Current Employer: ${candidate.current_employer || "Not specified"}
- Location: ${candidate.location || "Not specified"}
- Current Salary: ${candidate.salary_current ? `£${candidate.salary_current.toLocaleString()}` : "Not disclosed"}
- Availability: ${candidate.availability || "Not specified"}
- Source: ${candidate.source || "Direct"}

JOB:
- Title: ${job.title}
- Location: ${job.location || "Not specified"}
- Salary Range: ${job.salary_min && job.salary_max ? `£${job.salary_min.toLocaleString()} - £${job.salary_max.toLocaleString()}` : "Not specified"}
- Type: ${job.job_type}

Write a structured summary with sections:
1. **Executive Summary** (2-3 sentences on why this candidate is a strong fit)
2. **Key Skills & Experience** (bullet points)
3. **Career Highlights** (notable achievements)
4. **Motivation** (why they're looking and what they want)
5. **Availability & Package** (timeline and salary expectations)

Keep it to 250-300 words. Professional tone. No fluff.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
      }),
    });

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || "Unable to generate summary.";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
