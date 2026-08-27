// Shared helpers for the Judgement layer (tool-agnostic).
// Evidence gathering + AI calls for impact extraction, judgement summaries
// and per-role judgement scores.

export const AI_MODEL = "google/gemini-3-flash-preview";
export const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export type ImpactClaim = {
  what_they_did: string;
  claimed_impact: string | null;
  specificity: "high" | "medium" | "low";
};

/** Call the AI gateway with a single forced tool call and return parsed args. */
export async function callTool(
  apiKey: string,
  system: string,
  user: string,
  tool: { name: string; description: string; parameters: Record<string, unknown> },
): Promise<any> {
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{ type: "function", function: tool }],
      tool_choice: { type: "function", function: { name: tool.name } },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(
      res.status === 429
        ? "Rate limit exceeded. Please try again in a moment."
        : res.status === 402
        ? "AI credits exhausted. Please add funds in Settings > Workspace > Usage."
        : "AI request failed",
    );
    err.status = res.status === 429 || res.status === 402 ? res.status : 500;
    console.error("AI error", res.status, text);
    throw err;
  }
  const data = await res.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI did not return structured output");
  return JSON.parse(call.function.arguments);
}

export type Evidence = {
  candidate: any;
  transcripts: any[];
  claims: any[];
  tags: Record<string, string[]>;
  framework: Record<string, string[]>;
  employerIntel: string | null;
  yearsHistory: number | null;
};

/** Gather every judgement input for a candidate. */
export async function gatherEvidence(supabase: any, candidateId: string): Promise<Evidence | null> {
  const { data: candidate } = await supabase
    .from("candidates").select("*").eq("id", candidateId).maybeSingle();
  if (!candidate) return null;

  const [{ data: transcripts }, { data: claims }, { data: tagRows }, { data: fwRows }] = await Promise.all([
    supabase.from("call_transcripts")
      .select("id, source, content, duration_minutes, call_date")
      .eq("candidate_id", candidateId).order("call_date", { ascending: false }).limit(15),
    supabase.from("candidate_impact_claims")
      .select("what_they_did, claimed_impact, specificity")
      .eq("candidate_id", candidateId).order("created_at", { ascending: false }).limit(40),
    supabase.from("candidate_tags")
      .select("tag_definitions(category, label)").eq("candidate_id", candidateId),
    supabase.from("screening_framework_items")
      .select("section, item_key, value").eq("candidate_id", candidateId),
  ]);

  const tags: Record<string, string[]> = {};
  for (const t of (tagRows || []) as any[]) {
    const cat = t.tag_definitions?.category, label = t.tag_definitions?.label;
    if (!cat || !label) continue;
    (tags[cat] ||= []).push(label);
  }
  const framework: Record<string, string[]> = {};
  for (const f of (fwRows || []) as any[]) {
    const v = [f.item_key, f.value].filter(Boolean).join(": ");
    if (v) (framework[f.section || "other"] ||= []).push(v);
  }

  let employerIntel: string | null = null;
  const employer = (candidate.current_employer || "").trim();
  if (employer) {
    const { data: client } = await supabase
      .from("clients").select("id, company_name, sector").ilike("company_name", employer).limit(1).maybeSingle();
    if (client) {
      const { data: intel } = await supabase
        .from("company_intel")
        .select("product_types, who_uses_products, internal_external, current_focus, industry, design_approach")
        .eq("client_id", client.id).maybeSingle();
      const parts = [
        intel?.product_types && `builds ${intel.product_types}`,
        intel?.who_uses_products && `for ${intel.who_uses_products}`,
        intel?.internal_external,
        intel?.design_approach && `design approach: ${intel.design_approach}`,
        intel?.current_focus && `current focus: ${intel.current_focus}`,
        intel?.industry || client.sector,
      ].filter(Boolean);
      if (parts.length) employerIntel = `${client.company_name} — ${parts.join("; ")}`;
    }
  }

  return {
    candidate,
    transcripts: transcripts || [],
    claims: claims || [],
    tags,
    framework,
    employerIntel,
    yearsHistory: null,
  };
}

