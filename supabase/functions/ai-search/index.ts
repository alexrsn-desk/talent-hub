// Natural-language search across candidates / contacts with TIERED matching.
//
// Returns matches split into two tiers:
//   - "full"    → candidate matches BOTH the role/title requirement AND the
//                 specific preference/detail asked for (evidence in notes,
//                 summary, or free-text). These are the strongest matches.
//   - "partial" → candidate matches the role/title but the specific detail
//                 was NOT found or NOT confirmed in their data. Lower-confidence.
//
// Reuses the same semantic-matching approach (weighted title + free-text
// semantic reading) established for Job Launch matching, so title synonyms,
// adjacent disciplines and note evidence are all considered.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Rec = {
  id: string;
  type: "candidate" | "contact";
  name: string;
  job_title?: string | null;
  company?: string | null;
  sector?: string | null;
  location?: string | null;
  status?: string | null;
  last_contacted?: string | null;
  notes_excerpt?: string | null;
  summary?: string | null;
  note?: string | null;
};

type TieredMatch = {
  id: string;
  reason: string;
  tier: "full" | "partial";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, scope, records } = await req.json() as {
      query: string;
      scope: "candidate" | "contact" | "global";
      records: Rec[];
    };

    if (!query || !Array.isArray(records)) {
      return new Response(JSON.stringify({ error: "query and records required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Cap batch and prep compact per-record payload. Free-text goes into one
    // consolidated "context" field so the model reads notes/summary/note as
    // first-class evidence, not as a passing hint.
    const trimmed = records.slice(0, 400).map((r) => {
      const freetext = [r.summary, r.note, r.notes_excerpt]
        .filter(Boolean)
        .join(" || ")
        .slice(0, 2400);
      return {
        id: r.id,
        title: r.job_title || null,
        company: r.company || null,
        sector: r.sector || null,
        location: r.location || null,
        status: r.status || null,
        last_contacted: r.last_contacted || null,
        context: freetext || null,
      };
    });

    const system = `You are a semantic search engine for a recruitment CRM.

The user gives ONE natural-language query that typically combines TWO kinds of criteria:
  1. STRUCTURED — role / job title / seniority / location / sector (e.g. "Product Marketing Manager", "Senior DevOps engineer in London").
  2. SPECIFIC DETAIL — a preference, statement, or fact that will usually live in NOTES or SUMMARY free-text (e.g. "said they want remote", "mentioned fintech", "actively looking", "open to relocation").

STEP 1 — Silently parse the query into:
  • role_requirement (may be empty)
  • detail_requirements (0..n specific details/preferences the user asked for)

STEP 2 — For every input record, evaluate:
  • role_match: does the candidate's title/company/sector match the role_requirement SEMANTICALLY (synonyms, seniority variants, adjacent disciplines all count). "Product Marketing Manager" ≈ "Sr. Product Marketing Manager" ≈ "Product Marketing Lead" ≈ "Head of Product Marketing".
  • detail_match: for EACH detail_requirement, is there CLEAR evidence in the "context" free-text? Semantic understanding — "wants remote" is confirmed by "mentioned she wants remote", "prefers WFH", "only considering remote roles", etc. Do NOT count a detail as confirmed if the evidence isn't there — absence of mention ≠ confirmation.

STEP 3 — Assign a TIER:
  • "full"    → role_match AND every detail_requirement is CONFIRMED by explicit evidence in context. This is the strongest tier.
  • "partial" → role_match is true, but at least one detail_requirement is NOT confirmed (or context is empty). Include these — the user may still want to review them.
  • otherwise → EXCLUDE the record (do not return it).

If the query has NO detail_requirements (pure role search), every role_match is a "full" match.
If the query has NO role_requirement (pure detail search), treat any detail-confirmed record as "full".

Return ONLY strict JSON:
{
  "parsed": { "role": "<or null>", "details": ["<detail 1>", ...] },
  "matches": [
    { "id": "<record id>", "tier": "full" | "partial", "reason": "<one short sentence, quote note evidence when tier=full, e.g. 'Note says: \\"wants remote\\"'>" }
  ]
}

Order matches within each tier by strength. Do NOT invent ids. Do NOT return records that don't match the role at all.`;

    const userMsg = `QUERY: ${query}
SCOPE: ${scope}
TODAY: ${new Date().toISOString().slice(0, 10)}

RECORDS (${trimmed.length}):
${JSON.stringify(trimmed)}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return new Response(JSON.stringify({ error: "AI gateway error", status: r.status, detail: text }), {
        status: r.status === 429 || r.status === 402 ? r.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await r.json();
    const content: string = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: { matches?: any[]; parsed?: { role?: string | null; details?: string[] } } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    const validIds = new Set(trimmed.map((t) => t.id));
    const raw = Array.isArray(parsed.matches) ? parsed.matches : [];
    const matches: TieredMatch[] = raw
      .filter((m) => m && typeof m.id === "string" && validIds.has(m.id))
      .map((m) => ({
        id: m.id,
        reason: String(m.reason || ""),
        tier: m.tier === "full" ? "full" : "partial",
      }));

    // Sort: full first, then partial, preserving model order within each tier.
    const full = matches.filter((m) => m.tier === "full");
    const partial = matches.filter((m) => m.tier === "partial");

    return new Response(JSON.stringify({
      matches: [...full, ...partial],
      tiers: { full: full.length, partial: partial.length },
      parsed: parsed.parsed || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
