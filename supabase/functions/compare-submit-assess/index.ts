// Compare & Submit — assess each candidate against the job, return match scores
// and client-facing reasoning. Standard JSON output compatible with both
// Gemini and Claude through the Lovable AI Gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ExtraCandidate = {
  // pseudo id for not-yet-saved candidates (CV upload / quick add)
  ref_id: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  current_employer?: string;
  cv_text?: string;
  context?: string;
};

type Body = {
  job_id: string;
  candidate_ids?: string[];
  extra_candidates?: ExtraCandidate[];
  per_candidate_context?: Record<string, string>;
  model?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const body: Body = await req.json();
    const { job_id, candidate_ids = [], extra_candidates = [], per_candidate_context = {}, model } = body;
    if (!job_id) return json({ error: "job_id required" }, 400);
    if (candidate_ids.length + extra_candidates.length < 1) {
      return json({ error: "At least 1 candidate required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: job } = await sb
      .from("jobs")
      .select("title, description, intake_summary, location, salary_min, salary_max, job_type, clients(company_name, sector)")
      .eq("id", job_id)
      .single();

    const { data: candidates = [] } = candidate_ids.length
      ? await sb
          .from("candidates")
          .select("id, name, first_name, last_name, job_title, current_employer, location, availability, salary_expectation, salary_current, notice_period, summary, note, source")
          .in("id", candidate_ids)
      : { data: [] };

    const { data: notes = [] } = candidate_ids.length
      ? await sb
          .from("notes")
          .select("candidate_id, content, activity_type, created_at")
          .in("candidate_id", candidate_ids)
          .order("created_at", { ascending: false })
          .limit(80)
      : { data: [] };

    // screening_notes links via candidate_job_id, so hop through candidate_jobs
    const { data: cjs = [] } = candidate_ids.length
      ? await sb.from("candidate_jobs").select("id, candidate_id").in("candidate_id", candidate_ids)
      : { data: [] };
    const cjToCand = new Map<string, string>((cjs as any[]).map((c) => [c.id, c.candidate_id]));
    const cjIds = (cjs as any[]).map((c) => c.id);
    const { data: screening = [] } = cjIds.length
      ? await sb
          .from("screening_notes")
          .select("candidate_job_id, why_suitable, key_strengths, concerns")
          .in("candidate_job_id", cjIds)
      : { data: [] };

    const notesBy: Record<string, string[]> = {};
    for (const n of notes as any[]) {
      if (!n.candidate_id) continue;
      (notesBy[n.candidate_id] ||= []).push(`[${n.activity_type}] ${String(n.content).slice(0, 350)}`);
    }
    for (const s of screening as any[]) {
      const candId = cjToCand.get(s.candidate_job_id);
      if (!candId) continue;
      const parts = [s.why_suitable, s.key_strengths, s.concerns].filter(Boolean).join(" · ");
      if (parts) (notesBy[candId] ||= []).push(`[Screening] ${parts.slice(0, 400)}`);
    }

    const clientName = (job as any)?.clients?.company_name || "the client";
    const jobCtx = `Role: ${job?.title || "?"} at ${clientName}
Location: ${job?.location || "?"}  ·  ${job?.job_type || ""}
Salary: £${job?.salary_min || "?"} – £${job?.salary_max || "?"}
JD: ${(job as any)?.description || "Not provided"}
Intake brief: ${(job as any)?.intake_summary || "Not captured"}`.trim();

    const allCands = [
      ...(candidates as any[]).map((c) => ({
        ref_id: c.id,
        name: c.name,
        title: c.job_title,
        employer: c.current_employer,
        salary_expectation: c.salary_expectation,
        salary_current: c.salary_current,
        availability: c.availability || c.notice_period,
        summary: c.summary,
        note: c.note,
        notes: (notesBy[c.id] || []).slice(0, 5),
        extra_context: per_candidate_context[c.id] || "",
      })),
      ...extra_candidates.map((e) => ({
        ref_id: e.ref_id,
        name: `${e.first_name || ""} ${e.last_name || ""}`.trim() || "New candidate",
        title: e.job_title || "",
        employer: e.current_employer || "",
        cv_text: (e.cv_text || "").slice(0, 4000),
        extra_context: e.context || per_candidate_context[e.ref_id] || "",
      })),
    ];

    const candBlock = allCands.map((c, i) => `### Candidate ${i + 1}
ref_id: ${c.ref_id}
Name: ${c.name}
Current: ${c.title || "?"} @ ${c.employer || "?"}
Salary: expectation £${(c as any).salary_expectation || "?"} / current £${(c as any).salary_current || "?"}
Availability: ${(c as any).availability || "?"}
Recruiter context: ${c.extra_context || "—"}
Summary: ${(c as any).summary || "—"}
Saved note: ${(c as any).note || "—"}
Recent notes: ${((c as any).notes || []).join(" | ") || "None"}
CV excerpt: ${(c as any).cv_text || "—"}`).join("\n\n");

    const system = `You assess recruitment candidates against a specific role.
Score 0–100 for fit. Strong ≥75, Moderate 45–74, Weak <45.
Reference SPECIFIC things from the JD/intake brief and the candidate's notes/CV.
Reasoning must be 2–3 sentences, written in INTERNAL/analytical tone (the recruiter reads this).
"Watch outs" should call out salary gaps, missing domain experience, location/availability mismatch, or anything to probe in interview. Empty array if none.
Use ONLY plain prose. No markdown. Do NOT use the candidate's full name — use first name only.
Return ONLY this JSON object and nothing else:
{"assessments":[{"ref_id":"<id>","score":<int>,"tier":"strong|moderate|weak","reason":"<2-3 sentence why>","watch_outs":["..."]}]}
Return exactly one entry per candidate provided, in the same order.`;

    const user = `JOB\n${jobCtx}\n\nCANDIDATES (${allCands.length})\n${candBlock}`;

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
        temperature: 0.4,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: `AI error ${resp.status}`, detail: t }, resp.status);
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const assessments = Array.isArray(parsed.assessments) ? parsed.assessments : [];
    return json({ assessments });
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
