import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch job with client info
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("*, clients(company_name, sector, location)")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch job tags
    const { data: jobTags = [] } = await supabase
      .from("job_tags")
      .select("*, tag_definitions(category, label)")
      .eq("job_id", job_id);

    // Fetch job notes
    const { data: jobNotes = [] } = await supabase
      .from("notes")
      .select("content, activity_type")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(5);

    // Fetch all active candidates (exclude Placed, Not Suitable, Archive, Do Not Contact)
    const { data: candidates = [] } = await supabase
      .from("candidates")
      .select("*")
      .not("status", "in", '("Placed","Not Suitable","Archive","Do Not Contact")')
      .limit(200);

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ matches: [], explanation: "No active candidates in the database." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch candidate tags
    const candidateIds = candidates.map((c: any) => c.id);
    const { data: candidateTags = [] } = await supabase
      .from("candidate_tags")
      .select("candidate_id, tag_definitions(category, label)")
      .in("candidate_id", candidateIds);

    // Fetch recent notes for candidates
    const { data: candidateNotes = [] } = await supabase
      .from("notes")
      .select("candidate_id, content, activity_type, created_at")
      .in("candidate_id", candidateIds)
      .order("created_at", { ascending: false })
      .limit(500);

    // Group tags and notes by candidate
    const tagsByCandidate: Record<string, any[]> = {};
    for (const t of candidateTags) {
      if (!tagsByCandidate[t.candidate_id]) tagsByCandidate[t.candidate_id] = [];
      tagsByCandidate[t.candidate_id].push(t.tag_definitions);
    }

    const notesByCandidate: Record<string, any[]> = {};
    for (const n of candidateNotes) {
      if (!n.candidate_id) continue;
      if (!notesByCandidate[n.candidate_id]) notesByCandidate[n.candidate_id] = [];
      if (notesByCandidate[n.candidate_id].length < 3) {
        notesByCandidate[n.candidate_id].push(n);
      }
    }

    // Build job context string
    const jobTagStr = (jobTags || [])
      .map((t: any) => `${t.tag_definitions?.category}: ${t.tag_definitions?.label}`)
      .join(", ");

    const jobContext = `
JOB: ${job.title}
Client: ${job.clients?.company_name || "Unknown"} (${job.clients?.sector || "Unknown sector"})
Location: ${job.location || "Not specified"}
Salary: £${job.salary_min || "?"} - £${job.salary_max || "?"}
Type: ${job.job_type}
Status: ${job.status}
Tags: ${jobTagStr || "None"}
Job Description: ${(job as any).description || "Not provided"}
Intake Brief Summary: ${(job as any).intake_summary || "Not captured"}
Notes: ${jobNotes.map((n: any) => n.content).join(" | ") || "None"}
`.trim();

    // Build candidates context
    const candidateContexts = candidates.map((c: any) => {
      const tags = (tagsByCandidate[c.id] || [])
        .map((t: any) => `${t?.category}: ${t?.label}`)
        .join(", ");
      const notes = (notesByCandidate[c.id] || [])
        .map((n: any) => `[${n.activity_type}] ${n.content.substring(0, 200)}`)
        .join(" | ");
      return `ID:${c.id} | Name:${c.name} | Title:${c.job_title || "?"} | Employer:${c.current_employer || "?"} | Location:${c.location || "?"} | Salary:£${c.salary_current || "?"} | Status:${c.status} | Availability:${c.availability || "?"} | Updated:${c.updated_at?.substring(0, 10)} | Tags:[${tags}] | Notes:[${notes}]`;
    }).join("\n");

    const systemPrompt = `You are a recruitment matching AI. Score candidates against a job opening.

For each candidate, score 0-100 across:
- Skills match (40% weight)
- Motivation and culture fit (25% weight)
- Practical fit: salary, location, availability (25% weight)
- Risk and readiness (10% weight)

Return a JSON object with this exact structure:
{
  "matches": [
    {
      "candidate_id": "uuid",
      "score": 85,
      "tier": "strong",
      "explanation": "One paragraph why they fit",
      "matching_tags": ["Skills match", "Salary fit", "Available now"],
      "concerns": "Any concerns or what's missing",
      "key_quote": "Relevant quote from their notes if available"
    }
  ],
  "explanation": "Overall analysis paragraph with honest assessment of the candidate pool for this role"
}

Tier rules:
- "strong": score 75-100 (max 5)
- "possible": score 50-74 (max 10)
- "consider": score 25-49 (max 5)
- Below 25: exclude

Only include candidates that genuinely match. Be honest about gaps.
If a strong match hasn't been contacted recently, flag it.
Order by score descending within each tier.`;

    const userPrompt = `Match candidates to this job:

${jobContext}

CANDIDATES:
${candidateContexts}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_matches",
              description: "Return candidate matching results",
              parameters: {
                type: "object",
                properties: {
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        candidate_id: { type: "string" },
                        score: { type: "number" },
                        tier: { type: "string", enum: ["strong", "possible", "consider"] },
                        explanation: { type: "string" },
                        matching_tags: { type: "array", items: { type: "string" } },
                        concerns: { type: "string" },
                        key_quote: { type: "string" },
                      },
                      required: ["candidate_id", "score", "tier", "explanation", "matching_tags"],
                    },
                  },
                  explanation: { type: "string" },
                },
                required: ["matches", "explanation"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_matches" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI matching failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return structured results" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);

    // Enrich matches with candidate data
    const candidateMap = new Map(candidates.map((c: any) => [c.id, c]));
    const enrichedMatches = (result.matches || [])
      .filter((m: any) => candidateMap.has(m.candidate_id))
      .map((m: any) => {
        const c = candidateMap.get(m.candidate_id);
        const lastNote = (notesByCandidate[c.id] || [])[0];
        return {
          ...m,
          candidate_name: c.name,
          job_title: c.job_title,
          current_employer: c.current_employer,
          salary_current: c.salary_current,
          availability: c.availability,
          location: c.location,
          status: c.status,
          updated_at: c.updated_at,
          last_note_date: lastNote?.created_at || null,
        };
      });

    return new Response(
      JSON.stringify({
        matches: enrichedMatches,
        explanation: result.explanation,
        generated_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("match-candidates error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
