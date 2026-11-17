// Spott → Desky import/sync. Spott wins on conflicts (non-empty Spott values overwrite).
// Runs in resumable steps: each call processes pages until a time budget, persisting a cursor in spott_sync_state.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY = "https://connector-gateway.lovable.dev/udc_spott";
const ENTITIES = ["clients", "contacts", "candidates", "vacancies", "applications", "placements", "notes", "meetings"] as const;
type Entity = typeof ENTITIES[number];
const BUDGET_MS = 40_000;
const MAX_JUDGEMENTS_PER_STEP = 3;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function spott(path: string, params: Record<string, string | undefined> = {}) {
  const u = new URL(GATEWAY + path);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(u, {
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "X-Connection-Api-Key": Deno.env.get("UDC_SPOTT_API_KEY")!,
      },
    });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); continue; }
    if (!r.ok) throw new Error(`Spott ${path} [${r.status}]: ${(await r.text()).slice(0, 300)}`);
    return await r.json();
  }
  throw new Error(`Spott ${path}: rate limited`);
}

// ---- small helpers ----
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const lower = (v: unknown) => s(v)?.toLowerCase() ?? null;
const date = (v: unknown) => (s(v) ? String(v).slice(0, 10) : null);
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));
const loc = (l: any) => l ? (s(l.rawCityCountry) || [l.city, l.country].filter(Boolean).join(", ") || (s(l.formattedAddress)?.startsWith("0,") ? null : s(l.formattedAddress))) : null;
const primaryEmail = (arr: any[] | undefined) => lower((arr ?? []).find((e) => e.isPrimary)?.email ?? arr?.[0]?.email);
const primaryPhone = (arr: any[] | undefined) => s((arr ?? []).find((e) => e.isPrimary)?.phoneNumber ?? arr?.[0]?.phoneNumber);
const fullName = (f?: string | null, l?: string | null) => [f, l].filter(Boolean).join(" ").trim();

function mapJobStatus(name?: string | null) {
  switch ((name ?? "").toLowerCase()) {
    case "open": return "Active";
    case "hold": return "On Hold";
    case "filled": return "Filled";
    case "lost": case "closed": return "Closed";
    default: return "Active";
  }
}
// Spott application stage → Desky pipeline stage
function mapStage(name?: string | null) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("placed")) return "Placed";
  if (n.includes("offer")) return "Offer";
  if (n.includes("2nd") || n.includes("second") || n.includes("final")) return "Second Stage";
  if (n.includes("interview")) return "First Stage";
  if (n === "sent" || n.includes("present")) return "Sent CV";
  return "Shortlist";
}
const STAGE_ORDER: Record<string, number> = { "AI Suggested": 0, Shortlist: 1, "Sent CV": 2, "First Stage": 3, "Second Stage": 4, "Final Stage": 5, Offer: 6, Placed: 7 };

async function byIds(db: SupabaseClient, table: string, owner: string, col: string, ids: string[], select = "id, spott_id") {
  const out = new Map<string, any>();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await db.from(table).select(select).eq(table === "call_transcripts" ? "user_id" : "owner_user_id", owner).in(col, uniq.slice(i, i + 200));
    if (error) throw new Error(`${table} lookup: ${error.message}`);
    for (const r of data ?? []) out.set(String((r as any)[col]).toLowerCase(), r);
  }
  return out;
}