export function evidenceToPrompt(e: Evidence): string {
  const c = e.candidate;
  const fw = Object.entries(e.framework).map(([k, v]) => `${k}: ${v.join("; ")}`).join("\n  ");
  return `CANDIDATE: ${c.name}
Current title: ${c.job_title || "unknown"} at ${c.current_employer || "unknown employer"}
Location: ${c.location || "?"} | Salary now: ${c.salary_current || "?"} | Availability: ${c.availability || "?"} | Notice: ${c.notice_period || "?"}
CV / profile summary: ${(c.summary || "—").slice(0, 1500)}
Company context for current employer: ${e.employerIntel || "no enrichment on file"}
Motivations: ${(e.tags["motivations"] || []).join(", ") || "—"}
Not interested in / dealbreakers: ${(e.tags["deal_breakers"] || []).join(", ") || "—"}
Sector preference: ${(e.tags["sector_preference"] || []).join(", ") || "—"} | Work preference: ${(e.tags["work_preference"] || []).join(", ") || "—"}
Screening framework:
  ${fw || "—"}
IMPACT CLAIMS (${e.claims.length}):
${e.claims.map((x: any) => `- [${x.specificity}] ${x.what_they_did}${x.claimed_impact ? ` → ${x.claimed_impact}` : ""}`).join("\n") || "- none extracted"}
CALL TRANSCRIPTS (${e.transcripts.length}):
${e.transcripts.map((t: any) => `[${new Date(t.call_date).toISOString().slice(0, 10)} · ${t.source}] ${(t.content || "").slice(0, 2500)}`).join("\n---\n") || "none logged"}`;
}

/** Generate + persist the candidate-level Judgement Summary. */
export async function regenerateSummary(supabase: any, apiKey: string, candidateId: string, userId: string) {
  const e = await gatherEvidence(supabase, candidateId);
  if (!e) throw new Error("Candidate not found");

  const lowSpec = e.claims.length > 0 &&
    e.claims.filter((x: any) => x.specificity === "low").length / e.claims.length >= 0.6;

  const meta = {
    calls: e.transcripts.length,
    claims: e.claims.length,
    employer: e.candidate.current_employer || null,
    has_employer_context: !!e.employerIntel,
  };

  if (e.transcripts.length === 0) {
    const { data } = await supabase.from("candidate_judgements").upsert({
      candidate_id: candidateId,
      user_id: userId,
      summary: null,
      evidence_meta: meta,
      low_specificity_flag: false,
      generated_at: new Date().toISOString(),
    }, { onConflict: "candidate_id" }).select().maybeSingle();
    return data;
  }

  const system = `You are a senior recruiter forming a JUDGEMENT about a candidate, not a summary.
Reason ACROSS the evidence: CV fields, company enrichment for their employers, call transcripts, impact claims, motivations and dealbreakers.
Do not just restate what is in each field. Explain what one piece of information implies given another.
Where evidence is thin, say so plainly rather than inventing confidence.
Never treat vague, unquantified claims as strong evidence — name them as unverified.
Write 3-5 sentences of plain British English prose. No headings, no bullets.`;

  const out = await callTool(apiKey, system, evidenceToPrompt(e), {
    name: "return_judgement_summary",
    description: "Return the candidate judgement summary",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "3-5 sentences of judgement reasoning" },
        evidence_thin: { type: "boolean" },
      },
      required: ["summary"],
    },
  });

  const { data } = await supabase.from("candidate_judgements").upsert({
    candidate_id: candidateId,
    user_id: userId,
    summary: out.summary,
    evidence_meta: { ...meta, evidence_thin: !!out.evidence_thin },
    low_specificity_flag: lowSpec,
    generated_at: new Date().toISOString(),
  }, { onConflict: "candidate_id" }).select().maybeSingle();
  return data;
}
