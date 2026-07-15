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

    // Fetch screening framework items (skills, motivations, sectors, dealbreakers, etc.)
    const { data: framework = [] } = await supabase
      .from("screening_framework_items")
      .select("candidate_id, section, item_key, value")
      .in("candidate_id", candidateIds);

    // Group tags by candidate AND category
    const tagsByCandidate: Record<string, Record<string, string[]>> = {};
    for (const t of candidateTags as any[]) {
      const cat = t.tag_definitions?.category;
      const label = t.tag_definitions?.label;
      if (!cat || !label) continue;
      if (!tagsByCandidate[t.candidate_id]) tagsByCandidate[t.candidate_id] = {};
      if (!tagsByCandidate[t.candidate_id][cat]) tagsByCandidate[t.candidate_id][cat] = [];
      tagsByCandidate[t.candidate_id][cat].push(label);
    }

    // Group screening framework by candidate and section
    const frameworkByCandidate: Record<string, Record<string, string[]>> = {};
    for (const f of framework as any[]) {
      if (!f.candidate_id) continue;
      const section = f.section || "other";
      if (!frameworkByCandidate[f.candidate_id]) frameworkByCandidate[f.candidate_id] = {};
      if (!frameworkByCandidate[f.candidate_id][section]) frameworkByCandidate[f.candidate_id][section] = [];
      const val = [f.item_key, f.value].filter(Boolean).join(": ");
      if (val) frameworkByCandidate[f.candidate_id][section].push(val);
    }

    const notesByCandidate: Record<string, any[]> = {};
    for (const n of candidateNotes) {
      if (!n.candidate_id) continue;
      if (!notesByCandidate[n.candidate_id]) notesByCandidate[n.candidate_id] = [];
      if (notesByCandidate[n.candidate_id].length < 3) {
        notesByCandidate[n.candidate_id].push(n);
      }
    }

    // Enriched employer context by company name (from company_intel)
    const employerContext: Record<string, string> = {};
    const employers = Array.from(new Set(candidates.map((c: any) => (c.current_employer || "").trim()).filter(Boolean)));
    if (employers.length) {
      const { data: matchedClients = [] } = await supabase
        .from("clients").select("id, company_name").in("company_name", employers);
      const idToName: Record<string, string> = {};
      for (const c of matchedClients as any[]) idToName[c.id] = c.company_name;
      const clientIds = (matchedClients as any[]).map((c: any) => c.id);
      if (clientIds.length) {
        const { data: intels = [] } = await supabase
          .from("company_intel")
          .select("client_id, product_types, who_uses_products, internal_external, current_focus, industry")
          .in("client_id", clientIds);
        for (const i of intels as any[]) {
          const emp = idToName[i.client_id];
          if (!emp) continue;
          const parts = [
            i.product_types && `builds ${i.product_types}`,
            i.who_uses_products && `for ${i.who_uses_products}`,
            i.internal_external,
            i.current_focus && `focus: ${i.current_focus}`,
            i.industry,
          ].filter(Boolean);
          if (parts.length) employerContext[emp.toLowerCase()] = parts.join("; ").slice(0, 400);
        }
      }
    }


    // Build job context string
    const jobTagStr = (jobTags || [])
      .map((t: any) => `${t.tag_definitions?.category}: ${t.tag_definitions?.label}`)
      .join(", ");

    const jobContext = `
JOB TITLE: ${job.title}
Client: ${job.clients?.company_name || "Unknown"} (Sector: ${job.clients?.sector || "Unknown"})
Location: ${job.location || "Not specified"}
Salary: £${job.salary_min || "?"} - £${job.salary_max || "?"}
Type: ${job.job_type}
Tags: ${jobTagStr || "None"}
Job Description: ${(job as any).description || "Not provided"}
Intake Brief / Ideal Candidate: ${(job as any).intake_summary || "Not captured"}
Notes: ${jobNotes.map((n: any) => n.content).join(" | ") || "None"}
`.trim();

    // Build candidates context — include ALL structured fields
    const candidateContexts = candidates.map((c: any) => {
      const tagCats = tagsByCandidate[c.id] || {};
      const motivations = (tagCats["motivations"] || []).join(", ");
      const sectors = (tagCats["sector_preference"] || []).join(", ");
      const workPref = (tagCats["work_preference"] || []).join(", ");
      const seniority = (tagCats["seniority_target"] || []).join(", ");
      const dealBreakers = (tagCats["deal_breakers"] || []).join(", ");

      const fw = frameworkByCandidate[c.id] || {};
      const skills = (fw["skills"] || []).join("; ");
      const fwMotivations = (fw["why_looking"] || fw["motivations"] || []).join("; ");
      const fwWants = (fw["what_they_want"] || []).join("; ");
      const fwMarket = (fw["market_feedback"] || []).join("; ");

      const notes = (notesByCandidate[c.id] || [])
        .map((n: any) => `[${n.activity_type}] ${n.content.substring(0, 200)}`)
        .join(" | ");

      return `ID:${c.id}
  Name: ${c.name}
  Current Job Title: ${c.job_title || "?"}
  Current Employer: ${c.current_employer || "?"}${employerContext[(c.current_employer || "").toLowerCase()] ? `\n  Employer context: ${employerContext[(c.current_employer || "").toLowerCase()]}` : ""}
  Skills (from screening): ${skills || "—"}
  Sector Experience/Preference: ${sectors || "—"}
  Motivations: ${motivations || fwMotivations || "—"}
  What They Want: ${fwWants || "—"}
  Work Preference: ${workPref || "—"} | Seniority: ${seniority || "—"} | Dealbreakers: ${dealBreakers || "—"}
  Market Feedback: ${fwMarket || "—"}
  Summary: ${(c.summary || "").substring(0, 400) || "—"}
  Notes/Calls: ${notes || "—"}
  Location: ${c.location || "?"} | Salary: £${c.salary_current || "?"} | Availability: ${c.availability || "?"} | Status: ${c.status}`;
    }).join("\n---\n");

    const systemPrompt = `You are a recruitment matching AI. Score candidates against a job opening.

READ EVERY FIELD. Weight them as follows:
- HIGHEST: Current Job Title, Skills, Sector Experience (title/skill/sector semantic match to the role)
- MEDIUM: Motivations, What They Want, Notes/Calls, Summary, Current Employer (sector signal)
- LOW: Location, Salary, Availability, Notice period

CRITICAL — SEMANTIC MATCHING, NOT KEYWORD MATCHING.
Understand related disciplines and terms. Examples:
- "Human Centred Designer" is semantically related to: Service Designer, UX Designer, User Researcher, CX Designer, Design Researcher, Interaction Designer, Experience Designer.
- "Social impact / charity / public sector / NGO / social enterprise / third sector / government / community projects" all count as social-impact sector experience.
- "Agency / consultancy background" indicates external client project experience; "in-house" indicates internal projects.
Judge whether a candidate's ACTUAL background could plausibly do THIS role. A Marketing Manager against a DevOps role must score <20. A Sales Director against an Engineering Manager role must score <20.

For each candidate, produce a 0-100 score and 2-3 specific reasons that REFERENCE ACTUAL FIELDS from the candidate profile (e.g. "Current title 'Service Designer' is a close discipline to Human Centred Designer", "Sector experience includes 'charity' — matches social-impact requirement"). Do not invent facts.

Return JSON:
{
  "matches": [
    { "candidate_id": "uuid", "score": 85, "tier": "strong",
      "explanation": "1-2 sentences referencing their title/skills/sectors",
      "matching_tags": ["Title match", "Sector match", "Skills match"],
      "concerns": "Any gaps or missing signals",
      "key_quote": "Relevant quote from notes if any" }
  ],
  "explanation": "Overall honest assessment of the pool for this role"
}

Tier rules:
- "strong": 75-100 (max 5)
- "possible": 50-74 (max 10)
- "consider": 25-49 (max 5)
- Below 25: exclude
Order by score descending. Be honest about gaps.`;

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
