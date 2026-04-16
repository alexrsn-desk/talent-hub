import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert recruiter writing a "Why suitable for this role" assessment for a candidate submission.

Take the recruiter's draft notes and ENHANCE them by:
- Pulling in specific, relevant details from the candidate's profile, tags, transcripts, and notes
- Tying their experience directly to the job's requirements and the client's context
- Improving structure (lead with the strongest match, then supporting evidence)
- Keeping the recruiter's voice — do not invent facts
- Being concrete (specific projects, technologies, scale, outcomes) — not generic ("strong communicator", "great culture fit")

Return ONLY the enhanced "Why suitable" paragraph. No headings, no preamble, no markdown. 3-6 sentences.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { candidate_job_id, candidate_id, job_id, why_suitable, key_strengths, concerns } = await req.json();

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

    // Gather context in parallel
    const [candidateRes, jobRes, tagsRes, notesRes] = await Promise.all([
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
        .limit(10),
    ]);

    const candidate = candidateRes.data;
    const job = jobRes.data;
    const tags = (tagsRes.data ?? [])
      .map((t: any) => t.tag_definitions ? `${t.tag_definitions.category}: ${t.tag_definitions.label}` : null)
      .filter(Boolean);
    const notes = (notesRes.data ?? []).map((n: any) =>
      `[${n.activity_type}] ${n.content || ""}${n.transcript ? `\nTranscript: ${n.transcript.slice(0, 1500)}` : ""}`
    );

    const userPrompt = `JOB:
Title: ${job?.title}
Client: ${(job?.clients as any)?.company_name ?? "—"} (${(job?.clients as any)?.sector ?? "—"})
Location: ${job?.location ?? "—"}
Salary: £${job?.salary_min ?? "?"} – £${job?.salary_max ?? "?"}

CANDIDATE:
Name: ${candidate?.name}
Current: ${candidate?.job_title ?? "—"} at ${candidate?.current_employer ?? "—"}
Location: ${candidate?.location ?? "—"}
Salary: £${candidate?.salary_current ?? "?"}

TAGS: ${tags.join(", ") || "(none)"}

RECENT NOTES & TRANSCRIPTS:
${notes.join("\n\n") || "(none)"}

RECRUITER'S DRAFT — "Why suitable":
${why_suitable}

RECRUITER'S DRAFT — "Key strengths":
${key_strengths || "(not provided)"}

RECRUITER'S DRAFT — "Concerns":
${concerns || "(none)"}

Now produce the enhanced "Why suitable" paragraph.`;

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
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const enhanced = aiJson.choices?.[0]?.message?.content?.trim();

    if (!enhanced) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ enhanced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("enhance-screening-note error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
