import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const money = (v: number | null | undefined) =>
  typeof v === "number" ? `£${v.toLocaleString()}` : "Not disclosed";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const candidateId: string | undefined = body?.candidate_id;
    if (!candidateId) return json({ error: "candidate_id is required" }, 400);

    const { data: candidate, error: cErr } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", candidateId)
      .maybeSingle();
    if (cErr) return json({ error: cErr.message }, 400);
    if (!candidate) return json({ error: "Candidate not found" }, 404);

    const { data: profile } = await supabase
      .from("recruiter_profiles")
      .select("client_ready_notes_template")
      .eq("user_id", user.id)
      .maybeSingle();
    const template = (profile as any)?.client_ready_notes_template?.trim() || "";

    const { data: notes } = await supabase
      .from("notes")
      .select("content, activity_type, transcript, created_at")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(12);

    const sourceMaterial = (notes ?? [])
      .map((n: any) => {
        const parts = [`[${n.activity_type || "Note"}] ${n.content || ""}`];
        if (n.transcript) parts.push(`Transcript excerpt: ${String(n.transcript).slice(0, 1500)}`);
        return parts.join("\n");
      })
      .join("\n\n")
      .slice(0, 8000);

    const prompt = `You are helping a recruiter draft a CLIENT-FACING summary of a candidate. This text will be read by the hiring client, so it must be professional, positive but honest, and must never include internal-only material: no salary negotiation detail, no internal assessments or reservations, no "not interested in" notes, no verbatim transcript quotes, no personal/sensitive information.

${template ? `Match this recruiter's own style as closely as possible. Here is an example of how they summarise candidates for clients:\n"""\n${template}\n"""\n` : "Use a clear, professional recruiter tone."}

Write 2-4 sentences (concise). Plain prose, no headings, no markdown, no bullet points unless the style example uses them. Do not invent facts that are not supported by the material below.

CANDIDATE:
- Name: ${candidate.name || [candidate.first_name, candidate.last_name].filter(Boolean).join(" ")}
- Current Role: ${candidate.job_title || "Not specified"}
- Current Employer: ${candidate.current_employer || "Not specified"}
- Location: ${candidate.location || "Not specified"}
- Availability: ${candidate.availability || "Not specified"}
- Salary expectation (context only, do NOT include in the output): ${money(candidate.salary_expectation)}

SOURCE MATERIAL (internal notes and call transcripts — use only as factual background, never quote):
${sourceMaterial || "No notes recorded yet — base the summary on the profile fields above."}

Return only the summary text.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const res = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return json({ error: `AI request failed: ${text.slice(0, 300)}` }, 502);
    }

    const data = await res.json();
    const suggestion = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!suggestion) return json({ error: "No suggestion generated" }, 502);

    return json({ suggestion });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
