// Ask Desky — conversational AI over the recruiter's desk data.
// Uses standard OpenAI-compatible chat completions + tool calling
// (works with Gemini and Claude via Lovable AI Gateway).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  scoreCandidatesSemantic,
  classifyEmployerSectors,
  type CandidateForMatch,
} from "../_shared/semantic-match.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";
const MAX_STEPS = 6;

const SYSTEM_PROMPT = `You are "Ask Desky", a data assistant embedded in a recruitment CRM.
The recruiter can ask you anything about their desk. You have tools to query their live database.

RULES:
- For ANY question about who matches a role, job title, sector, or skill (e.g. "product designers with fintech experience", "senior React engineers in London"), use the tool "search_candidates_semantic". It does proper semantic title + sector + skills matching and returns relevance-scored results. Do NOT use query_candidates for these — query_candidates is only for blunt attribute filters (status, salary bands, last-contacted dates).
- Use tools to answer any question about candidates, jobs, clients, contacts, notes, placements, or activity. Never invent data.
- When returning lists of candidates, ALWAYS include the ids in a fenced JSON block at the end. For semantic search results, include the "inferred" and "inferred_reason" fields when present so the UI can flag inferred sector matches and offer a confirm action:
  \`\`\`json
  {"kind":"candidate_list","items":[{"id":"...","name":"...","title":"...","employer":"...","location":"...","salary":65000,"match_score":78,"match_reason":"...","inferred":true,"inferred_reason":"Monzo — inferred fintech","inferred_sector":"fintech","inferred_client_id":"..."}]}
  \`\`\`
  The UI renders these as compact cards with a Confirm action on inferred rows.
- For salary surveys, market reports, or content pieces: use tools to gather data first, then produce clean markdown with clear section headers, bullet points, and numbers. Include the recruiter's name at the top when generating a report. End with the "indicative only" disclaimer.
- Do NOT include GDPR-deleted candidates or contacts marked Do Not Contact in outreach suggestions.
- Remember context within the conversation — follow-ups like "which of those are in London" should filter the previous result.
- Keep responses concise. Recruiters skim.
- Use markdown for readability (bold, bullets, small headers).

FAILURE HANDLING:
- If a query genuinely cannot be answered by any available field (e.g. call transcripts, sentiment, video interview content — things not stored), DO NOT respond with a flat "I can only search by X". Instead:
  1. State plainly what is not searchable yet.
  2. Offer the closest thing you CAN answer (e.g. "I can search notes for the word 'excited' — want me to try that instead?").
  3. Suggest one alternative query the user could send.`;