async function upsert(db: SupabaseClient, table: string, id: string | null, row: Record<string, unknown>) {
  if (id) {
    const { error } = await db.from(table).update(row).eq("id", id);
    if (error) throw new Error(`${table} update: ${error.message}`);
    return { id, created: false };
  }
  const { data, error } = await db.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table} insert: ${error.message}`);
  return { id: (data as any).id as string, created: true };
}

// ---- per-entity page fetch: returns items + next cursor ----
async function fetchPage(entity: Entity, cursor: string | null, since: string | null) {
  if (entity === "placements") {
    const page = Number(cursor ?? 0);
    const d = await spott("/placements", { page: String(page), pageSize: "50", modifiedSince: since ?? undefined });
    return { items: d.items ?? [], next: d.pagination?.hasNextPage ? String(page + 1) : null };
  }
  const path = entity === "contacts" ? "/clients/contacts" : `/${entity}`;
  const params: Record<string, string | undefined> = { limit: "50", cursor: cursor ?? undefined };
  if (since && entity !== "meetings") params.modifiedSince = since;
  const d = await spott(path, params);
  const pi = d.pageInfo ?? d.pagination ?? {};
  const next = pi.nextCursor ?? pi.cursor ?? null;
  const more = pi.hasNextPage ?? pi.hasMore ?? !!next;
  return { items: d.items ?? [], next: more && next && (d.items ?? []).length ? next : null };
}

type Ctx = { db: SupabaseClient; owner: string; ownerEmail: string | null; auth: string; counts: Record<string, number>; judgements: number };
const bump = (c: Ctx, k: string, n = 1) => (c.counts[k] = (c.counts[k] ?? 0) + n);

// ---- processors ----
async function doClients(c: Ctx, items: any[]) {
  const existing = await byIds(c.db, "clients", c.owner, "spott_id", items.map((i) => i.id));
  const names = await byIds(c.db, "clients", c.owner, "company_name", items.map((i) => i.name?.name), "id, spott_id, company_name");
  for (const i of items) {
    const name = s(i.name?.name); if (!name) continue;
    const match = existing.get(i.id.toLowerCase()) ?? names.get(name.toLowerCase());
    const row = clean({
      owner_user_id: c.owner, spott_id: i.id, company_name: name,
      sector: s(i.industry?.industry), linkedin_url: s(i.linkedinUrl?.linkedinUrl),
      website: s(i.domain?.domain), location: loc(i.locations?.locations?.[0]),
      summary: s(i.description?.description), status: s(i.stage?.stage?.name),
    });
    const r = await upsert(c.db, "clients", match?.id ?? null, row);
    bump(c, r.created ? "clients_created" : "clients_updated");
  }
}

async function clientIdFor(c: Ctx, spottCompanyId: string | null | undefined, name: string | null | undefined) {
  if (spottCompanyId) {
    const { data } = await c.db.from("clients").select("id").eq("owner_user_id", c.owner).eq("spott_id", spottCompanyId).maybeSingle();
    if (data) return data.id as string;
  }
  const n = s(name); if (!n) return null;
  const { data } = await c.db.from("clients").select("id").eq("owner_user_id", c.owner).ilike("company_name", n).limit(1).maybeSingle();
  if (data) return data.id as string;
  const r = await upsert(c.db, "clients", null, clean({ owner_user_id: c.owner, company_name: n, spott_id: spottCompanyId ?? null }));
  bump(c, "clients_created");
  return r.id;
}

async function doContacts(c: Ctx, items: any[]) {
  const existing = await byIds(c.db, "contacts", c.owner, "spott_id", items.map((i) => i.id));
  for (const i of items) {
    const name = fullName(i.firstName, i.lastName); if (!name) continue;
    const clientId = await clientIdFor(c, i.client?.company?.id, i.client?.company?.name);
    if (!clientId) continue;
    const email = primaryEmail(i.emails);
    let match = existing.get(i.id.toLowerCase());
    if (!match && email) {
      const { data } = await c.db.from("contacts").select("id").eq("owner_user_id", c.owner).ilike("email", email).limit(1).maybeSingle();
      match = data;
    }
    const row = clean({
      owner_user_id: c.owner, spott_id: i.id, spott_person_id: i.candidateId ?? null, client_id: clientId,
      first_name: s(i.firstName), last_name: s(i.lastName), name, job_title: s(i.role), email,
      phone: primaryPhone(i.phoneNumbers), status: s(i.stage?.name), source: "Spott",
    });
    const r = await upsert(c.db, "contacts", match?.id ?? null, row);
    bump(c, r.created ? "contacts_created" : "contacts_updated");
  }
}

async function doCandidates(c: Ctx, items: any[]) {
  const ids = items.map((i) => i.id);
  const existing = await byIds(c.db, "candidates", c.owner, "spott_id", ids);
  const asContacts = await byIds(c.db, "contacts", c.owner, "spott_person_id", ids, "id, spott_person_id");
  const emails = items.map((i) => primaryEmail(i.emails?.emails)).filter(Boolean) as string[];
  const byEmail = await byIds(c.db, "candidates", c.owner, "email", emails, "id, email");
  const byName = await byIds(c.db, "candidates", c.owner, "name", items.map((i) => fullName(i.name?.firstName, i.name?.lastName)), "id, name, spott_id");
  for (const i of items) {
    if (asContacts.has(i.id.toLowerCase())) { bump(c, "candidates_skipped_contact"); continue; }
    const first = s(i.name?.firstName), last = s(i.name?.lastName);
    const name = fullName(first, last); if (!name) continue;
    const email = primaryEmail(i.emails?.emails);
    const nm = byName.get(name.toLowerCase());
    const match = existing.get(i.id.toLowerCase()) ?? (email ? byEmail.get(email) : undefined) ?? (nm && !nm.spott_id ? nm : undefined);
    const li = (i.socialMedia?.socialMedia ?? []).find((x: any) => x.type === "LINKEDIN");
    const row = clean({
      owner_user_id: c.owner, spott_id: i.id, first_name: first, last_name: last, name, email,
      phone: primaryPhone(i.phoneNumbers?.phoneNumbers), location: loc(i.locations?.locations?.[0]),
      job_title: s(i.latestWorkExperience?.title), current_employer: s(i.latestWorkExperience?.company?.name),
      linkedin_url: s(li?.url), summary: s(i.aiSummary), source: "Spott",
    });
    const r = await upsert(c.db, "candidates", match?.id ?? null, row);
    bump(c, r.created ? "candidates_created" : "candidates_updated");
  }
}

async function candidateIdFor(c: Ctx, p: any) {
  if (!p?.id) return null;
  const { data } = await c.db.from("candidates").select("id").eq("owner_user_id", c.owner).eq("spott_id", p.id).maybeSingle();
  if (data) return data.id as string;
  const name = fullName(p.firstName, p.lastName); if (!name) return null;
  const r = await upsert(c.db, "candidates", null, clean({ owner_user_id: c.owner, spott_id: p.id, first_name: s(p.firstName), last_name: s(p.lastName), name, source: "Spott", incomplete_profile: true }));
  bump(c, "candidates_created");
  return r.id;
}

async function jobIdFor(c: Ctx, v: any) {
  if (!v?.id) return null;
  const { data } = await c.db.from("jobs").select("id").eq("owner_user_id", c.owner).eq("spott_id", v.id).maybeSingle();
  if (data) return data.id as string;
  const clientId = await clientIdFor(c, v.companyId, v.companyName);
  const r = await upsert(c.db, "jobs", null, clean({ owner_user_id: c.owner, spott_id: v.id, title: s(v.name) ?? "Untitled role", client_id: clientId, status: "Active" }));
  bump(c, "jobs_created");
  return r.id;
}

async function doVacancies(c: Ctx, items: any[]) {
  const existing = await byIds(c.db, "jobs", c.owner, "spott_id", items.map((i) => i.id));
  for (const i of items) {
    const title = s(i.name?.name); if (!title) continue;
    const cl = i.client?.client;
    const clientId = await clientIdFor(c, cl?.id, cl?.name);
    let match = existing.get(i.id.toLowerCase());
    if (!match && clientId) {
      const { data } = await c.db.from("jobs").select("id").eq("owner_user_id", c.owner).eq("client_id", clientId).ilike("title", title).is("spott_id", null).limit(1).maybeSingle();
      match = data;
    }
    const sal = i.salaryRange?.salaryRange;
    const row = clean({
      owner_user_id: c.owner, spott_id: i.id, title, client_id: clientId,
      status: mapJobStatus(i.stage?.stage?.name), description: s(i.description?.description),
      location: s(i.location?.location?.rawCityCountry) ?? loc(i.location?.locations?.[0]),
      salary_min: typeof sal?.min?.amount === "number" ? Math.round(sal.min.amount) : (typeof sal?.min === "number" ? sal.min : null),
      salary_max: typeof sal?.max?.amount === "number" ? Math.round(sal.max.amount) : (typeof sal?.max === "number" ? sal.max : null),
      job_type: s(i.employmentType?.employmentType), date_opened: date(i.createdAt?.createdAt),
    });
    const r = await upsert(c.db, "jobs", match?.id ?? null, row);
    bump(c, r.created ? "jobs_created" : "jobs_updated");
  }
}

async function ensureStage(c: Ctx, jobId: string, stage: string) {
  const { data } = await c.db.from("job_stages").select("id").eq("job_id", jobId).eq("stage_name", stage).maybeSingle();
  if (!data) await c.db.from("job_stages").insert({ job_id: jobId, stage_name: stage, stage_order: STAGE_ORDER[stage] ?? 50, is_system_stage: false });
}

async function doApplications(c: Ctx, items: any[]) {
  for (const i of items) {
    const candId = await candidateIdFor(c, i.candidate);
    const jobId = await jobIdFor(c, i.vacancy);
    if (!candId || !jobId) continue;
    const stage = mapStage(i.stage?.name);
    await ensureStage(c, jobId, stage);
    const { data: ex } = await c.db.from("candidate_jobs").select("id, stage").eq("candidate_id", candId).eq("job_id", jobId).maybeSingle();
    const row: Record<string, unknown> = { owner_user_id: c.owner, spott_id: i.id, candidate_id: candId, job_id: jobId, stage };
    if (!ex) { row.source = "Spott"; row.created_at = i.createdAt; }
    if (ex && ex.stage !== stage) row.stage_changed_at = new Date().toISOString();
    const r = await upsert(c.db, "candidate_jobs", ex?.id ?? null, row);
    bump(c, r.created ? "applications_created" : "applications_updated");
  }
}

async function doPlacements(c: Ctx, items: any[]) {
  const existing = await byIds(c.db, "placements", c.owner, "spott_id", items.map((i) => i.id));
  for (const i of items) {
    const candId = await candidateIdFor(c, i.candidate); if (!candId) continue;
    const clientId = await clientIdFor(c, i.company?.id, i.company?.name);
    const jobId = i.vacancy?.id ? await jobIdFor(c, { ...i.vacancy, companyId: i.company?.id, companyName: i.company?.name }) : null;
    let cjId: string | null = null;
    if (jobId) {
      const { data } = await c.db.from("candidate_jobs").select("id").eq("candidate_id", candId).eq("job_id", jobId).maybeSingle();
      cjId = data?.id ?? null;
    }
    let match = existing.get(i.id.toLowerCase());
    if (!match) {
      let q = c.db.from("placements").select("id").eq("owner_user_id", c.owner).eq("candidate_id", candId).is("spott_id", null);
      q = jobId ? q.eq("job_id", jobId) : q;
      const { data } = await q.limit(1).maybeSingle();
      match = data;
    }
    const start = date(i.startDate);
    const row = clean({
      owner_user_id: c.owner, spott_id: i.id, candidate_id: candId, client_id: clientId, job_id: jobId, candidate_job_id: cjId,
      candidate_name_snapshot: fullName(i.candidate?.firstName, i.candidate?.lastName), client_name_snapshot: s(i.company?.name),
      job_title_snapshot: s(i.vacancy?.name), offer_accepted_date: date(i.placedAt), start_date: start,
      fee_amount: typeof i.fee?.net?.amount === "number" ? i.fee.net.amount : null,
      fee_type: i.fee?.details?.basis === "PERCENTAGE" ? "percentage" : (i.fee?.details?.basis ? "fixed" : null),
      source: "Spott",
    });
    if (!match) (row as any).status = start && start > new Date().toISOString().slice(0, 10) ? "pre_start" : "active";
    const r = await upsert(c.db, "placements", match?.id ?? null, row);
    bump(c, r.created ? "placements_created" : "placements_updated");
  }
}

async function doNotes(c: Ctx, items: any[]) {
  const existing = await byIds(c.db, "notes", c.owner, "spott_id", items.map((i) => i.id));
  for (const i of items) {
    const content = [s(i.title), s(i.content)].filter(Boolean).join("\n\n"); if (!content) continue;
    const row: Record<string, unknown> = { owner_user_id: c.owner, spott_id: i.id, content, activity_type: i.call ? "call" : i.meeting ? "meeting" : "note", created_at: i.createdAt };
    for (const l of i.links ?? []) {
      if (l.entityType === "candidate" && l.candidate) row.candidate_id ??= await candidateIdFor(c, l.candidate);
      else if (l.entityType === "clientContact" && l.clientContact) {
        const { data } = await c.db.from("contacts").select("id, client_id").eq("owner_user_id", c.owner).eq("spott_id", l.clientContact.id).maybeSingle();
        if (data) { row.contact_id ??= data.id; row.client_id ??= data.client_id; }
        else row.client_id ??= await clientIdFor(c, l.clientContact.companyId, l.clientContact.companyName);
      } else if (l.entityType === "vacancy" && l.vacancy) row.job_id ??= await jobIdFor(c, l.vacancy);
      else if ((l.entityType === "client" || l.entityType === "company") && (l.client || l.company)) {
        const x = l.client ?? l.company; row.client_id ??= await clientIdFor(c, x.id, x.name);
      }
    }
    const r = await upsert(c.db, "notes", existing.get(i.id.toLowerCase())?.id ?? null, clean(row));
    bump(c, r.created ? "notes_created" : "notes_updated");
  }
}

async function doMeetings(c: Ctx, items: any[]) {
  for (const m of items) {
    const tIds = (m.transcripts ?? []).map((t: any) => (typeof t === "string" ? t : t?.id)).filter(Boolean);
    if (!tIds.length) continue;
    // find the candidate among participants (anyone who isn't the recruiter)
    let candId: string | null = null;
    for (const p of m.participants ?? []) {
      const e = lower(p.email); if (!e || e === c.ownerEmail) continue;
      const { data } = await c.db.from("candidates").select("id").eq("owner_user_id", c.owner).ilike("email", e).limit(1).maybeSingle();
      if (data) { candId = data.id; break; }
    }
    for (const tid of tIds) {
      const { data: ex } = await c.db.from("call_transcripts").select("id").eq("user_id", c.owner).eq("spott_id", tid).maybeSingle();
      if (ex) continue;
      const t = await spott(`/transcripts/${tid}`);
      const text = (t.content?.segments ?? []).map((sg: any) => `${sg.speaker ?? "Speaker"}: ${sg.text ?? ""}`).join("\n").trim();
      if (!text) continue;
      const mins = m.startTime && m.endTime ? Math.round((Date.parse(m.endTime) - Date.parse(m.startTime)) / 60000) : null;
      const { data: ins, error } = await c.db.from("call_transcripts").insert({
        user_id: c.owner, candidate_id: candId, spott_id: tid, source: "Spott", content: `${m.title ?? "Call"}\n\n${text}`,
        duration_minutes: mins, call_date: m.startTime ?? t.createdAt, extraction_status: candId ? "pending" : "unmatched",
      }).select("id").single();
      if (error) throw new Error(`call_transcripts insert: ${error.message}`);
      bump(c, "transcripts_created");
      if (candId && c.judgements < MAX_JUDGEMENTS_PER_STEP) {
        c.judgements++;
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/judgement-extract`, {
          method: "POST", headers: { Authorization: c.auth, "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
          body: JSON.stringify({ transcript_id: ins.id }),
        });
        bump(c, r.ok ? "transcripts_analysed" : "transcripts_analysis_failed");
      }
    }
  }
}

