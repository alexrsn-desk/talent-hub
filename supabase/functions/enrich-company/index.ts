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
  required: ["description", "recent_signals"],
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

    const prompt = `You are a B2B research analyst helping a recruiter understand a target company.

Research the following company and return structured intelligence in JSON matching the provided schema.

Company name: ${client.company_name}
Known website: ${client.website || "(unknown)"}
Sector hint: ${client.sector || "(unknown)"}
Location hint: ${client.location || "(unknown)"}

Use everything you know about this company. Be specific where you have confidence; omit or leave empty fields where you do not.
For "recent_signals" focus on the last ~12 months: funding rounds, expansions/new offices, leadership hires, layoffs/restructures, product launches, awards (e.g. Deloitte Fast 50), acquisitions, IPO. For each, set:
  - signal_type: "growth" (funding, expansion, hiring, awards), "risk" (layoffs, restructure), or "change" (new leadership, M&A, IPO)
  - bd_implication: 1 short sentence explaining why this matters for a recruiter targeting this company.
For "current_job_postings", include known active hiring areas if you have a reasonable basis (departments, role types, approximate counts).
For "tech_stack", list well-known technologies the company uses if any.
Do NOT fabricate dates or amounts you are not confident in — leave the field empty instead.`;

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

    // Upsert
    const upsertPayload = {
      client_id: clientId,
      owner_user_id: client.owner_user_id || user.id,
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
      funding_lead_investors: intel.funding_lead_investors ?? null,
      total_funding: intel.total_funding ?? null,
      last_valuation: intel.last_valuation ?? null,
      revenue_range: intel.revenue_range ?? null,
      tech_stack: intel.tech_stack ?? [],
      recent_signals: intel.recent_signals ?? [],
      current_job_postings: intel.current_job_postings ?? [],
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
