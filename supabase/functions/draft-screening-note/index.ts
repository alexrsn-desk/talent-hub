import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are helping a recruiter prepare screening notes for a candidate being considered for a specific role.

Generate structured screening notes that the recruiter can review, edit and use for a client submission.

Write in first person as the recruiter.
Be specific — use actual details from the candidate history provided.
Be honest — note any concerns or risks.
Be concise — this is a working document not a marketing piece.
Do not invent facts. If something isn't in the data, say so or omit it.

Return your response by calling the draft_screening_note tool with these fields:
- why_suitable: 2-3 paragraphs. Specific to this candidate for this role. Reference what they actually said about what they want and why this role fits. Reference their relevant experience. Do not be generic.
- key_strengths: 3-5 bullet points joined with newlines (use "• " prefix). Only strengths directly relevant to this specific job.
- interest_level: One of "Very interested" | "Interested" | "Considering" | "Uncertain" — based on transcripts and notes.
- interest_reasoning: One sentence explaining the interest level read.
- concerns: Honest assessment. Counter-offer risk, other processes, experience gaps. If none, return "None identified".
- suggested_questions: 3-5 questions to ask on the screening call (newline-separated, "• " prefix). Focus on gaps in current knowledge or things that need confirming for this role.
- thin_data: true if there is little/no transcript or call history (so UI can warn recruiter), otherwise false.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { candidate_job_id, candidate_id, job_id } = await req.json();
    if (!candidate_job_id || !candidate_id || !job_id) {
      return new Response(JSON.stringify({ error: "Missing required IDs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [candidateRes, jobRes, tagsRes, notesRes, insightsRes, prevScreeningRes, cjRes] = await Promise.all([
      supabase.from("candidates").select("*").eq("id", candidate_id).maybeSingle(),
      supabase.from("jobs").select("*, clients(company_name, sector, location)").eq("id", job_id).maybeSingle(),
      supabase
        .from("candidate_tags")
        .select("tag_definitions(category, label)")
        .eq("candidate_id", candidate_id),
      supabase
        .from("notes")
        .select("activity_type, content, transcript, created_at")
        .eq("candidate_id", candidate_id)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("call_insights")
        .select("field_name, detected_value, source_quote, tag_category, tag_label")
        .eq("candidate_id", candidate_id)
        .limit(50),
      // previous screening notes from OTHER candidate_jobs (for context only — not to copy)
      supabase
        .from("candidate_jobs")
        .select("id, jobs(title, clients(company_name))")
        .eq("candidate_id", candidate_id)
        .neq("id", candidate_job_id),
      // current candidate_job for AI match metadata if any
      supabase.from("candidate_jobs").select("source").eq("id", candidate_job_id).maybeSingle(),
    ]);

    const candidate = candidateRes.data;
    const job = jobRes.data;
    if (!candidate || !job) {
      return new Response(JSON.stringify({ error: "Candidate or job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tags = (tagsRes.data ?? [])
      .map((t: any) => t.tag_definitions ? `${t.tag_definitions.category}: ${t.tag_definitions.label}` : null)
      .filter(Boolean);

    const notes = (notesRes.data ?? []).map((n: any) =>
      `[${n.activity_type} · ${new Date(n.created_at).toLocaleDateString("en-GB")}] ${n.content || ""}${
        n.transcript ? `\nTranscript excerpt: ${n.transcript.slice(0, 1500)}` : ""
      }`
    );

    const hasCallHistory = (notesRes.data ?? []).some(
      (n: any) => n.activity_type === "Call" || n.transcript,
    );

    const insights = (insightsRes.data ?? [])
      .map((i: any) => {
        if (i.field_name && i.detected_value) {
          return `${i.field_name}: ${i.detected_value}${i.source_quote ? ` ("${i.source_quote}")` : ""}`;
        }
        if (i.tag_label) {
          return `${i.tag_category ?? "tag"}: ${i.tag_label}${i.source_quote ? ` ("${i.source_quote}")` : ""}`;
        }
        return null;
      })
      .filter(Boolean);

    // Previous screening note ids → fetch their summary fields
    const prevCjIds = (prevScreeningRes.data ?? []).map((c: any) => c.id);
    let previousScreeningSummary: string[] = [];
    if (prevCjIds.length > 0) {
      const { data: prevNotes } = await supabase
        .from("screening_notes")
        .select("candidate_job_id, why_suitable, updated_at")
        .in("candidate_job_id", prevCjIds);
      previousScreeningSummary = (prevNotes ?? []).map((p: any) => {
        const cj = prevScreeningRes.data?.find((c: any) => c.id === p.candidate_job_id);
        const role = (cj?.jobs as any)?.title ?? "previous role";
        const company = (cj?.jobs as any)?.clients?.company_name ?? "previous company";
        return `Previously screened for ${role} at ${company} on ${new Date(p.updated_at).toLocaleDateString("en-GB")}`;
      });
    }

    const userPrompt = `CANDIDATE PROFILE:
Name: ${candidate.name}
Current role: ${candidate.job_title ?? "—"} at ${candidate.current_employer ?? "—"}
Location: ${candidate.location ?? "—"}
Current salary: ${candidate.salary_current ? `£${candidate.salary_current}` : "—"}
Salary expectation: ${candidate.salary_expectation ? `£${candidate.salary_expectation}` : "—"}
Notice period: ${(candidate as any).notice_period ?? "—"}
Availability: ${candidate.availability ?? "—"}

TAGS (with supporting quotes where available):
${tags.join("\n") || "(none)"}

CALL TRANSCRIPTS & NOTES (most recent first):
${notes.join("\n\n") || "(no notes recorded yet)"}

EXTRACTED INSIGHTS FROM PAST CALLS:
${insights.join("\n") || "(none)"}

PREVIOUS SCREENING CONTEXT (do NOT copy content — for context only):
${previousScreeningSummary.join("\n") || "(none)"}

JOB DETAILS:
Title: ${job.title}
Client: ${(job.clients as any)?.company_name ?? "—"}
Sector: ${(job.clients as any)?.sector ?? "—"}
Location: ${job.location ?? "—"}
Salary range: £${job.salary_min ?? "?"} – £${job.salary_max ?? "?"}
Type: ${job.job_type ?? "—"}

AI MATCH REASONING:
${cjRes.data?.source === "ai" ? "This candidate was surfaced via AI matching for this role." : "Manually added by recruiter."}

DATA AVAILABILITY:
Has call history: ${hasCallHistory ? "yes" : "no"}

Now generate the screening note draft.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "draft_screening_note",
              description: "Return the structured screening note draft.",
              parameters: {
                type: "object",
                properties: {
                  why_suitable: { type: "string" },
                  key_strengths: { type: "string" },
                  interest_level: {
                    type: "string",
                    enum: ["Very interested", "Interested", "Considering", "Uncertain"],
                  },
                  interest_reasoning: { type: "string" },
                  concerns: { type: "string" },
                  suggested_questions: { type: "string" },
                  thin_data: { type: "boolean" },
                },
                required: [
                  "why_suitable",
                  "key_strengths",
                  "interest_level",
                  "interest_reasoning",
                  "concerns",
                  "suggested_questions",
                  "thin_data",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "draft_screening_note" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted — top up to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI returned no draft" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const draft = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ draft, hasCallHistory }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("draft-screening-note error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
