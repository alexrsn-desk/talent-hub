import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Section = {
  key: string;
  name: string;
  enabled: boolean;
  format: "paragraphs" | "bullets" | "sentence" | "free";
  length: "brief" | "standard" | "detailed";
  required: boolean;
};

const DEFAULT_SECTIONS: Section[] = [
  { key: "why_suitable", name: "Why suitable for this role", enabled: true, format: "paragraphs", length: "standard", required: true },
  { key: "key_strengths", name: "Key strengths for this role", enabled: true, format: "bullets", length: "standard", required: true },
  { key: "interest_level", name: "Interest level assessment", enabled: true, format: "sentence", length: "brief", required: true },
  { key: "concerns", name: "Concerns and risks", enabled: true, format: "paragraphs", length: "brief", required: true },
];

const STYLE_OVERRIDES: Record<string, { tone?: string; length?: string; useTemplate?: boolean }> = {
  my_template: { useTemplate: true },
  formal: { tone: "formal", length: "standard" },
  concise: { tone: "direct", length: "brief" },
  detailed: { tone: "direct", length: "detailed" },
};

function toneInstruction(tone: string) {
  switch (tone) {
    case "formal": return "Write in a formal, professional register. Avoid contractions. Use precise vocabulary.";
    case "warm": return "Write in a warm, conversational tone. Natural, human, enthusiastic where warranted.";
    case "match_examples": return "Match the sentence structure, vocabulary, formality, and rhythm of the recruiter's example submissions exactly. Treat them as style ground truth.";
    case "direct":
    default: return "Write directly and concisely. Say what matters, skip filler.";
  }
}

function povInstruction(pov: string) {
  return pov === "third_person"
    ? "Write in third person (e.g., 'Sarah is a strong fit because...')."
    : "Write in first person as the recruiter (e.g., 'I recommend Sarah because...').";
}

