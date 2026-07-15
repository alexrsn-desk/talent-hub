// Job Launch — match candidates from the user's DB to a job.
// Relevance-first: AI scores every pre-filtered candidate against the role.
// Only candidates scoring >=40 proceed. Relationship status then decides the section.
// Vendor-neutral: uses standard OpenAI-compatible chat completions (works with Gemini and Claude).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { scoreCandidatesSemantic, type CandidateForMatch } from "../_shared/semantic-match.ts";

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
    const body = await req.json();
    const { job_id, ideal_candidate_line, launch_hook, model } = body;
    const similar_titles: string[] = Array.isArray(body.similar_titles) ? body.similar_titles.filter(Boolean) : [];
    const key_skills: string[] = Array.isArray(body.key_skills) ? body.key_skills.filter(Boolean) : [];
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
      .select("id, title, description, intake_summary, location, salary_min, salary_max, job_type, similar_titles, key_skills, clients(company_name, sector)")
      .eq("id", job_id)
      .single();

    // Fall back to job-persisted signals when the caller didn't pass them.
    const effTitles: string[] = similar_titles.length ? similar_titles : ((job as any)?.similar_titles || []);
    const effSkills: string[] = key_skills.length ? key_skills : ((job as any)?.key_skills || []);

    const { data: candidates = [] } = await sb
      .from("candidates")
      .select("id, name, first_name, status, job_title, current_employer, location, summary, note, salary_expectation, do_not_contact, email, linkedin_url, updated_at")
      .eq("owner_user_id", user.id)
      .limit(2000);

    const eligible = (candidates as any[]).filter(
      (c) => !c.do_not_contact && c.status !== "Do Not Contact" && c.status !== "Not Suitable" && c.status !== "Placed",
    );
    console.log(`[job-launch-match] user=${user.id} fetched=${candidates.length} eligible=${eligible.length}`);

    // Keyword pre-filter to keep the AI prompt bounded — broad, not the final gate.
    const haystack = `${job?.title || ""} ${(job as any)?.description || ""} ${(job as any)?.intake_summary || ""} ${ideal_candidate_line || ""} ${launch_hook || ""} ${effTitles.join(" ")} ${effSkills.join(" ")}`.toLowerCase();
    const tokens = Array.from(new Set(haystack.split(/[^a-z0-9+]+/).filter((t) => t.length > 3))).slice(0, 80);
    function kwScore(c: any): number {
      const blob = `${c.job_title || ""} ${c.current_employer || ""} ${c.summary || ""} ${c.note || ""}`.toLowerCase();
      if (!blob) return 0;
      let s = 0;
      for (const t of tokens) if (blob.includes(t)) s += 1;
      return s;
    }
    // Keep candidates with any keyword hit, then top up with recently-updated ones that have a job title.
    // AI does the semantic gate; the pre-filter must not exclude semantically-related titles.
    const scored = eligible.map((c) => ({ c, kw: kwScore(c) }));
    const hits = scored.filter((x) => x.kw > 0).sort((a, b) => b.kw - a.kw);
    const rest = scored
      .filter((x) => x.kw === 0 && (x.c.job_title || x.c.summary || x.c.note))
      .sort((a, b) => new Date(b.c.updated_at || 0).getTime() - new Date(a.c.updated_at || 0).getTime());
    const shortlist = [...hits, ...rest].slice(0, 80);

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

    // Fetch structured profile data: tags-by-category and screening framework items.
    const tagsByCand: Record<string, Record<string, string[]>> = {};
    const fwByCand: Record<string, Record<string, string[]>> = {};
    if (ids.length) {
      const { data: cTags = [] } = await sb
        .from("candidate_tags")
        .select("candidate_id, tag_definitions(category, label)")
        .in("candidate_id", ids);
      for (const t of cTags as any[]) {
        const cat = t.tag_definitions?.category;
        const label = t.tag_definitions?.label;
        if (!cat || !label) continue;
        (tagsByCand[t.candidate_id] ||= {});
        (tagsByCand[t.candidate_id][cat] ||= []).push(label);
      }
      const { data: fw = [] } = await sb
        .from("screening_framework_items")
        .select("candidate_id, section, item_key, value")
        .in("candidate_id", ids);
      for (const f of fw as any[]) {
        if (!f.candidate_id) continue;
        (fwByCand[f.candidate_id] ||= {});
        (fwByCand[f.candidate_id][f.section || "other"] ||= []).push(
          [f.item_key, f.value].filter(Boolean).join(": "),
        );
      }
    }

    // Fetch enriched company context for each unique employer name (case-insensitive match to clients.company_name).
    const employerContext: Record<string, string> = {};
    const employers = Array.from(new Set(shortlist.map((x) => (x.c.current_employer || "").trim()).filter(Boolean)));
    if (employers.length) {
      const { data: matchedClients = [] } = await sb
        .from("clients")
        .select("id, company_name")
        .in("company_name", employers);
      const clientIds = (matchedClients as any[]).map((c) => c.id);
      const idToName: Record<string, string> = {};
      for (const c of matchedClients as any[]) idToName[c.id] = c.company_name;
      if (clientIds.length) {
        const { data: intels = [] } = await sb
          .from("company_intel")
          .select("client_id, product_types, who_uses_products, internal_external, current_focus, industry")
          .in("client_id", clientIds);
        for (const i of intels as any[]) {
          const emp = idToName[i.client_id];
          if (!emp) continue;
          const parts = [
            i.product_types && `builds ${i.product_types}`,
            i.who_uses_products && `for ${i.who_uses_products}`,
            i.internal_external,
            i.current_focus && `focus: ${i.current_focus}`,
            i.industry,
          ].filter(Boolean);
          if (parts.length) employerContext[emp.toLowerCase()] = parts.join("; ").slice(0, 400);
        }
      }
    }


    // AI relevance scoring — shared with ask-desky via _shared/semantic-match.ts
    let scores: Record<string, { score: number; reason: string }> = {};
    if (apiKey && shortlist.length) {
      const compact: CandidateForMatch[] = shortlist.map((x) => {
        const tc = tagsByCand[x.c.id] || {};
        const fc = fwByCand[x.c.id] || {};
        const empKey = (x.c.current_employer || "").toLowerCase();
        return {
          id: x.c.id,
          title: x.c.job_title,
          employer: x.c.current_employer,
          employer_context: employerContext[empKey] || "",
          location: x.c.location,
          salary: x.c.salary_expectation,
          skills: (fc["skills"] || []).join("; ").slice(0, 300),
          sectors: (tc["sector_preference"] || []).join(", "),
          motivations: (tc["motivations"] || []).join(", ") || (fc["why_looking"] || []).join("; ").slice(0, 200),
          wants: (fc["what_they_want"] || []).join("; ").slice(0, 200),
          summary: (x.c.summary || x.c.note || "").slice(0, 300),
        };
      });

      scores = await scoreCandidatesSemantic({
        apiKey,
        model,
        role: {
          title: job?.title,
          employer: (job as any)?.clients?.company_name,
          sector: (job as any)?.clients?.sector,
          location: job?.location,
          salary_min: job?.salary_min,
          salary_max: job?.salary_max,
          description: (job as any)?.description,
          intake_summary: (job as any)?.intake_summary,
          hook: launch_hook,
          ideal_candidate_line,
          similar_titles: effTitles,
          key_skills: effSkills,
        },
        candidates: compact,
      });
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
    console.log(`[job-launch-match] shortlisted=${shortlist.length} scored=${Object.keys(scores).length} passed40=${relevant.length} spoken=${spokenOut.length} db=${dbOut.length} wider=${widerOut.length}`);

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
