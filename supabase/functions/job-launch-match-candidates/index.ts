// Job Launch — match candidates from the user's DB to a job.
// Splits results into "known" (Active/Passive — warm) and "li" (LI Connection — network).
// Uses Lovable AI Gateway in a vendor-neutral way (works with Gemini and Claude models).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

const KNOWN_STATUSES = new Set(["Active", "Passive", "New", "Contacted", "Screening", "Submitted", "Interviewing", "On Hold"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const { job_id, ideal_candidate_line, launch_hook, model } = await req.json();
    if (!job_id) return json({ error: "job_id required" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
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

    // Pull candidate universe for this user
    const { data: candidates = [] } = await sb
      .from("candidates")
      .select("id, name, first_name, status, job_title, current_employer, location, summary, note, salary_expectation, do_not_contact, email, linkedin_url")
      .eq("owner_user_id", user.id)
      .limit(2000);

    const filtered = (candidates as any[]).filter((c) => !c.do_not_contact && c.status !== "Do Not Contact" && c.status !== "Not Suitable" && c.status !== "Placed");

    // Cheap pre-filter: token overlap on title, ideal line, and JD
    const haystack = `${job?.title || ""} ${(job as any)?.description || ""} ${(job as any)?.intake_summary || ""} ${ideal_candidate_line || ""} ${launch_hook || ""}`.toLowerCase();
    const tokens = Array.from(new Set(haystack.split(/[^a-z0-9+]+/).filter((t) => t.length > 3))).slice(0, 60);

    function score(c: any): number {
      const blob = `${c.job_title || ""} ${c.current_employer || ""} ${c.summary || ""} ${c.note || ""}`.toLowerCase();
      if (!blob) return 0;
      let s = 0;
      for (const t of tokens) if (blob.includes(t)) s += 1;
      return s;
    }
    const scored = filtered
      .map((c) => ({ c, s: score(c) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);

    const known = scored.filter((x) => KNOWN_STATUSES.has(x.c.status || "")).slice(0, 25);
    const li = scored.filter((x) => (x.c.status || "") === "LI Connection").slice(0, 25);

    // AI scoring pass (single call, returns scores+reasons per id)
    let reasons: Record<string, { score: number; reason: string }> = {};
    if (apiKey && (known.length + li.length) > 0) {
      const ids = [...known, ...li].map((x) => x.c.id);
      const compact = [...known, ...li].map((x) => ({
        id: x.c.id,
        title: x.c.job_title,
        employer: x.c.current_employer,
        loc: x.c.location,
        summary: (x.c.summary || x.c.note || "").slice(0, 350),
      }));
      const system = `You score recruitment candidates against a role. Return ONLY JSON: {"matches":[{"id":"<id>","score":<0-100>,"reason":"<one short sentence first-name-style hook>"}]}. Score 0-100. Reason references something specific from their profile that maps to the role's hook or ideal candidate line.`;
      const userPrompt = `JOB: ${job?.title} at ${(job as any)?.clients?.company_name || ""}
JD: ${(job as any)?.description?.slice(0, 1500) || "—"}
WHAT MAKES IT INTERESTING: ${launch_hook || "—"}
IDEAL CANDIDATE: ${ideal_candidate_line || "—"}

CANDIDATES (${compact.length}):
${compact.map((c) => `- id:${c.id} | ${c.title || "?"} @ ${c.employer || "?"} | ${c.summary || "—"}`).join("\n")}`;
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model || "google/gemini-2.5-flash",
            messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.3,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          const parsed = JSON.parse(d.choices?.[0]?.message?.content || "{}");
          for (const m of parsed.matches || []) {
            if (ids.includes(m.id)) reasons[m.id] = { score: Number(m.score) || 0, reason: String(m.reason || "") };
          }
        }
      } catch { /* AI optional */ }
    }

    function shape(group: typeof scored) {
      return group.map((x) => ({
        id: x.c.id,
        name: x.c.name,
        first_name: x.c.first_name,
        job_title: x.c.job_title,
        current_employer: x.c.current_employer,
        status: x.c.status,
        email: x.c.email,
        linkedin_url: x.c.linkedin_url,
        match_score: reasons[x.c.id]?.score ?? Math.min(95, 40 + x.s * 6),
        match_reason: reasons[x.c.id]?.reason || "Profile keywords align with this role",
      })).sort((a, b) => b.match_score - a.match_score);
    }

    return json({ known: shape(known), li: shape(li), job });
  } catch (e: any) {
    return json({ error: e?.message || "unknown" }, 500);
  }
});