// ---- tool definitions (OpenAI-compatible JSON schema) ----
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_candidates_semantic",
      description:
        "PREFERRED tool for candidate discovery queries involving job titles, sectors, skills, or seniority (e.g. 'product designers with fintech experience', 'senior React engineers in London'). Does semantic title + sector + skills matching (shared with Job Launch). Optionally uses company-based sector inference as a fallback when a candidate has no explicit sector tag but their employer is a well-known company in the queried sector.",
      parameters: {
        type: "object",
        properties: {
          job_title: {
            type: "string",
            description: "Target role/title, e.g. 'Product Designer'. Semantic — matches Senior Product Designer, Product Design Lead, adjacent titles.",
          },
          sectors: {
            type: "array",
            items: { type: "string" },
            description: "Sectors the candidate should have experience in OR be interested in, e.g. ['fintech'].",
          },
          seniority: {
            type: "string",
            description: "e.g. junior, mid, senior, lead, principal, head of, director.",
          },
          skills: {
            type: "array",
            items: { type: "string" },
            description: "Key skills or tools, e.g. ['Figma','user research'].",
          },
          not_interested_in: {
            type: "array",
            items: { type: "string" },
            description: "Sectors or attributes to EXCLUDE, e.g. ['gambling'].",
          },
          location_contains: { type: "string" },
          salary_min: { type: "number" },
          salary_max: { type: "number" },
          infer_from_employer: {
            type: "boolean",
            description: "Default true. If true, candidates without an explicit sector tag are still included when their employer is a well-known company in the queried sector — flagged as 'inferred'.",
          },
          limit: { type: "number", description: "Default 5, max 25." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_company_sector",
      description:
        "Permanently records a sector for a company (creates/updates the client's company_intel.industry). Call this when the user confirms an inferred sector match so future searches use the confirmed value.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "The client id (from inferred_client_id in a prior candidate_list payload)." },
          employer_name: { type: "string", description: "Fallback if client_id is not known — used to look up or create the client." },
          sector: { type: "string" },
        },
        required: ["sector"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_candidates",
      description:
        "Blunt attribute filter over the candidate table. Use this ONLY when the question is about attributes (status, salary bands, last-contacted date, availability) — not for job-title/sector/skill discovery (use search_candidates_semantic for those).",
      parameters: {
        type: "object",
        properties: {
          job_title_contains: { type: "string", description: "Prefer search_candidates_semantic for anything title-based." },
          employer_contains: { type: "string" },
          location_contains: { type: "string" },
          sector_contains: { type: "string", description: "Prefer search_candidates_semantic for anything sector-based." },
          skills_contains: { type: "string" },
          status: { type: "string" },
          salary_min: { type: "number" },
          salary_max: { type: "number" },
          not_contacted_days: { type: "number" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_jobs",
      description: "Search jobs / roles the recruiter is working on.",
      parameters: {
        type: "object",
        properties: {
          title_contains: { type: "string" },
          client_contains: { type: "string" },
          status: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_clients",
      description: "Search clients / companies.",
      parameters: {
        type: "object",
        properties: {
          company_contains: { type: "string" },
          sector_contains: { type: "string" },
          status: { type: "string" },
          not_contacted_days: { type: "number" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_contacts",
      description: "Search individual contacts at client companies.",
      parameters: {
        type: "object",
        properties: {
          name_contains: { type: "string" },
          company_contains: { type: "string" },
          not_contacted_days: { type: "number" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_notes",
      description: "Search call notes / transcripts by keyword.",
      parameters: {
        type: "object",
        properties: {
          contains: { type: "string" },
          candidate_id: { type: "string" },
          client_id: { type: "string" },
          job_id: { type: "string" },
          limit: { type: "number" },
        },
        required: ["contains"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_placements",
      description: "Fetch placements (deals done).",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          since_date: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aggregate_candidates",
      description: "Group and count/average candidates.",
      parameters: {
        type: "object",
        properties: {
          group_by: { type: "string", enum: ["job_title", "current_employer", "location", "sector", "status", "availability"] },
          job_title_contains: { type: "string" },
          location_contains: { type: "string" },
          sector_contains: { type: "string" },
          metric: { type: "string", enum: ["count", "avg_salary", "salary_range"] },
        },
        required: ["group_by", "metric"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recruiter_profile",
      description: "Fetch the recruiter's own profile.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function semanticCandidateSearch(
  sb: any,
  userId: string,
  apiKey: string,
  args: any,
) {
  const limit = Math.min(Math.max(Number(args?.limit) || 5, 1), 25);
  const sectors: string[] = Array.isArray(args?.sectors) ? args.sectors.filter(Boolean) : [];
  const excludeSectors: string[] = Array.isArray(args?.not_interested_in) ? args.not_interested_in.filter(Boolean) : [];
  const skills: string[] = Array.isArray(args?.skills) ? args.skills.filter(Boolean) : [];
  const jobTitle: string = String(args?.job_title || "").trim();
  const seniority: string = String(args?.seniority || "").trim();
  const inferFromEmployer: boolean = args?.infer_from_employer !== false;

  // 1. Pull the candidate pool for this owner (bounded).
  let q = sb
    .from("candidates")
    .select(
      "id,name,first_name,last_name,job_title,current_employer,location,summary,note,salary_expectation,availability,status,do_not_contact,gdpr_deleted,updated_at,email,linkedin_url",
    )
    .eq("owner_user_id", userId)
    .eq("do_not_contact", false)
    .eq("gdpr_deleted", false)
    .limit(1500);
  if (args?.location_contains) q = q.ilike("location", `%${args.location_contains}%`);
  if (typeof args?.salary_min === "number") q = q.gte("salary_expectation", args.salary_min);
  if (typeof args?.salary_max === "number") q = q.lte("salary_expectation", args.salary_max);
  const { data: candidatesRaw = [], error: candErr } = await q;
  if (candErr) return { error: candErr.message };
  const candidates = (candidatesRaw as any[]).filter(
    (c) => c.status !== "Not Suitable" && c.status !== "Placed",
  );
  if (!candidates.length) return { count: 0, matches: [], note: "No eligible candidates in your database for these filters." };

  // 2. Fetch sector tags per candidate.
  const ids = candidates.map((c) => c.id);
  const sectorsByCand: Record<string, string[]> = {};
  {
    const { data: cTags = [] } = await sb
      .from("candidate_tags")
      .select("candidate_id, tag_definitions(category, label)")
      .in("candidate_id", ids);
    for (const t of cTags as any[]) {
      const cat = t.tag_definitions?.category;
      const label = t.tag_definitions?.label;
      if (!label) continue;
      if (cat === "sector_preference" || cat === "sectors_experience" || cat === "sector") {
        (sectorsByCand[t.candidate_id] ||= []).push(label);
      }
    }
  }

  // 3. Employer → client_id + confirmed industry.
  const employers = Array.from(new Set(candidates.map((c) => (c.current_employer || "").trim()).filter(Boolean)));
  const clientByEmployer: Record<string, { id: string; industry: string | null }> = {};
  if (employers.length) {
    const { data: matched = [] } = await sb
      .from("clients")
      .select("id, company_name")
      .in("company_name", employers);
    const clientIds = (matched as any[]).map((c) => c.id);
    const idToName: Record<string, string> = {};
    for (const c of matched as any[]) idToName[c.id] = c.company_name;
    const industries: Record<string, string | null> = {};
    if (clientIds.length) {
      const { data: intels = [] } = await sb
        .from("company_intel")
        .select("client_id, industry")
        .in("client_id", clientIds);
      for (const i of intels as any[]) industries[i.client_id] = i.industry || null;
    }
    for (const c of matched as any[]) {
      clientByEmployer[c.company_name.toLowerCase()] = { id: c.id, industry: industries[c.id] || null };
    }
  }

  // 4. Employer sector inference (LLM classification) — only when a sector was queried
  //    AND we didn't already confirm it from company_intel.industry.
  const primarySector = sectors[0] || "";
  const inferredByEmployer: Record<string, { match: boolean; reason: string; confidence: string }> = {};
  if (inferFromEmployer && primarySector) {
    const needInfer = employers.filter((e) => {
      const info = clientByEmployer[e.toLowerCase()];
      const confirmed = (info?.industry || "").toLowerCase();
      return !confirmed || !confirmed.includes(primarySector.toLowerCase());
    });
    if (needInfer.length) {
      const map = await classifyEmployerSectors({ apiKey, employers: needInfer, sector: primarySector });
      for (const [k, v] of Object.entries(map)) inferredByEmployer[k] = v;
    }
  }

  // 5. Apply exclusions.
  const excluded = new Set<string>();
  if (excludeSectors.length) {
    for (const c of candidates) {
      const secs = (sectorsByCand[c.id] || []).map((s) => s.toLowerCase());
      const employerSector = (clientByEmployer[(c.current_employer || "").toLowerCase()]?.industry || "").toLowerCase();
      for (const ex of excludeSectors) {
        const exL = ex.toLowerCase();
        if (secs.some((s) => s.includes(exL)) || employerSector.includes(exL)) {
          excluded.add(c.id);
          break;
        }
      }
    }
  }

  // 6. Compact + track inferred rows so we can flag them in the final output.
  const inferredCandidates = new Set<string>();
  const explicitCandidates = new Set<string>();
  const compact: CandidateForMatch[] = [];
  for (const c of candidates) {
    if (excluded.has(c.id)) continue;
    const empKey = (c.current_employer || "").toLowerCase();
    const clientInfo = clientByEmployer[empKey];
    const confirmedIndustry = (clientInfo?.industry || "").toLowerCase();
    const inferredInfo = inferredByEmployer[empKey];
    const cSectors = sectorsByCand[c.id] || [];

    if (primarySector) {
      const explicit =
        cSectors.some((s) => s.toLowerCase().includes(primarySector.toLowerCase())) ||
        confirmedIndustry.includes(primarySector.toLowerCase());
      const inferred = !explicit && inferredInfo?.match === true;
      if (!explicit && !inferred) continue;
      if (explicit) explicitCandidates.add(c.id); else inferredCandidates.add(c.id);
    }

    const employerContextParts: string[] = [];
    if (confirmedIndustry) employerContextParts.push(`industry: ${clientInfo!.industry}`);
    else if (inferredInfo?.match) employerContextParts.push(`likely ${primarySector} (${inferredInfo.reason})`);

    compact.push({
      id: c.id,
      title: c.job_title,
      employer: c.current_employer,
      employer_context: employerContextParts.join("; "),
      location: c.location,
      salary: c.salary_expectation,
      skills: "",
      sectors: cSectors.join(", "),
      summary: (c.summary || c.note || "").slice(0, 300),
    });
  }
  if (!compact.length) return { count: 0, matches: [], note: "No candidates matched those filters before semantic scoring." };

  // 7. Semantic scoring via SHARED module (same one Job Launch uses).
  const scores = await scoreCandidatesSemantic({
    apiKey,
    role: {
      title: jobTitle || null,
      sector: primarySector || null,
      similar_titles: jobTitle ? [jobTitle] : [],
      key_skills: [...skills, ...sectors, seniority].filter(Boolean),
      query: [seniority, jobTitle, sectors.join("/")].filter(Boolean).join(" ") || null,
      ideal_candidate_line: [seniority, jobTitle, sectors.length ? `with ${sectors.join(" / ")} experience` : "", skills.length ? `skilled in ${skills.join(", ")}` : ""].filter(Boolean).join(" "),
    },
    candidates: compact,
  });

  const RELEVANCE_THRESHOLD = 40;
  const byId: Record<string, any> = Object.fromEntries(candidates.map((c) => [c.id, c]));
  const matches = compact
    .map((c) => {
      const sc = scores[c.id];
      if (!sc || sc.score < RELEVANCE_THRESHOLD) return null;
      const orig = byId[c.id];
      const isInferred = inferredCandidates.has(c.id);
      const empKey = (orig.current_employer || "").toLowerCase();
      const clientInfo = clientByEmployer[empKey];
      return {
        id: orig.id,
        name: orig.name || [orig.first_name, orig.last_name].filter(Boolean).join(" "),
        title: orig.job_title,
        employer: orig.current_employer,
        location: orig.location,
        salary: orig.salary_expectation,
        match_score: sc.score,
        match_reason: sc.reason,
        inferred: isInferred || undefined,
        inferred_sector: isInferred ? primarySector : undefined,
        inferred_reason: isInferred ? `${orig.current_employer} — inferred ${primarySector}` : undefined,
        inferred_client_id: isInferred ? clientInfo?.id : undefined,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      // Explicit-sector matches ALWAYS rank above inferred ones, even if scores tie.
      if (!!a.inferred !== !!b.inferred) return a.inferred ? 1 : -1;
      return b.match_score - a.match_score;
    })
    .slice(0, limit);

  console.log(
    `[ask-desky:semantic] pool=${candidates.length} compact=${compact.length} scored=${Object.keys(scores).length} explicit=${explicitCandidates.size} inferred=${inferredCandidates.size} returned=${matches.length}`,
  );

  return {
    count: matches.length,
    matches,
    threshold: RELEVANCE_THRESHOLD,
    explicit_count: explicitCandidates.size,
    inferred_count: inferredCandidates.size,
  };
}

async function confirmCompanySector(sb: any, userId: string, args: any) {
  const sector = String(args?.sector || "").trim();
  if (!sector) return { error: "sector is required" };
  let clientId: string | null = args?.client_id || null;
  if (!clientId && args?.employer_name) {
    const { data: existing } = await sb
      .from("clients")
      .select("id")
      .eq("owner_user_id", userId)
      .ilike("company_name", args.employer_name)
      .maybeSingle();
    if (existing?.id) clientId = existing.id;
    else {
      const { data: created, error: createErr } = await sb
        .from("clients")
        .insert({ owner_user_id: userId, company_name: args.employer_name, status: "Prospect" })
        .select("id")
        .single();
      if (createErr) return { error: createErr.message };
      clientId = created.id;
    }
  }
  if (!clientId) return { error: "client_id or employer_name is required" };

  // Upsert company_intel.industry
  const { data: existingIntel } = await sb
    .from("company_intel")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (existingIntel?.id) {
    const { error } = await sb.from("company_intel").update({ industry: sector }).eq("id", existingIntel.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await sb
      .from("company_intel")
      .insert({ client_id: clientId, industry: sector, owner_user_id: userId });
    if (error) return { error: error.message };
  }
  return { confirmed: true, client_id: clientId, sector };
}

async function runTool(sb: any, userId: string, apiKey: string, name: string, args: any): Promise<any> {
  const cap = Math.min(Math.max(Number(args?.limit) || 50, 1), 200);
  const own = (q: any) => q.eq("owner_user_id", userId);

  try {
    if (name === "search_candidates_semantic") {
      return await semanticCandidateSearch(sb, userId, apiKey, args || {});
    }
    if (name === "confirm_company_sector") {
      return await confirmCompanySector(sb, userId, args || {});
    }

    if (name === "query_candidates") {
      let q = sb
        .from("candidates")
        .select("id,name,first_name,last_name,job_title,current_employer,location,salary_expectation,availability,notice_period,status,note,summary,do_not_contact,gdpr_deleted,updated_at")
        .eq("do_not_contact", false)
        .eq("gdpr_deleted", false)
        .limit(cap);
      q = own(q);
      if (args.job_title_contains) q = q.ilike("job_title", `%${args.job_title_contains}%`);
      if (args.employer_contains) q = q.ilike("current_employer", `%${args.employer_contains}%`);
      if (args.location_contains) q = q.ilike("location", `%${args.location_contains}%`);
      if (args.status) q = q.eq("status", args.status);
      if (typeof args.salary_min === "number") q = q.gte("salary_expectation", args.salary_min);
      if (typeof args.salary_max === "number") q = q.lte("salary_expectation", args.salary_max);
      if (args.skills_contains) {
        const s = args.skills_contains;
        q = q.or(`note.ilike.%${s}%,summary.ilike.%${s}%`);
      }
      if (typeof args.not_contacted_days === "number") q = q.lt("updated_at", daysAgoIso(args.not_contacted_days));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, candidates: data };
    }

    if (name === "query_jobs") {
      let q = sb.from("jobs").select("id,title,status,location,salary_min,salary_max,job_type,fee_type,fee_value,date_opened,description,clients(id,company_name)").limit(cap);
      q = own(q);
      if (args.title_contains) q = q.ilike("title", `%${args.title_contains}%`);
      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q;
      if (error) return { error: error.message };
      let jobs = data || [];
      if (args.client_contains) {
        const c = args.client_contains.toLowerCase();
        jobs = jobs.filter((j: any) => j.clients?.company_name?.toLowerCase().includes(c));
      }
      return { count: jobs.length, jobs };
    }

    if (name === "query_clients") {
      let q = sb.from("clients").select("id,company_name,contact_name,sector,status,last_activity_date,next_action,next_action_due_date").limit(cap);
      q = own(q);
      if (args.company_contains) q = q.ilike("company_name", `%${args.company_contains}%`);
      if (args.sector_contains) q = q.ilike("sector", `%${args.sector_contains}%`);
      if (args.status) q = q.eq("status", args.status);
      if (typeof args.not_contacted_days === "number") {
        q = q.or(`last_activity_date.lt.${daysAgoIso(args.not_contacted_days).split("T")[0]},last_activity_date.is.null`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, clients: data };
    }

    if (name === "query_contacts") {
      let q = sb.from("contacts").select("id,name,first_name,last_name,job_title,email,phone,linkedin_url,do_not_contact,last_contacted_at,client_id,clients:client_id(company_name)").eq("do_not_contact", false).limit(cap);
      q = own(q);
      if (args.name_contains) q = q.ilike("name", `%${args.name_contains}%`);
      if (typeof args.not_contacted_days === "number") {
        q = q.or(`last_contacted_at.lt.${daysAgoIso(args.not_contacted_days)},last_contacted_at.is.null`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      let contacts = data || [];
      if (args.company_contains) {
        const c = args.company_contains.toLowerCase();
        contacts = contacts.filter((x: any) => x.clients?.company_name?.toLowerCase().includes(c));
      }
      return { count: contacts.length, contacts };
    }

    if (name === "query_notes") {
      let q = sb.from("notes").select("id,candidate_id,client_id,job_id,content,activity_type,outcome,follow_up_date,created_at,candidates(name),clients(company_name)").ilike("content", `%${args.contains}%`).order("created_at", { ascending: false }).limit(cap);
      q = own(q);
      if (args.candidate_id) q = q.eq("candidate_id", args.candidate_id);
      if (args.client_id) q = q.eq("client_id", args.client_id);
      if (args.job_id) q = q.eq("job_id", args.job_id);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, notes: data };
    }

    if (name === "query_placements") {
      let q = sb.from("placements").select("id,candidate_name_snapshot,client_name_snapshot,job_title_snapshot,fee_amount,fee_percentage,salary_placed_at,start_date,offer_accepted_date,status,invoice_status").limit(cap);
      q = own(q);
      if (args.status) q = q.eq("status", args.status);
      if (args.since_date) q = q.gte("offer_accepted_date", args.since_date);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, placements: data };
    }

    if (name === "aggregate_candidates") {
      let q = sb.from("candidates").select("job_title,current_employer,location,status,availability,salary_expectation").eq("do_not_contact", false).eq("gdpr_deleted", false).limit(2000);
      q = own(q);
      if (args.job_title_contains) q = q.ilike("job_title", `%${args.job_title_contains}%`);
      if (args.location_contains) q = q.ilike("location", `%${args.location_contains}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      const rows = data || [];
      const key = (r: any) => r[args.group_by] || "Unknown";
      const buckets: Record<string, number[]> = {};
      for (const r of rows) {
        const k = key(r);
        if (!buckets[k]) buckets[k] = [];
        if (r.salary_expectation) buckets[k].push(Number(r.salary_expectation));
        else buckets[k].push(NaN);
      }
      const breakdown = Object.entries(buckets).map(([k, arr]) => {
        const nums = arr.filter((n) => !isNaN(n));
        const avg = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
        const min = nums.length ? Math.min(...nums) : null;
        const max = nums.length ? Math.max(...nums) : null;
        return { group: k, count: arr.length, avg_salary: avg, salary_min: min, salary_max: max };
      }).sort((a, b) => b.count - a.count);
      return { total: rows.length, breakdown };
    }

    if (name === "get_recruiter_profile") {
      const { data } = await sb.from("recruiter_profiles").select("display_name,agency_name,brand_color").eq("user_id", userId).maybeSingle();
      return { profile: data };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    const { messages, conversation_id } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    let convoId = conversation_id as string | null;
    if (!convoId) {
      const title = String(lastUser?.content || "New conversation").slice(0, 80);
      const { data: created } = await admin.from("ask_desky_conversations").insert({ owner_user_id: userId, title }).select("id").single();
      convoId = created?.id ?? null;
    }
    if (convoId && lastUser) {
      await admin.from("ask_desky_messages").insert({ conversation_id: convoId, owner_user_id: userId, role: "user", content: String(lastUser.content ?? "") });
      await admin.from("ask_desky_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convoId);
    }

    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODEL, messages: convo, tools: TOOLS, tool_choice: "auto" }),
      });
      if (!r.ok) {
        const text = await r.text();
        return new Response(JSON.stringify({ error: "AI gateway error", status: r.status, detail: text }), {
          status: r.status === 429 || r.status === 402 ? r.status : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await r.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return new Response(JSON.stringify({ error: "no message" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (msg.tool_calls?.length) {
        convo.push(msg);
        const results = await Promise.all(msg.tool_calls.map(async (tc: any) => {
          let parsedArgs: any = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch {}
          const out = await runTool(admin, userId, apiKey, tc.function.name, parsedArgs);
          return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 60000) };
        }));
        convo.push(...results);
        continue;
      }

      const finalText = String(msg.content ?? "");
      if (convoId) {
        await admin.from("ask_desky_messages").insert({ conversation_id: convoId, owner_user_id: userId, role: "assistant", content: finalText });
      }
      return new Response(JSON.stringify({ content: finalText, conversation_id: convoId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "max steps reached", conversation_id: convoId }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
