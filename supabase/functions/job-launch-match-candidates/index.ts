// Job Launch — match candidates from the user's DB to a job.
// Relevance-first: AI scores every pre-filtered candidate against the role.
// Only candidates scoring >=40 proceed. Relationship status then decides the section.
// Vendor-neutral: uses standard OpenAI-compatible chat completions (works with Gemini and Claude).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

const RELEVANCE_THRESHOLD = 40;
const SPOKEN_STATUSES = new Set(["Active", "Passive", "Contacted", "Screening", "Submitted", "Interviewing", "On Hold"]);
const WIDER_STATUSES = new Set(["LI Connection", "Uncontacted", "New"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const { job_id, ideal_candidate_line, launch_hook, model } = await req.json();
    if (!job_id) return json({ error: "job_id required" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: job } = await sb
      .from("jobs")
      .select("id, title, description, intake_summary, location, salary_min, salary_max, job_type, clients(company_name, sector)")
      .eq("id", job_id)
      .single();

    const { data: candidates = [] } = await sb
      .from("candidates")
      .select("id, name, first_name, status, job_title, current_employer, location, summary, note, salary_expectation, do_not_contact, email, linkedin_url, updated_at")
      .eq("owner_user_id", user.id)
      .limit(2000);

    const eligible = (candidates as any[]).filter(
      (c) => !c.do_not_contact && c.status !== "Do Not Contact" && c.status !== "Not Suitable" && c.status !== "Placed",
    );

    // Keyword pre-filter to keep the AI prompt bounded — broad, not the final gate.
    const haystack = `${job?.title || ""} ${(job as any)?.description || ""} ${(job as any)?.intake_summary || ""} ${ideal_candidate_line || ""} ${launch_hook || ""}`.toLowerCase();
    const tokens = Array.from(new Set(haystack.split(/[^a-z0-9+]+/).filter((t) => t.length > 3))).slice(0, 60);
    function kwScore(c: any): number {
      const blob = `${c.job_title || ""} ${c.current_employer || ""} ${c.summary || ""} ${c.note || ""}`.toLowerCase();
      if (!blob) return 0;
      let s = 0;
      for (const t of tokens) if (blob.includes(t)) s += 1;
      return s;
    }
    const shortlist = eligible
      .map((c) => ({ c, kw: kwScore(c) }))
      .filter((x) => x.kw > 0)
      .sort((a, b) => b.kw - a.kw)
      .slice(0, 80);

    // Fetch most recent note per candidate to detect "spoken to recently" (<=90 days).
    const ids = shortlist.map((x) => x.c.id);
    const lastNoteAt: Record<string, string | null> = {};
    if (ids.length) {
      const { data: notes = [] } = await sb
        .from("notes")
        .select("candidate_id, created_at")
        .in("candidate_id", ids)
        .order("created_at", { ascending: false });
      for (const n of notes as any[]) {
        if (n.candidate_id && !lastNoteAt[n.candidate_id]) lastNoteAt[n.candidate_id] = n.created_at;
      }
    }

    // AI relevance scoring — single call, standard chat completions + JSON object.
    const scores: Record<string, { score: number; reason: string }> = {};
    if (apiKey && shortlist.length) {
      const compact = shortlist.map((x) => ({
        id: x.c.id,
        title: x.c.job_title,
        employer: x.c.current_employer,
        loc: x.c.location,
        salary: x.c.salary_expectation,
        summary: (x.c.summary || x.c.note || "").slice(0, 350),
      }));
      const system = `You score recruitment candidates for RELEVANCE to a specific role.
Score 0-100 by combining five factors:
1) Job title similarity to the role
2) Skills/keywords matching the JD
3) Sector experience match
4) Seniority level appropriateness
5) Salary fit within the role's range (if known)

Be strict. A Marketing Manager scored against a DevOps role must score below 20. A Sales Director scored against an Engineering Manager role must score below 20. Only candidates whose actual background could plausibly do THIS job should score 40 or above.

Return ONLY JSON: {"matches":[{"id":"<id>","score":<0-100>,"reason":"<one short sentence citing a specific relevance point>"}]}. Include EVERY candidate id from the input, even those scoring 0.`;
      const userPrompt = `ROLE: ${job?.title || "?"} at ${(job as any)?.clients?.company_name || "?"}
SECTOR: ${(job as any)?.clients?.sector || "?"}
LOCATION: ${job?.location || "?"}
SALARY RANGE: ${job?.salary_min || "?"} - ${job?.salary_max || "?"}
JD: ${(job as any)?.description?.slice(0, 1800) || "—"}
INTAKE: ${(job as any)?.intake_summary?.slice(0, 800) || "—"}
HOOK: ${launch_hook || "—"}
IDEAL CANDIDATE: ${ideal_candidate_line || "—"}

CANDIDATES (${compact.length}):
${compact.map((c) => `- id:${c.id} | ${c.title || "?"} @ ${c.employer || "?"} | loc:${c.loc || "?"} | salary:${c.salary || "?"} | ${c.summary || "—"}`).join("\n")}`;

      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model || "google/gemini-2.5-flash",
            messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.1,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          const parsed = JSON.parse(d.choices?.[0]?.message?.content || "{}");
          for (const m of parsed.matches || []) {
            const sc = Math.max(0, Math.min(100, Number(m.score) || 0));
            scores[m.id] = { score: sc, reason: String(m.reason || "") };
          }
        }
      } catch { /* AI optional; without it we cannot gate on relevance, so return empty */ }
    }

    // Relevance gate — ONLY >=40 pass. No AI => no relevance data => no matches (safer than false positives).
    const now = Date.now();
    const relevant = shortlist
      .map((x) => {
        const sc = scores[x.c.id];
        return sc ? { c: x.c, score: sc.score, reason: sc.reason } : null;
      })
      .filter((x): x is { c: any; score: number; reason: string } => !!x && x.score >= RELEVANCE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    function shape(x: { c: any; score: number; reason: string }) {
      return {
        id: x.c.id,
        name: x.c.name,
        first_name: x.c.first_name,
        job_title: x.c.job_title,
        current_employer: x.c.current_employer,
        status: x.c.status,
        email: x.c.email,
        linkedin_url: x.c.linkedin_url,
        match_score: x.score,
        match_reason: x.reason || "Relevant to this role",
      };
    }

    // Grouping — relevance already gated. Status + recent touchpoint only decides section.
    const spoken: ReturnType<typeof shape>[] = [];
    const db: ReturnType<typeof shape>[] = [];
    const wider: ReturnType<typeof shape>[] = [];

    for (const x of relevant) {
      const status = x.c.status || "";
      const last = lastNoteAt[x.c.id];
      const days = last ? (now - new Date(last).getTime()) / 86400000 : Infinity;
      const spokenRecently = days <= 90 || (SPOKEN_STATUSES.has(status) && !!last);

      if (spokenRecently) spoken.push(shape(x));
      else if (WIDER_STATUSES.has(status)) wider.push(shape(x));
      else db.push(shape(x));
    }

    // Cap each section
    const cap = <T,>(arr: T[]) => arr.slice(0, 25);
    const spokenOut = cap(spoken);
    const dbOut = cap(db);
    const widerOut = cap(wider);

    return json({
      spoken: spokenOut,
      db: dbOut,
      wider: widerOut,
      // backwards-compatible aliases so existing UI keeps working:
      known: spokenOut,
      li: widerOut,
      job,
      threshold: RELEVANCE_THRESHOLD,
      relevance_source: apiKey ? "ai" : "none",
    });
  } catch (e: any) {
    return json({ error: e?.message || "unknown" }, 500);
  }
});
