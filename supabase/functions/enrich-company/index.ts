import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COST_PENCE = 4; // ~£0.04 per enrichment estimate

const intelSchema = {
  type: "object",
  properties: {
    official_name: { type: "string" },
    website: { type: "string" },
    linkedin_url: { type: "string" },
    headquarters: { type: "string" },
    year_founded: { type: "integer" },
    employee_count: { type: "string", description: "e.g. '51-200', '1000+'" },
    industry: { type: "string" },
    description: { type: "string", description: "2-3 sentences" },
    funding_stage: { type: "string", description: "Seed/Series A/B/C/D+/Public/Bootstrapped/Unknown" },
    funding_amount: { type: "string" },
    funding_date: { type: "string" },
    funding_lead_investors: { type: "array", items: { type: "string" } },
    total_funding: { type: "string" },
    last_valuation: { type: "string" },
    revenue_range: { type: "string" },
    tech_stack: { type: "array", items: { type: "string" } },
    product_types: {
      type: "string",
      description: "What type of products/services this company builds. Be specific — e.g. 'Patient-facing NHS mobile apps, clinical staff tools, NHS data platforms' NOT just 'healthcare software'.",
    },
    who_uses_products: {
      type: "string",
      description: "Who the end users are — e.g. 'NHS trusts, ICBs, GP practices, patients' or 'Enterprise HR teams and their employees'.",
    },
    internal_external: {
      type: "string",
      description: "Whether products are internal tools, external/customer-facing products, or both. One short sentence.",
    },
    current_focus: {
      type: "string",
      description: "What the company appears to be currently working on or prioritising in 2024/2025. One or two sentences.",
    },
    design_approach: {
      type: "string",
      description: "Design methodology if publicly known — e.g. 'GDS standards, human-centred design, agile delivery'. Leave empty if unknown.",
    },
    tech_context: {
      type: "string",
      description: "Technology context if publicly known — e.g. 'Cloud-native, React, NHS interoperability standards'. Leave empty if unknown.",
    },
    enrichment_confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "high = multiple consistent sources, well-documented; medium = some info, possibly incomplete; low = limited public information.",
    },
    recent_signals: {
      type: "array",
      description: "Significant company events from the last ~12 months",
      items: {
        type: "object",
        properties: {
          headline: { type: "string" },
          date: { type: "string" },
          category: {
            type: "string",
            enum: ["funding", "expansion", "leadership", "layoffs", "product", "award", "acquisition", "ipo", "other"],
          },
          signal_type: { type: "string", enum: ["growth", "risk", "change"] },
          bd_implication: { type: "string" },
          source_url: { type: "string" },
        },
        required: ["headline", "category", "signal_type", "bd_implication"],
      },
    },
    current_job_postings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          department: { type: "string" },
          location: { type: "string" },
          count: { type: "integer" },
        },
        required: ["title"],
      },
    },
  },
  required: ["description", "product_types", "who_uses_products", "enrichment_confidence", "recent_signals"],
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const clientId = body.client_id as string;
    if (!clientId) return json({ error: "client_id required" }, 400);

    // Load client
    const { data: client, error: cErr } = await supabase
      .from("clients").select("id, company_name, website, sector, location, owner_user_id")
      .eq("id", clientId).maybeSingle();
    if (cErr || !client) return json({ error: "Client not found" }, 404);

    // Budget check
    const { data: profile } = await supabase
      .from("recruiter_profiles").select("enrichment_budget_pence").eq("user_id", user.id).maybeSingle();
    const budget = profile?.enrichment_budget_pence ?? 1000;

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1); startOfMonth.setUTCHours(0, 0, 0, 0);
    const { data: usage } = await supabase
      .from("enrichment_usage").select("cost_pence")
      .eq("user_id", user.id).gte("created_at", startOfMonth.toISOString());
    const spent = (usage ?? []).reduce((sum, u: any) => sum + (u.cost_pence || 0), 0);
    if (spent + COST_PENCE > budget) {
      return json({
        error: "budget_exceeded",
        message: `Monthly enrichment budget reached (£${(budget / 100).toFixed(2)}). Increase it in Settings.`,
        spent_pence: spent, budget_pence: budget,
      }, 402);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const prompt = `You are a B2B research analyst helping a recruiter understand a target company at a product/work level — deeper than what generic training data covers.

Research the following company and return structured intelligence in JSON matching the provided schema.

Company name: ${client.company_name}
Known website: ${client.website || "(unknown)"}
Sector hint: ${client.sector || "(unknown)"}
Location hint: ${client.location || "(unknown)"}

Prioritise product and work context — this is the most valuable output:
  - product_types: What specifically do they build? Be concrete. e.g. "Patient-facing NHS mobile apps, clinical staff tools" NOT "healthcare software".
  - who_uses_products: Who actually uses these products? e.g. "NHS trusts, ICBs, GP practices, patients".
  - internal_external: Internal tools, external products, or both?
  - current_focus: What are they visibly working on in 2024/2025 based on case studies, news, blog posts?
  - design_approach: Design methodology if public — GDS, HCD, agile, etc. Empty if unknown.
  - tech_context: Tech stack context if public. Empty if unknown.

Set enrichment_confidence honestly:
  - "high": multiple consistent sources, well-documented public company
  - "medium": some information found, may be incomplete
  - "low": limited public information, small/obscure company — treat as approximate

For "recent_signals" focus on the last ~12 months: funding, expansions, leadership hires, layoffs, product launches, awards, acquisitions, IPO. Set signal_type ("growth"/"risk"/"change") and bd_implication (1 short sentence).
For "current_job_postings", include known active hiring areas if you have a reasonable basis.
For "tech_stack", list well-known technologies the company uses.
Do NOT fabricate specific dates, amounts, or product names you are not confident in — leave the field empty and lower confidence instead.`;


    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: "You return only valid JSON matching the requested schema." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "store_company_intel",
            description: "Store structured company intelligence",
            parameters: intelSchema,
          },
        }],
        tool_choice: { type: "function", function: { name: "store_company_intel" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429) return json({ error: "rate_limited", message: "AI rate limit reached, try again shortly." }, 429);
      if (aiRes.status === 402) return json({ error: "ai_credits", message: "AI credits exhausted." }, 402);
      return json({ error: "ai_error", detail: txt }, 500);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let intel: any = {};
    try {
      intel = JSON.parse(toolCall?.function?.arguments || "{}");
    } catch {
      intel = {};
    }

    // Load existing intel to preserve confirmed/manual fields
    const { data: existing } = await supabase
      .from("company_intel").select("*").eq("client_id", clientId).maybeSingle();

    const TRACKED = [
      "official_name","website","linkedin_url","headquarters","year_founded",
      "employee_count","industry","description","funding_stage","funding_amount",
      "funding_date","total_funding","last_valuation","revenue_range",
    ];
    const existingStatus = (existing?.field_status as Record<string, string> | null) || {};
    const newStatus: Record<string, string> = { ...existingStatus };

    const merged: any = {
      official_name: intel.official_name ?? null,
      website: intel.website ?? client.website ?? null,
      linkedin_url: intel.linkedin_url ?? null,
      headquarters: intel.headquarters ?? null,
      year_founded: intel.year_founded ?? null,
      employee_count: intel.employee_count ?? null,
      industry: intel.industry ?? null,
      description: intel.description ?? null,
      funding_stage: intel.funding_stage ?? null,
      funding_amount: intel.funding_amount ?? null,
      funding_date: intel.funding_date ?? null,
      total_funding: intel.total_funding ?? null,
      last_valuation: intel.last_valuation ?? null,
      revenue_range: intel.revenue_range ?? null,
    };

    for (const f of TRACKED) {
      const prevStatus = existingStatus[f];
      if (prevStatus === "manual" || prevStatus === "confirmed") {
        // Keep existing user-verified value & status
        merged[f] = (existing as any)?.[f] ?? merged[f];
      } else if (merged[f] !== null && merged[f] !== undefined && merged[f] !== "") {
        newStatus[f] = "unconfirmed";
      } else {
        delete newStatus[f];
      }
    }

    const upsertPayload = {
      client_id: clientId,
      owner_user_id: client.owner_user_id || user.id,
      ...merged,
      funding_lead_investors: intel.funding_lead_investors ?? null,
      tech_stack: intel.tech_stack ?? [],
      recent_signals: intel.recent_signals ?? [],
      current_job_postings: intel.current_job_postings ?? [],
      product_types: intel.product_types ?? null,
      who_uses_products: intel.who_uses_products ?? null,
      internal_external: intel.internal_external ?? null,
      current_focus: intel.current_focus ?? null,
      design_approach: intel.design_approach ?? null,
      tech_context: intel.tech_context ?? null,
      enrichment_confidence: intel.enrichment_confidence ?? null,
      field_status: newStatus,
      enrichment_source: "lovable-ai/gemini-2.5-pro",
      last_enriched_at: new Date().toISOString(),
    };


    const { data: saved, error: sErr } = await supabase
      .from("company_intel")
      .upsert(upsertPayload, { onConflict: "client_id" })
      .select()
      .single();
    if (sErr) return json({ error: "save_failed", detail: sErr.message }, 500);

    await supabase.from("enrichment_usage").insert({
      user_id: user.id, client_id: clientId, cost_pence: COST_PENCE,
    });

    return json({ ok: true, intel: saved, spent_pence: spent + COST_PENCE, budget_pence: budget });
  } catch (e: any) {
    return json({ error: "server_error", message: e?.message || String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