const PROCESSORS: Record<Entity, (c: Ctx, items: any[]) => Promise<void>> = {
  clients: doClients, contacts: doContacts, candidates: doCandidates, vacancies: doVacancies,
  applications: doApplications, placements: doPlacements, notes: doNotes, meetings: doMeetings,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Not authenticated" }, 401);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await db.auth.getUser();
    if (!u?.user) return json({ error: "Not authenticated" }, 401);
    if (!Deno.env.get("UDC_SPOTT_API_KEY") || !Deno.env.get("LOVABLE_API_KEY")) return json({ error: "Spott is not connected" }, 500);
    const owner = u.user.id;
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "status";

    const { data: st } = await db.from("spott_sync_state").select("*").eq("user_id", owner).maybeSingle();
    if (action === "status") return json({ state: st ?? null });

    if (action === "start") {
      const full = body?.full === true || !st?.finished_at;
      const row = { user_id: owner, status: "running", entity: ENTITIES[0], cursor: null, counts: { since: full ? null : st?.finished_at }, last_error: null, started_at: new Date().toISOString(), finished_at: st?.finished_at ?? null, updated_at: new Date().toISOString() };
      const { error } = await db.from("spott_sync_state").upsert(row);
      if (error) return json({ error: error.message }, 500);
      return json({ state: row });
    }

    if (action === "resume" && st) {
      await db.from("spott_sync_state").update({ status: "running", last_error: null, updated_at: new Date().toISOString() }).eq("user_id", owner);
      return json({ state: { ...st, status: "running", last_error: null } });
    }

    if (action !== "step") return json({ error: "Unknown action" }, 400);
    if (!st || st.status !== "running") return json({ state: st ?? null, done: true });

    const counts = { ...(st.counts as Record<string, any>) };
    const since = (counts.since as string | null) ?? null;
    const ctx: Ctx = { db, owner, ownerEmail: lower(u.user.email), auth, counts, judgements: 0 };
    let entity = st.entity as Entity;
    let cursor = st.cursor as string | null;
    const t0 = Date.now();
    let status = "running"; let lastError: string | null = null;
    try {
      while (Date.now() - t0 < BUDGET_MS) {
        const page = await fetchPage(entity, cursor, since);
        await PROCESSORS[entity](ctx, page.items);
        bump(ctx, `${entity}_seen`, page.items.length);
        if (page.next) { cursor = page.next; continue; }
        const idx = ENTITIES.indexOf(entity);
        cursor = null;
        if (idx === ENTITIES.length - 1) { status = "done"; break; }
        entity = ENTITIES[idx + 1];
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error("spott-sync step failed", entity, lastError);
      status = "error";
    }
    const now = new Date().toISOString();
    const upd = { status, entity, cursor, counts: ctx.counts, last_error: lastError, updated_at: now, ...(status === "done" ? { finished_at: st.started_at ?? now } : {}) };
    await db.from("spott_sync_state").update(upd).eq("user_id", owner);
    return json({ state: { ...st, ...upd }, done: status !== "running" });
  } catch (e) {
    console.error("spott-sync failed", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
