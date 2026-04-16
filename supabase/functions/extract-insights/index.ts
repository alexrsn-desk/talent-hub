import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TAG_CATEGORIES: Record<string, string[]> = {
  sector_preference: ["Fintech", "SaaS", "E-commerce", "HealthTech", "EdTech", "PropTech", "DeepTech", "Cybersecurity", "AI/ML", "Gaming", "Agency", "Consulting", "Enterprise Software", "Consumer Tech", "CleanTech", "Open to any"],
  business_model: ["B2B", "B2C", "B2B2C", "Marketplace"],
  company_stage: ["Pre-seed/Seed", "Series A", "Series B", "Series C+", "PE-backed", "Public Company", "Enterprise", "Open to any"],
  work_preference: ["Remote", "Hybrid", "Office-based", "London only", "UK Wide", "Open to relocation", "No relocation"],
  seniority_target: ["Junior", "Mid-level", "Senior", "Lead", "Head of", "Director", "VP", "C-Suite"],
  motivations: ["Salary", "Career progression", "Better tech stack", "Remote/flexibility", "Culture", "Product quality", "Company stage", "Management", "Stability", "Equity"],
  deal_breakers: ["No full remote", "No contract only", "No B2C", "No large corp", "No startup", "No relocation required"],
};

const SYSTEM_PROMPT = `You are an expert recruitment consultant analysing a call transcript or note. Extract structured insights — but ONLY when explicitly stated. Never infer or guess.

Return TWO arrays:

1) FIELDS — candidate data fields explicitly mentioned:
- current_salary (number, GBP) — the candidate's current salary
- salary_expectation (string — number or range like "95000" or "95000-110000")
- notice_period (text e.g. "1 month", "3 months", "immediate")
- availability (text e.g. "immediate", "from 1st June", "in 4 weeks")
- other_processes (text — yes/no with brief detail e.g. "Yes — final stage at Monzo")
- counter_offer_risk (one of: "high", "medium", "low") based on language about loyalty, recent pay rise, employer reaction

For each field include: field_name, value (as string), source_quote (under 20 words exact quote).
Skip any field not explicitly mentioned.

2) TAGS — map only explicitly stated info to predefined categories. Return only HIGH or MEDIUM confidence matches:

Categories and allowed values (must match exactly):
${Object.entries(TAG_CATEGORIES).map(([k, v]) => `- ${k}: ${v.join(", ")}`).join("\n")}

For each tag include: category, value (must be in allowed list), confidence ("high" or "medium"), quote (exact phrase under 15 words).
Maximum 3 tags per category. Do not invent tags outside the predefined lists. Return empty arrays if nothing clearly matches.

Return ONLY valid JSON:
{"fields":[{"field_name":"...","value":"...","source_quote":"..."}],"tags":[{"category":"...","value":"...","confidence":"high|medium","quote":"..."}]}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { note_id } = await req.json();
    if (!note_id) {
      return new Response(JSON.stringify({ error: "note_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: note, error: noteErr } = await sb
      .from("notes").select("*, candidates(id, name)").eq("id", note_id).single();

    if (noteErr || !note) {
      return new Response(JSON.stringify({ error: "Note not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = (note.transcript || "") + "\n" + (note.content || "");
    if (transcript.trim().length < 20) {
      return new Response(JSON.stringify({ fields: 0, tags: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Existing tags on the candidate (so we don't re-suggest)
    let existingTagLabels = new Set<string>();
    if (note.candidate_id) {
      const { data: existing } = await sb
        .from("candidate_tags")
        .select("tag_definitions(label, category)")
        .eq("candidate_id", note.candidate_id);
      existing?.forEach((t: any) => {
        if (t.tag_definitions?.label) existingTagLabels.add(`${t.tag_definitions.category}:${t.tag_definitions.label}`);
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Contact: ${note.candidates?.name || "Unknown"}\n\nTranscript / notes:\n${transcript}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "{}";
    let parsed: { fields?: any[]; tags?: any[] } = {};
    try {
      const m = rawContent.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch (e) { console.error("Parse failed:", rawContent); }

    const fields = parsed.fields || [];
    const tags = parsed.tags || [];

    // Map transcript field_name to candidate column
    const FIELD_MAP: Record<string, string> = {
      current_salary: "salary_current",
      salary_expectation: "salary_expectation",
      notice_period: "availability",  // store under availability
      availability: "availability",
      other_processes: "other_processes",  // virtual — shown but not directly mapped
      counter_offer_risk: "counter_offer_risk",  // virtual
    };

    // Replace any prior pending insights for this note (keep accepted/ignored history)
    await sb.from("call_insights").delete().eq("note_id", note_id).eq("status", "pending");

    const rows: any[] = [];

    for (const f of fields) {
      if (!f.field_name || !f.value) continue;
      rows.push({
        note_id,
        candidate_id: note.candidate_id,
        kind: "field",
        field_name: FIELD_MAP[f.field_name] || f.field_name,
        detected_value: String(f.value),
        source_quote: f.source_quote || null,
        confidence: "high",
        status: "pending",
      });
    }

    // Per-category counts (max 3) and dedupe against existing tags
    const perCategory: Record<string, number> = {};
    for (const t of tags) {
      const allowed = TAG_CATEGORIES[t.category];
      if (!allowed || !allowed.includes(t.value)) continue;
      if (existingTagLabels.has(`${t.category}:${t.value}`)) continue;
      perCategory[t.category] = (perCategory[t.category] || 0) + 1;
      if (perCategory[t.category] > 3) continue;
      rows.push({
        note_id,
        candidate_id: note.candidate_id,
        kind: "tag",
        tag_category: t.category,
        tag_label: t.value,
        confidence: t.confidence === "high" ? "high" : "medium",
        source_quote: t.quote || null,
        status: "pending",
      });
    }

    if (rows.length > 0) {
      const { error: insErr } = await sb.from("call_insights").insert(rows);
      if (insErr) console.error("Insert insights error:", insErr);
    }

    return new Response(JSON.stringify({ fields: fields.length, tags: tags.length, inserted: rows.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
