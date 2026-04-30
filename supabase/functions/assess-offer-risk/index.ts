// Assess counter-offer / acceptance / start-date risk on a live offer.
// Vendor-neutral chat completions (works with Gemini, Claude, GPT).
// Also handles "counter_offer_strategy" for retention coaching.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface RiskBody {
  kind: "risk_assessment";
  candidate_first_name: string;
  client_company?: string | null;
  job_title?: string | null;
  salary_offered?: number | null;
  candidate_expectation?: number | null;
  notice_period_weeks?: number | null;
  start_date_proposed?: string | null;
  candidate_notes?: string | null;          // recent notes / transcripts
  motivations?: string | null;              // why they want to leave
  prior_signals?: string | null;            // counter offer / reluctance signals
  current_employer?: string | null;
  time_in_current_role?: string | null;
}

interface CounterBody {
  kind: "counter_offer_strategy";
  candidate_first_name: string;
  client_company?: string | null;
  motivations?: string | null;
  candidate_notes?: string | null;
  original_offer?: number | null;
  current_salary?: number | null;
  counter_amount?: number | null;
  counter_other_changes?: string | null;
}

type Body = RiskBody | CounterBody;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body?.kind) return json({ error: "kind is required" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    let system = "";
    let user = "";
    let wantJson = false;

    if (body.kind === "risk_assessment") {
      const b = body as RiskBody;
      const diff =
        b.salary_offered != null && b.candidate_expectation != null
          ? b.salary_offered - b.candidate_expectation
          : null;
      wantJson = true;
      system = [
        "You are an experienced UK tech recruitment manager assessing risks on a live offer.",
        "Be specific. Reference the actual data supplied — never generic statements.",
        "Risk levels: 'low' | 'medium' | 'high'. Use 'high' only when there is a real, identifiable risk in the data.",
        "Output strict JSON: {",
        "  \"counter_offer_risk\": \"low|medium|high\",",
        "  \"counter_offer_reasons\": string,",
        "  \"acceptance_risk\": \"low|medium|high\",",
        "  \"acceptance_reasons\": string,",
        "  \"start_date_risk\": \"low|medium|high\",",
        "  \"start_date_reasons\": string,",
        "  \"overall_risk\": \"low|medium|high\",",
        "  \"recommended_action\": string",
        "}",
        "Each 'reasons' field: 1-2 short sentences citing specifics. No markdown, no bullets.",
      ].join(" ");
      user = [
        `Candidate: ${b.candidate_first_name}`,
        `Company: ${b.client_company ?? "(unknown)"}`,
        `Role: ${b.job_title ?? "(unknown)"}`,
        `Salary offered: ${b.salary_offered ?? "(unknown)"}`,
        `Candidate expectation: ${b.candidate_expectation ?? "(unknown)"}`,
        `Salary diff (offer - expectation): ${diff ?? "(unknown)"}`,
        `Notice period (weeks): ${b.notice_period_weeks ?? "(unknown)"}`,
        `Proposed start date: ${b.start_date_proposed ?? "(unknown)"}`,
        `Current employer: ${b.current_employer ?? "(unknown)"}`,
        `Time in current role: ${b.time_in_current_role ?? "(unknown)"}`,
        "",
        "--- MOTIVATIONS (why they want to move) ---",
        b.motivations || "(none recorded)",
        "--- PRIOR SIGNALS (counter offer / reluctance signals previously detected) ---",
        b.prior_signals || "(none)",
        "--- RECENT CANDIDATE NOTES & TRANSCRIPTS ---",
        (b.candidate_notes || "(none)").slice(0, 6000),
        "",
        "Return JSON only.",
      ].join("\n");
    } else {
      const b = body as CounterBody;
      system = [
        "You are an elite recruitment closing coach. The candidate has just received (or may receive) a counter offer from their current employer.",
        "Your job: write a SHORT, specific retention strategy the recruiter can use on a call with this candidate.",
        "Tie everything back to the candidate's stated motivations. If their reasons for leaving are non-financial, surface that money does not solve those reasons.",
        "Never patronise. Plain text, 4-7 sentences. No markdown, no headings.",
      ].join(" ");
      user = [
        `Candidate: ${b.candidate_first_name}`,
        `Company they're going to: ${b.client_company ?? "(unknown)"}`,
        `Original offer: ${b.original_offer ?? "(unknown)"}`,
        `Current salary: ${b.current_salary ?? "(unknown)"}`,
        `Counter offer amount: ${b.counter_amount ?? "(unknown)"}`,
        `Other counter changes: ${b.counter_other_changes ?? "(none)"}`,
        "",
        "--- STATED MOTIVATIONS FOR LEAVING ---",
        b.motivations || "(none on file — recruiter to add context)",
        "--- RECENT CANDIDATE NOTES & TRANSCRIPTS ---",
        (b.candidate_notes || "(none)").slice(0, 5000),
      ].join("\n");
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(wantJson ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (aiRes.status === 429) return json({ error: "Rate limited — try again shortly." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted. Add credits in Settings." }, 402);
    if (!aiRes.ok) return json({ error: `AI gateway error: ${await aiRes.text()}` }, 500);

    const data = await aiRes.json();
    const content = data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (wantJson) {
      try {
        return json(JSON.parse(content));
      } catch {
        return json({
          counter_offer_risk: "medium",
          counter_offer_reasons: "AI returned unparsable output — recruiter to assess manually.",
          acceptance_risk: "medium",
          acceptance_reasons: "AI returned unparsable output — recruiter to assess manually.",
          start_date_risk: "medium",
          start_date_reasons: "AI returned unparsable output — recruiter to assess manually.",
          overall_risk: "medium",
          recommended_action: "Speak to the candidate today to confirm their position.",
        });
      }
    }

    return json({ message: content });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});
