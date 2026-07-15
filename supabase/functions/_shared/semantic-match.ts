// Shared semantic candidate matching.
// One implementation used by BOTH job-launch-match-candidates and ask-desky
// so title/skills/sector matching stays consistent.
//
// scoreCandidatesSemantic — AI relevance scoring (Title 40% / Skills 35% / Fit 25%).
// classifyEmployerSectors — LLM classification of employer names → sector match,
// used by ask-desky as a fallback when a candidate has no explicit sector tag.

export type CandidateForMatch = {
  id: string;
  title?: string | null;
  employer?: string | null;
  employer_context?: string | null;
  location?: string | null;
  salary?: number | null;
  skills?: string | null;
  sectors?: string | null;
  motivations?: string | null;
  wants?: string | null;
  summary?: string | null;
};

export type MatchScore = { score: number; reason: string };

export type RoleContext = {
  title?: string | null;
  employer?: string | null;
  sector?: string | null;
  location?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  description?: string | null;
  intake_summary?: string | null;
  hook?: string | null;
  ideal_candidate_line?: string | null;
  similar_titles?: string[];
  key_skills?: string[];
  /** free-form user query — used by ask-desky when there is no job */
  query?: string | null;
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM_PROMPT = `You score recruitment candidates for RELEVANCE to a specific role or query.

SCORE 0-100 as a WEIGHTED COMBINATION of three checks:
  A. TITLE MATCH (40% of score) — Does the candidate's current job title match, or SEMANTICALLY relate to, any of the "SIMILAR JOB TITLES" listed (or the role title / query title)? Exact = full marks. Semantic (e.g. "Service Design Lead" vs "Service Designer", "Product Design Lead" vs "Product Designer") = high. Adjacent discipline (e.g. "UX Designer" vs "Service Designer") = medium. Unrelated = 0.
  B. SKILLS / SECTOR MATCH (35% of score) — How many of the "KEY SKILLS / SECTORS / EXPERIENCE WORDS" appear or are strongly implied in the candidate's skills, sector experience, current employer type, summary, notes or CV content? More matches = higher. Treat employer_context as evidence of sector (e.g. employer_context mentioning "banking app" implies fintech).
  C. IDEAL FIT (25% of score) — Read the candidate holistically against the one-line ideal description or query. Semantic reading, not keyword.

If NO similar titles or key skills were provided, fall back to weighing Title 55% and Ideal-fit 45%.

SEMANTIC MATCHING, not keyword matching. Understand adjacent disciplines and synonyms (e.g. "Human Centred Designer" ≈ Service Designer, UX Designer, Design Researcher, CX Designer; "product designer" ≈ Senior Product Designer, Product Design Lead, UX Designer with product responsibilities; "fintech" ≈ banking, payments, lending, insurtech, crypto, wealth management).

Be strict. A Marketing Manager against a DevOps role must score below 20. Only candidates whose actual background could plausibly do THIS role/query score 40+.

Return ONLY JSON: {"matches":[{"id":"<id>","score":<0-100>,"reason":"<one short sentence citing a SPECIFIC field, e.g. 'Title match: Service Design Lead' or 'Skills: user research, design thinking'>"}]}. Include EVERY candidate id from the input, even those scoring 0.`;

function buildUserPrompt(role: RoleContext, candidates: CandidateForMatch[]) {
  return `ROLE / QUERY: ${role.title || role.query || "?"}${role.employer ? ` at ${role.employer}` : ""}
SECTOR: ${role.sector || "?"}
LOCATION: ${role.location || "?"}
SALARY RANGE: ${role.salary_min || "?"} - ${role.salary_max || "?"}
JD: ${(role.description || "").slice(0, 1800) || "—"}
INTAKE: ${(role.intake_summary || "").slice(0, 800) || "—"}
HOOK: ${role.hook || "—"}
IDEAL CANDIDATE: ${role.ideal_candidate_line || "—"}
SIMILAR JOB TITLES (primary signal): ${role.similar_titles?.length ? role.similar_titles.join(", ") : "—"}
KEY SKILLS / EXPERIENCE WORDS: ${role.key_skills?.length ? role.key_skills.join(", ") : "—"}

CANDIDATES (${candidates.length}):
${candidates.map((c) => `- id:${c.id}
  Title: ${c.title || "?"} @ ${c.employer || "?"}${c.employer_context ? `\n  Employer context: ${c.employer_context}` : ""}
  Skills: ${c.skills || "—"}
  Sectors: ${c.sectors || "—"}
  Motivations: ${c.motivations || "—"}
  Wants: ${c.wants || "—"}
  Summary: ${c.summary || "—"}
  Loc/Salary: ${c.location || "?"} / ${c.salary ?? "?"}`).join("\n")}`;
}

export async function scoreCandidatesSemantic(opts: {
  apiKey: string;
  model?: string;
  role: RoleContext;
  candidates: CandidateForMatch[];
}): Promise<Record<string, MatchScore>> {
  const out: Record<string, MatchScore> = {};
  if (!opts.apiKey || !opts.candidates.length) return out;
  try {
    const r = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model || "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(opts.role, opts.candidates) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });
    if (!r.ok) return out;
    const d = await r.json();
    const parsed = JSON.parse(d.choices?.[0]?.message?.content || "{}");
    for (const m of parsed.matches || []) {
      const sc = Math.max(0, Math.min(100, Number(m.score) || 0));
      out[m.id] = { score: sc, reason: String(m.reason || "") };
    }
  } catch { /* AI optional; caller decides how to handle empty */ }
  return out;
}

/**
 * Classify a list of employer names for whether they belong to a given sector.
 * Uses the LLM's general knowledge (e.g. Monzo → fintech). Only returns
 * `match: true` when confidence is HIGH — used as an inferred-sector fallback,
 * never as ground truth.
 */
export async function classifyEmployerSectors(opts: {
  apiKey: string;
  model?: string;
  employers: string[];
  sector: string;
}): Promise<Record<string, { match: boolean; confidence: "high" | "medium" | "low"; reason: string }>> {
  const out: Record<string, { match: boolean; confidence: "high" | "medium" | "low"; reason: string }> = {};
  const uniq = Array.from(new Set(opts.employers.filter(Boolean))).slice(0, 60);
  if (!opts.apiKey || !uniq.length || !opts.sector) return out;
  try {
    const r = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model || "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              `Classify whether well-known companies operate primarily in a given sector. Use only widely-known public knowledge. If you are not confident, mark confidence as "low" and match false — do NOT guess.\nReturn ONLY JSON: {"results":[{"employer":"...","match":true|false,"confidence":"high"|"medium"|"low","reason":"one short phrase"}]}`,
          },
          {
            role: "user",
            content: `SECTOR: ${opts.sector}\n\nEMPLOYERS:\n${uniq.map((e) => `- ${e}`).join("\n")}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    if (!r.ok) return out;
    const d = await r.json();
    const parsed = JSON.parse(d.choices?.[0]?.message?.content || "{}");
    for (const row of parsed.results || []) {
      const emp = String(row.employer || "").trim();
      if (!emp) continue;
      out[emp.toLowerCase()] = {
        match: Boolean(row.match) && row.confidence === "high",
        confidence: (row.confidence === "high" || row.confidence === "medium") ? row.confidence : "low",
        reason: String(row.reason || ""),
      };
    }
  } catch { /* fallback: no inference */ }
  return out;
}
