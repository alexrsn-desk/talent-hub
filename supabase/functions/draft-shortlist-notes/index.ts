// Draft punchy 2-3 line client-ready notes for each candidate in a shortlist
// email. Uses standard OpenAI-compatible JSON output via Lovable AI Gateway,
// which works with both Gemini and Claude families.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  job_id: string;
  candidate_ids: string[];
  recruiter_style?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    }
    const { job_id, candidate_ids, recruiter_style }: Body = await req.json();
    if (!job_id || !Array.isArray(candidate_ids) || candidate_ids.length === 0) {
      return json({ error: "job_id and candidate_ids required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: job } = await sb
      .from("jobs")
      .select("title, description, intake_summary, location, salary_min, salary_max, clients(company_name, sector)")
      .eq("id", job_id)
      .single();

    const { data: candidates = [] } = await sb
      .from("candidates")
      .select("id, name, job_title, current_employer, location, availability, salary_expectation, salary_current, notice_period, summary")
      .in("id", candidate_ids);

    const { data: notes = [] } = await sb
      .from("notes")
      .select("candidate_id, content, activity_type, created_at")
      .in("candidate_id", candidate_ids)
      .order("created_at", { ascending: false })
      .limit(60);

    // screening_notes links via candidate_job_id
    const { data: cjs = [] } = await sb
      .from("candidate_jobs")
      .select("id, candidate_id")
      .in("candidate_id", candidate_ids);
    const cjToCand = new Map<string, string>((cjs as any[]).map((c) => [c.id, c.candidate_id]));
    const cjIds = (cjs as any[]).map((c) => c.id);
    const { data: screening = [] } = cjIds.length
      ? await sb
          .from("screening_notes")
          .select("candidate_job_id, why_suitable, key_strengths, concerns")
          .in("candidate_job_id", cjIds)
      : { data: [] };

    const notesByCand: Record<string, string[]> = {};
    for (const n of notes as any[]) {
      if (!n.candidate_id) continue;
      (notesByCand[n.candidate_id] ||= []).push(`[${n.activity_type}] ${String(n.content).slice(0, 400)}`);
    }
    for (const s of screening as any[]) {
      const candId = cjToCand.get(s.candidate_job_id);
      if (!candId) continue;
      const parts = [s.why_suitable, s.key_strengths, s.concerns].filter(Boolean).join(" · ");
      if (parts) (notesByCand[candId] ||= []).push(`[Screening] ${parts.slice(0, 500)}`);
    }

    const jobCtx = `Role: ${job?.title || "?"} at ${(job as any)?.clients?.company_name || "client"}
Location: ${job?.location || "?"} · Salary £${job?.salary_min || "?"}-£${job?.salary_max || "?"}
JD: ${(job as any)?.description || "Not provided"}
Intake brief: ${(job as any)?.intake_summary || "Not captured"}`.trim();

    const candCtx = (candidates as any[]).map((c) => `
ID:${c.id}
Name: ${c.name}
Title: ${c.job_title || "?"} at ${c.current_employer || "?"}
Salary expectation: £${c.salary_expectation || "?"} (current £${c.salary_current || "?"})
Availability/notice: ${c.availability || c.notice_period || "?"}
Notes: ${(notesByCand[c.id] || []).slice(0, 4).join(" | ") || "None"}
`.trim()).join("\n---\n");

    const styleLine = recruiter_style?.trim()
      ? `Match this recruiter's writing style as closely as possible:\n"""\n${recruiter_style.trim()}\n"""`
      : `Use a confident, direct, recruiter-to-client tone. Punchy. Specific. No filler.`;

    const system = `You write client-facing shortlist notes for a recruiter sending candidates to a hiring manager.

Rules:
- 2-3 sentences per candidate, MAX 60 words each.
- Reference THIS role's brief. Say WHY this candidate is right for THIS job.
- Punchy, specific, written like a recruiter who knows the candidate well.
- Never list skills generically. Never start with "Experienced ...".
- Make the client want to meet them.
- Don't repeat the candidate's name (the email layout already shows it).
- Plain prose only. No bullets, no markdown.

${styleLine}

Return ONLY a JSON object: { "notes": [ { "candidate_id": "<id>", "note": "<2-3 sentences>" } ] }
Return one entry per candidate provided, in the same order.`;

    const user = `${jobCtx}\n\nCANDIDATES:\n${candCtx}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return json({ error: "AI gateway error", status: r.status, detail }, r.status === 429 || r.status === 402 ? r.status : 500);
    }
    const data = await r.json();
    let parsed: any = {};
    const content = data.choices?.[0]?.message?.content ?? "{}";
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    const noteMap: Record<string, string> = {};
    for (const n of (parsed.notes || []) as any[]) {
      if (n?.candidate_id && n?.note) noteMap[n.candidate_id] = String(n.note).trim();
    }
    // Ensure every candidate has a note
    const result = (candidates as any[]).map((c) => ({
      candidate_id: c.id,
      note: noteMap[c.id] || `Strong fit for this role based on recent conversations. Worth a 20-minute intro.`,
    }));
    return json({ notes: result });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
