import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");

async function firecrawlSearch(query: string, limit = 5) {
  if (!FIRECRAWL_KEY) return null;
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit, tbs: "qdr:w" }),
    });
    if (!res.ok) {
      console.error("firecrawl search failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const items = data?.data || data?.web || [];
    return items.slice(0, limit).map((r: any) => ({
      title: r.title || "",
      url: r.url || "",
      description: r.description || r.snippet || "",
    }));
  } catch (e) {
    console.error("firecrawl error", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const niche: string[] = Array.isArray(body.keywords) ? body.keywords.slice(0, 10) : [];
    const sources: string[] = Array.isArray(body.sources) ? body.sources : [
      "industry publications",
      "Reddit recruiting forums",
      "Hacker News hiring threads",
      "general tech news",
    ];
    const desk = body.desk || null;
    const userId: string | null = body.user_id || null;

    // Aggregate Sections 7 (market intel), 8 (current role insights + AI usage), 9 (referrals)
    // from the recruiter's screening framework captures in the last 14 days.
    let screeningAgg: any = null;
    if (userId) {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await sb
        .from("screening_framework_items")
        .select("section, item_key, value, captured_at, candidate_id, candidates(name, current_employer)")
        .eq("owner_user_id", userId)
        .in("section", [7, 8, 9])
        .gte("captured_at", since)
        .not("value", "is", null)
        .neq("value", "✓ covered")
        .order("captured_at", { ascending: false })
        .limit(200);
      if (rows && rows.length > 0) {
        const marketFeedback: any[] = [];
        const companyInsights: Record<string, any[]> = {};
        const aiUsage: any[] = [];
        const referrals: any[] = [];
        const AI_KEYS = new Set(["ai_usage_today", "ai_tools_used", "ai_changing_role", "ai_view"]);
        for (const r of rows as any[]) {
          const entry = {
            value: r.value,
            candidate: r.candidates?.name || null,
            employer: r.candidates?.current_employer || null,
            item: r.item_key,
            date: r.captured_at,
          };
          if (r.section === 7) marketFeedback.push(entry);
          else if (r.section === 9) referrals.push(entry);
          else if (r.section === 8) {
            if (AI_KEYS.has(r.item_key)) aiUsage.push(entry);
            else {
              const company = entry.employer || "Unknown company";
              (companyInsights[company] ||= []).push(entry);
            }
          }
        }
        screeningAgg = { marketFeedback, companyInsights, aiUsage, referrals };
      }
    }

    const nicheStr = niche.length ? niche.join(", ") : "tech and digital recruitment";

    // Try to ground with Firecrawl web search if available
    let searchResults: any[] = [];
    if (FIRECRAWL_KEY) {
      const queries = [
        `${nicheStr} hiring trends this week`,
        `${nicheStr} funding rounds OR layoffs this week`,
        `site:reddit.com recruiting ${nicheStr}`,
      ];
      for (const q of queries) {
        const r = await firecrawlSearch(q, 4);
        if (r) searchResults.push({ query: q, results: r });
      }
    }

    const systemPrompt = `You are a market intelligence analyst for a recruitment consultant. Produce a concise weekly market brief for their niche.

RULES:
- If you were given web search results, ground your output in them and prefer their facts.
- If no search results were provided, draw on your general knowledge of the sector, and never invent specific numbers, funding amounts, or named companies you are not confident about. Prefer cautious framing.
- Output STRICT JSON only. No prose. No markdown fences.

Return EXACTLY this shape:
{
  "trends": [ { "headline": "string", "implication": "one-line 'what this means for you'" } ],
  "sectorNews": [ { "summary": "2-3 sentences", "source": "publication or platform" } ],
  "candidateMarket": [ "one-line theme" ],
  "companiesToWatch": [ { "company": "string", "event": "funding|hiring|layoffs|leadership", "detail": "string", "bdRelevance": "one line" } ],
  "contentIdeas": [ { "headline": "string", "yourAngle": "how the recruiter's own data combines with this market context", "format": "LinkedIn post"|"short article"|"poll" } ]
}

Length guidance: trends 2-3, sectorNews 1-2, candidateMarket 2-3, companiesToWatch up to 4, contentIdeas 2-3.`;

    const userPrompt = `Recruiter niche / keywords to focus on: ${nicheStr}
Sources to consider: ${sources.join(", ")}

${searchResults.length > 0 ? `## Live web search results (last 7 days)\n${JSON.stringify(searchResults, null, 2)}` : `## No live web search available — use your general sector knowledge with appropriate caution.`}

${desk ? `## The recruiter's own desk intel this week (to inform contentIdeas only — DO NOT copy verbatim, do not include real names)\n${JSON.stringify(desk, null, 2)}` : ""}

${screeningAgg ? `## Proprietary intel captured by the recruiter on candidate calls (last 14 days, from the Screening Framework — Sections 7/8/9). Use this to ground 'candidateMarket', 'companiesToWatch', and 'contentIdeas'. Anonymise names in output. Treat AI usage entries as a standing theme.\n${JSON.stringify(screeningAgg, null, 2)}` : ""}

Generate the market intel brief now.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2500,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      throw new Error("Market intel generation failed");
    }

    const aiData = await aiRes.json();
    let content: string = aiData.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let market: any;
    try {
      market = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      market = m ? JSON.parse(m[0]) : { trends: [], sectorNews: [], candidateMarket: [], companiesToWatch: [], contentIdeas: [] };
    }

    market.meta = {
      grounded: searchResults.length > 0,
      searchProvider: FIRECRAWL_KEY ? "firecrawl" : "none",
      generatedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify({ market }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("weekly-market-intel error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