function lengthInstruction(length: string) {
  switch (length) {
    case "brief": return "Keep the overall draft brief — key points only, no padding.";
    case "detailed": return "Write a detailed draft — full picture for the client.";
    case "standard":
    default: return "Standard length — enough to make the case without bloat.";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { candidate_job_id, candidate_id, job_id, style_override } = await req.json();
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

    // Get user id from auth header
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userRes } = await supabase.auth.getUser(token);
      userId = userRes?.user?.id ?? null;
    }

    const [candidateRes, jobRes, tagsRes, notesRes, insightsRes, prevScreeningRes, cjRes, prefsRes] = await Promise.all([
      supabase.from("candidates").select("*").eq("id", candidate_id).maybeSingle(),
      supabase.from("jobs").select("*, clients(company_name, sector, location)").eq("id", job_id).maybeSingle(),
      supabase.from("candidate_tags").select("tag_definitions(category, label)").eq("candidate_id", candidate_id),
      supabase.from("notes").select("activity_type, content, transcript, created_at").eq("candidate_id", candidate_id).order("created_at", { ascending: false }).limit(15),
      supabase.from("call_insights").select("field_name, detected_value, source_quote, tag_category, tag_label").eq("candidate_id", candidate_id).limit(50),
      supabase.from("candidate_jobs").select("id, jobs(title, clients(company_name))").eq("candidate_id", candidate_id).neq("id", candidate_job_id),
      supabase.from("candidate_jobs").select("source").eq("id", candidate_job_id).maybeSingle(),
      userId
        ? supabase.from("screening_preferences").select("*").eq("user_id", userId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const candidate = candidateRes.data;
    const job = jobRes.data;
    if (!candidate || !job) {
      return new Response(JSON.stringify({ error: "Candidate or job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prefs: any = prefsRes?.data ?? null;
    const override = style_override ? STYLE_OVERRIDES[style_override] : null;

    // Resolve active template + tone/pov/length
    let sections: Section[] = DEFAULT_SECTIONS;
    let tone = "direct";
    let pov = "first_person";
    let length = "standard";
    let examples: string[] = [];

    if (prefs) {
      if (Array.isArray(prefs.sections) && prefs.sections.length > 0) {
        sections = (prefs.sections as Section[]).filter((s) => s.enabled);
      }
      tone = prefs.tone || tone;
      pov = prefs.pov || pov;
      length = prefs.length || length;
      examples = Array.isArray(prefs.examples) ? prefs.examples : [];
    }

    // Apply one-off style override (from panel dropdown)
    if (override && !override.useTemplate) {
      if (override.tone) tone = override.tone;
      if (override.length) length = override.length;
      if (style_override !== "my_template") {
        // Non-template overrides: fall back to default sections for predictable output
        sections = DEFAULT_SECTIONS;
      }
    }

    const tags = (tagsRes.data ?? [])
      .map((t: any) => t.tag_definitions ? `${t.tag_definitions.category}: ${t.tag_definitions.label}` : null)
      .filter(Boolean);

    const notes = (notesRes.data ?? []).map((n: any) =>
      `[${n.activity_type} · ${new Date(n.created_at).toLocaleDateString("en-GB")}] ${n.content || ""}${
        n.transcript ? `\nTranscript excerpt: ${n.transcript.slice(0, 1500)}` : ""
      }`
    );

    const hasCallHistory = (notesRes.data ?? []).some((n: any) => n.activity_type === "Call" || n.transcript);

    const insights = (insightsRes.data ?? [])
      .map((i: any) => {
        if (i.field_name && i.detected_value) return `${i.field_name}: ${i.detected_value}${i.source_quote ? ` ("${i.source_quote}")` : ""}`;
        if (i.tag_label) return `${i.tag_category ?? "tag"}: ${i.tag_label}${i.source_quote ? ` ("${i.source_quote}")` : ""}`;
        return null;
      })
      .filter(Boolean);

    const prevCjIds = (prevScreeningRes.data ?? []).map((c: any) => c.id);
    let previousScreeningSummary: string[] = [];
    if (prevCjIds.length > 0) {
      const { data: prevNotes } = await supabase
        .from("screening_notes")
        .select("candidate_job_id, updated_at")
        .in("candidate_job_id", prevCjIds);
      previousScreeningSummary = (prevNotes ?? []).map((p: any) => {
        const cj = prevScreeningRes.data?.find((c: any) => c.id === p.candidate_job_id);
        const role = (cj?.jobs as any)?.title ?? "previous role";
        const company = (cj?.jobs as any)?.clients?.company_name ?? "previous company";
        return `Previously screened for ${role} at ${company} on ${new Date(p.updated_at).toLocaleDateString("en-GB")}`;
      });
    }

    // Build section guidance for prompt
    const sectionGuidance = sections.length > 0
      ? sections.map((s) => `- ${s.name} (format: ${s.format}, length: ${s.length}${s.required ? ", required" : ""})`).join("\n")
      : "- Why suitable\n- Key strengths\n- Interest level\n- Concerns";

    const examplesBlock = examples.length > 0
      ? `\n\nRECRUITER STYLE EXAMPLES (match this voice — sentence structure, vocabulary, formality, how concerns and enthusiasm are framed):\n${examples.map((e, i) => `--- Example ${i + 1} ---\n${e}`).join("\n\n")}`
      : "";

    const systemPrompt = `You are helping a recruiter prepare screening notes for a candidate being considered for a specific role.

Generate structured screening notes that the recruiter can review, edit and use for a client submission.

${povInstruction(pov)}
${toneInstruction(tone)}
${lengthInstruction(length)}

Be specific — use actual details from the candidate history provided.
Be honest — note any concerns or risks.
Do not invent facts. If something isn't in the data, say so or omit it.

The recruiter has configured the following sections for their screening notes:
${sectionGuidance}
${examplesBlock}

Return your response by calling the draft_screening_note tool with these fields:
- why_suitable: Specific to this candidate for this role. Reference what they actually said about what they want and why this role fits. Reference their relevant experience. Do not be generic. Match the requested format and length.
- key_strengths: Relevant strengths only. Use newline-separated bullet points with "• " prefix if the section format is bullets; otherwise prose.
- interest_level: One of "Very interested" | "Interested" | "Considering" | "Uncertain" — based on transcripts and notes.
- interest_reasoning: One sentence explaining the interest level read.
- concerns: Honest assessment. Counter-offer risk, other processes, experience gaps. If none, return "None identified".
- suggested_questions: 3-5 questions to ask on the screening call (newline-separated, "• " prefix). Focus on gaps in current knowledge or things that need confirming for this role.
- thin_data: true if there is little/no transcript or call history, otherwise false.`;

    const userPrompt = `CANDIDATE PROFILE:
Name: ${candidate.name}
Current role: ${candidate.job_title ?? "—"} at ${candidate.current_employer ?? "—"}
Location: ${candidate.location ?? "—"}
Current salary: ${candidate.salary_current ? `£${candidate.salary_current}` : "—"}
Salary expectation: ${candidate.salary_expectation ? `£${candidate.salary_expectation}` : "—"}
Notice period: ${(candidate as any).notice_period ?? "—"}
Availability: ${candidate.availability ?? "—"}

TAGS:
${tags.join("\n") || "(none)"}

CALL TRANSCRIPTS & NOTES (most recent first):
${notes.join("\n\n") || "(no notes recorded yet)"}

EXTRACTED INSIGHTS FROM PAST CALLS:
${insights.join("\n") || "(none)"}

PREVIOUS SCREENING CONTEXT (do NOT copy — context only):
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
          { role: "system", content: systemPrompt },
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
                  interest_level: { type: "string", enum: ["Very interested", "Interested", "Considering", "Uncertain"] },
                  interest_reasoning: { type: "string" },
                  concerns: { type: "string" },
                  suggested_questions: { type: "string" },
                  thin_data: { type: "boolean" },
                },
                required: ["why_suitable", "key_strengths", "interest_level", "interest_reasoning", "concerns", "suggested_questions", "thin_data"],
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
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted — top up to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI returned no draft" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const draft = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ draft, hasCallHistory }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("draft-screening-note error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
