import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Mirror of src/lib/screening-framework.ts — must stay in sync.
const SECTIONS: { id: number; title: string; items: { key: string; label: string }[] }[] = [
  { id: 1, title: "Who they are", items: [
    { key: "current_job_title", label: "Current job title" },
    { key: "current_employer", label: "Current employer" },
    { key: "location_work_pref", label: "Location and work preference" },
    { key: "time_in_role", label: "Time in current role" },
  ]},
  { id: 2, title: "The money", items: [
    { key: "salary_current_total", label: "Current salary (total package)" },
    { key: "bonus_equity", label: "Bonus and equity" },
    { key: "salary_expectation", label: "Salary expectation" },
    { key: "salary_flexible", label: "Is expectation flexible?" },
    { key: "notice_period", label: "Notice period" },
    { key: "available_from", label: "Available from date" },
  ]},
  { id: 3, title: "Why they're looking", items: [
    { key: "driving_search", label: "What is driving the search?" },
    { key: "missing_currently", label: "What is missing currently?" },
    { key: "activity_level", label: "How active are they?" },
    { key: "other_processes", label: "Other processes ongoing?" },
    { key: "counter_offer_risk", label: "Counter offer risk — what would make them stay?" },
  ]},
  { id: 4, title: "What they want", items: [
    { key: "ideal_next_role", label: "Ideal next role description" },
    { key: "company_size_stage", label: "Company size and stage preference" },
    { key: "sector_preferences", label: "Sector preferences" },
    { key: "team_environment", label: "Team environment wanted" },
    { key: "twelve_month_success", label: "12 month success definition" },
    { key: "equity_progression", label: "Equity and progression importance" },
  ]},
  { id: 5, title: "What they won't do", items: [
    { key: "company_dealbreakers", label: "Company types — dealbreakers" },
    { key: "working_pattern_dealbreakers", label: "Working pattern dealbreakers" },
    { key: "sectors_avoid", label: "Sectors to move away from" },
    { key: "salary_floor", label: "Salary floor" },
    { key: "withdrawal_triggers", label: "Any other withdrawal triggers" },
  ]},
  { id: 6, title: "Skills and background", items: [
    { key: "key_skills", label: "Key skills and technologies" },
    { key: "industries", label: "Industries worked in" },
    { key: "team_sizes", label: "Team sizes led or worked in" },
    { key: "biggest_achievement", label: "Biggest current achievement" },
    { key: "strengths", label: "Genuine strengths" },
    { key: "less_of", label: "What they want to do less of" },
  ]},
  { id: 7, title: "Market feedback", items: [
    { key: "approach_volume", label: "Volume of approaches received" },
    { key: "other_offers_benchmark", label: "What other companies are offering (salary benchmarking)" },
    { key: "roles_being_approached", label: "Roles being approached for most" },
    { key: "how_long_looking", label: "How long actively looking" },
    { key: "offers_turned_down", label: "Offers received and turned down" },
    { key: "what_put_off", label: "What put them off those offers" },
  ]},
  { id: 8, title: "Current role insights", items: [
    { key: "culture_current", label: "Culture at current company" },
    { key: "company_performance", label: "Company performance and changes" },
    { key: "team_structure", label: "Team structure" },
    { key: "others_leaving", label: "Others leaving too?" },
    { key: "tools_in_use", label: "Technologies and tools in use" },
    { key: "ai_usage_today", label: "How they use AI currently" },
    { key: "ai_tools_used", label: "What AI tools they use day to day" },
    { key: "ai_changing_role", label: "Is AI changing their role?" },
    { key: "ai_view", label: "Their view on AI in their field" },
  ]},
  { id: 9, title: "Referrals", items: [
    { key: "others_looking", label: "Anyone else who might be looking?" },
    { key: "strong_network", label: "Strong people in their network?" },
  ]},
];

const SECTION_BLOCKS = SECTIONS.map((s) =>
  `Section ${s.id} — ${s.title}\n${s.items.map((i) => `  - ${i.key}: ${i.label}`).join("\n")}`
).join("\n\n");

const SYSTEM_PROMPT = `You are an expert recruitment consultant. Read a candidate call transcript or notes and extract ONLY facts that the candidate explicitly stated.

You must NEVER infer, guess, or fill in plausible-sounding values. If a point was not covered, omit it.

For each fact you find, return:
{ "item_key": "<one of the keys below>", "section": <1-9>, "value": "<concise factual phrase, max ~25 words>" }

Available item keys (use the exact key string):

${SECTION_BLOCKS}

Return ONLY valid JSON of shape:
{ "items": [ { "item_key": "...", "section": 1, "value": "..." } ] }

Do not include item_keys that are not in the list above. Do not return markdown.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { note_id, candidate_id, transcript } = await req.json();
    if (!note_id && !transcript) {
      return new Response(JSON.stringify({ error: "note_id or transcript required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let text = transcript as string | undefined;
    let resolvedCandidateId = candidate_id as string | undefined;
    let ownerUserId: string | undefined;

    if (note_id) {
      const { data: note } = await sb
        .from("notes")
        .select("transcript, content, candidate_id, owner_user_id")
        .eq("id", note_id)
        .maybeSingle();
      if (note) {
        text = [(note.transcript || ""), (note.content || "")].join("\n").trim();
        resolvedCandidateId = resolvedCandidateId || note.candidate_id || undefined;
        ownerUserId = note.owner_user_id || undefined;
      }
    }

    if (!resolvedCandidateId || !text || text.length < 30) {
      return new Response(JSON.stringify({ extracted: 0, skipped: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ownerUserId) {
      const { data: cand } = await sb
        .from("candidates")
        .select("owner_user_id")
        .eq("id", resolvedCandidateId)
        .maybeSingle();
      ownerUserId = cand?.owner_user_id;
    }
    if (!ownerUserId) {
      return new Response(JSON.stringify({ error: "Candidate owner not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only fill items that are currently empty so the recruiter's manual edits stay sacred.
    const { data: existing } = await sb
      .from("screening_framework_items")
      .select("item_key, value, source")
      .eq("candidate_id", resolvedCandidateId);
    const filled = new Set(
      (existing ?? [])
        .filter((r) => r.value && r.value.trim() && r.value !== "✓ covered" && r.source !== "ai")
        .map((r) => r.item_key)
    );

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Transcript / notes:\n${text}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResult = await response.json();
    const raw = aiResult.choices?.[0]?.message?.content || "{}";
    let parsed: { items?: Array<{ item_key: string; section: number; value: string }> } = {};
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    } catch (e) {
      console.error("parse fail", raw);
    }

    const validKeys = new Map(SECTIONS.flatMap((s) => s.items.map((i) => [i.key, s.id])));
    const rows: any[] = [];
    for (const it of parsed.items || []) {
      const section = validKeys.get(it.item_key);
      if (!section) continue;
      if (!it.value || it.value.trim().length === 0) continue;
      if (filled.has(it.item_key)) continue; // respect human-entered data
      rows.push({
        owner_user_id: ownerUserId,
        candidate_id: resolvedCandidateId,
        section,
        item_key: it.item_key,
        value: it.value.trim().slice(0, 500),
        source: "ai",
        source_note_id: note_id ?? null,
        captured_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error: upErr } = await sb
        .from("screening_framework_items")
        .upsert(rows, { onConflict: "candidate_id,item_key" });
      if (upErr) console.error("upsert error", upErr);
    }

    return new Response(JSON.stringify({ extracted: rows.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-screening-framework error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
