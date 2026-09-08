// Candidate, note, tag, talent-pool and candidate-activity actions.
import { type ActionCtx, type ActionDef, ActionError, audit, paging, unwrap, uuid, z } from "./core.ts";

const CANDIDATE_FIELDS =
  "id, first_name, last_name, name, job_title, current_employer, location, work_preference, email, phone, linkedin_url, status, source, salary_current, salary_expectation, notice_period, availability, summary, client_ready_notes, reengage_date, reengage_reason, do_not_contact, dnc_reason, relationship_score, owner_user_id, created_at, updated_at";

async function requireCandidate(ctx: ActionCtx, id: string) {
  const row = unwrap(
    await ctx.db.from("candidates").select(CANDIDATE_FIELDS).eq("id", id).maybeSingle(),
    "get_candidate",
  );
  if (!row) throw new ActionError("not_found", "Candidate not found", 404);
  return row;
}

const candidateWritable = {
  first_name: z.string().max(120).optional(),
  last_name: z.string().max(120).optional(),
  job_title: z.string().max(200).optional().nullable(),
  current_employer: z.string().max(200).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  work_preference: z.string().max(60).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  linkedin_url: z.string().url().max(400).optional().nullable(),
  status: z.string().max(60).optional(),
  source: z.string().max(60).optional(),
  salary_current: z.number().int().min(0).optional().nullable(),
  salary_expectation: z.number().int().min(0).optional().nullable(),
  notice_period: z.string().max(60).optional().nullable(),
  availability: z.string().max(120).optional().nullable(),
  summary: z.string().max(8000).optional().nullable(),
  client_ready_notes: z.string().max(8000).optional().nullable(),
  reengage_date: z.string().date().optional().nullable(),
  reengage_reason: z.string().max(500).optional().nullable(),
  /** Reassign the record to another user on the team (see list_team_members). */
  owner_user_id: uuid.optional(),
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Find an existing talent pool by name (case/punctuation-insensitive) so minor naming differences never create duplicates. */
async function findPool(ctx: ActionCtx, name: string) {
  const { data } = await ctx.db.from("talent_pools").select("id, name, description, owner_user_id");
  const target = norm(name);
  // deno-lint-ignore no-explicit-any
  const rows: any[] = data ?? [];
  return rows.find((p) => norm(p.name) === target) ??
    rows.find((p) => norm(p.name).includes(target) || target.includes(norm(p.name))) ?? null;
}

async function requirePool(ctx: ActionCtx, i: { pool_id?: string; pool_name?: string }) {
  if (i.pool_id) {
    const row = unwrap(await ctx.db.from("talent_pools").select("id, name").eq("id", i.pool_id).maybeSingle(), "talent_pool");
    if (!row) throw new ActionError("not_found", "Talent pool not found", 404);
    return row;
  }
  if (i.pool_name) {
    const row = await findPool(ctx, i.pool_name);
    if (!row) throw new ActionError("not_found", `No talent pool called "${i.pool_name}". Use create_talent_pool first.`, 404);
    return row;
  }
  throw new ActionError("invalid_input", "Provide pool_id or pool_name");
}

/** Find-or-create a tag definition by label (case-insensitive). */
async function resolveTag(ctx: ActionCtx, label: string, category: string, create: boolean) {
  const { data } = await ctx.db.from("tag_definitions").select("id, label, category, archived").ilike("label", label.trim());
  // deno-lint-ignore no-explicit-any
  const existing = (data ?? []).find((t: any) => !t.archived) ?? (data ?? [])[0];
  if (existing) return existing;
  if (!create) throw new ActionError("not_found", `Tag "${label}" does not exist`, 404);
  return unwrap(
    await ctx.db.from("tag_definitions").insert({ label: label.trim(), category }).select("id, label, category").single(),
    "create_tag",
  );
}

export const candidateActions: ActionDef[] = [
  {
    name: "get_candidate",
    kind: "read",
    description: "Fetch one candidate by id.",
    schema: z.object({ candidate_id: uuid }),
    handler: (i, ctx) => requireCandidate(ctx, i.candidate_id),
  },
  {
    name: "search_candidates",
    kind: "read",
    description:
      "Search candidates by name, email, LinkedIn URL, current company, job title, location, tags, talent pool, last contacted and next follow-up.",
    schema: z.object({
      query: z.string().max(200).optional(),
      name: z.string().max(200).optional(),
      email: z.string().max(200).optional(),
      linkedin_url: z.string().max(400).optional(),
      current_employer: z.string().max(200).optional(),
      job_title: z.string().max(200).optional(),
      location: z.string().max(200).optional(),
      status: z.string().max(60).optional(),
      min_salary_expectation: z.number().int().optional(),
      tags: z.array(z.string().max(80)).max(20).optional(),
      talent_pool: z.string().max(120).optional(),
      contacted_since: z.string().date().optional(),
      not_contacted_since: z.string().date().optional(),
      followup_due_before: z.string().date().optional(),
      created_since: z.string().datetime().optional(),
      owner_user_id: uuid.optional(),
      include_do_not_contact: z.boolean().optional(),
      ...paging,
    }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("candidates").select(CANDIDATE_FIELDS)
        .eq("gdpr_deleted", false)
        .order("updated_at", { ascending: false })
        .range(i.offset ?? 0, (i.offset ?? 0) + (i.limit ?? 25) - 1);

      if (i.query) {
        q = q.or(
          `name.ilike.%${i.query}%,first_name.ilike.%${i.query}%,last_name.ilike.%${i.query}%,job_title.ilike.%${i.query}%,current_employer.ilike.%${i.query}%,email.ilike.%${i.query}%`,
        );
      }
      if (i.name) {
        const parts = i.name.trim().split(/\s+/);
        if (parts.length >= 2) {
          // "First Last" — match either full name or first+last independently (handles middle names / reversed order).
          q = q.or(`name.ilike.%${i.name}%,and(first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[parts.length - 1]}%)`);
        } else {
          q = q.or(`name.ilike.%${i.name}%,first_name.ilike.%${i.name}%,last_name.ilike.%${i.name}%`);
        }
      }
      if (i.created_since) q = q.gte("created_at", i.created_since);
      if (i.owner_user_id) q = q.eq("owner_user_id", i.owner_user_id);
      if (i.email) q = q.ilike("email", `%${i.email}%`);
      if (i.linkedin_url) q = q.ilike("linkedin_url", `%${i.linkedin_url}%`);
      if (i.current_employer) q = q.ilike("current_employer", `%${i.current_employer}%`);
      if (i.job_title) q = q.ilike("job_title", `%${i.job_title}%`);
      if (i.location) q = q.ilike("location", `%${i.location}%`);
      if (i.status) q = q.eq("status", i.status);
      if (typeof i.min_salary_expectation === "number") q = q.gte("salary_expectation", i.min_salary_expectation);
      if (i.followup_due_before) q = q.lte("reengage_date", i.followup_due_before);
      if (!i.include_do_not_contact) q = q.eq("do_not_contact", false);

      // Tag / talent-pool / recency filters resolve to candidate id sets first.
      const idSets: string[][] = [];
      if (i.tags?.length) {
        const { data: defs } = await ctx.db.from("tag_definitions").select("id, label").in("label", i.tags);
        const defIds = (defs ?? []).map((d: { id: string }) => d.id);
        const { data: links } = defIds.length
          ? await ctx.db.from("candidate_tags").select("candidate_id").in("tag_definition_id", defIds)
          : { data: [] };
        idSets.push([...new Set((links ?? []).map((l: { candidate_id: string }) => l.candidate_id))]);
      }
      if (i.talent_pool) {
        const { data: pools } = await ctx.db.from("talent_pools").select("id").ilike("name", `%${i.talent_pool}%`);
        const poolIds = (pools ?? []).map((p: { id: string }) => p.id);
        const { data: links } = poolIds.length
          ? await ctx.db.from("candidate_talent_pools").select("candidate_id").in("pool_id", poolIds)
          : { data: [] };
        idSets.push([...new Set((links ?? []).map((l: { candidate_id: string }) => l.candidate_id))]);
      }
      if (i.contacted_since) {
        const { data: touched } = await ctx.db.from("notes").select("candidate_id")
          .gte("created_at", i.contacted_since).not("candidate_id", "is", null);
        idSets.push([...new Set((touched ?? []).map((n: { candidate_id: string }) => n.candidate_id))]);
      }
      if (idSets.length) {
        const intersection = idSets.reduce((a, b) => a.filter((id) => b.includes(id)));
        if (!intersection.length) return { rows: [], count: 0 };
        q = q.in("id", intersection.slice(0, 1000));
      }

      const { data, error } = await q;
      if (error) return unwrap({ data: null, error }, "search_candidates");

      let rows = data ?? [];
      if (i.not_contacted_since) {
        const { data: touched } = await ctx.db.from("notes").select("candidate_id")
          .gte("created_at", i.not_contacted_since).not("candidate_id", "is", null);
        const recent = new Set((touched ?? []).map((n: { candidate_id: string }) => n.candidate_id));
        rows = rows.filter((r: { id: string }) => !recent.has(r.id));
      }
      return { rows, count: rows.length };
    },
  },
  {
    name: "create_candidate",
    kind: "write",
    description: "Create a candidate on the caller's desk. Requires at least a first name or a last name.",
    schema: z.object(candidateWritable).refine((v) => v.first_name || v.last_name, {
      message: "first_name or last_name is required",
    }),
    handler: async (i, ctx) => {
      const row = unwrap(
        await ctx.db.from("candidates")
          .insert({ ...i, owner_user_id: ctx.userId, source: i.source ?? "action_layer" })
          .select(CANDIDATE_FIELDS).single(),
        "create_candidate",
      );
      await audit(ctx, "candidate_created", { candidate_id: row.id });
      return row;
    },
  },
  {
    name: "update_candidate",
    kind: "write",
    description: "Update fields on an existing candidate.",
    schema: z.object({ candidate_id: uuid, patch: z.object(candidateWritable) }),
    handler: async (i, ctx) => {
      if (!Object.keys(i.patch).length) throw new ActionError("invalid_input", "patch is empty");
      const row = unwrap(
        await ctx.db.from("candidates").update(i.patch).eq("id", i.candidate_id).select(CANDIDATE_FIELDS).single(),
        "update_candidate",
      );
      await audit(ctx, "candidate_updated", { candidate_id: row.id, metadata: { fields: Object.keys(i.patch) } });
      return row;
    },
  },
  {
    name: "add_note",
    kind: "write",
    description: "Attach a note to exactly one of a candidate, contact, client or job.",
    schema: z.object({
      content: z.string().min(1).max(20000),
      candidate_id: uuid.optional(),
      contact_id: uuid.optional(),
      client_id: uuid.optional(),
      job_id: uuid.optional(),
      activity_type: z.string().max(60).optional(),
      outcome: z.string().max(200).optional(),
      follow_up_date: z.string().date().optional(),
      duration: z.number().int().min(0).optional(),
    }),
    handler: async (i, ctx) => {
      const targets = [i.candidate_id, i.contact_id, i.client_id, i.job_id].filter(Boolean);
      if (targets.length !== 1) {
        throw new ActionError("invalid_input", "Provide exactly one of candidate_id, contact_id, client_id or job_id");
      }
      const row = unwrap(
        await ctx.db.from("notes").insert({
          content: i.content,
          candidate_id: i.candidate_id ?? null,
          contact_id: i.contact_id ?? null,
          client_id: i.client_id ?? null,
          job_id: i.job_id ?? null,
          activity_type: i.activity_type ?? "note",
          outcome: i.outcome ?? null,
          follow_up_date: i.follow_up_date ?? null,
          duration: i.duration ?? null,
          owner_user_id: ctx.userId,
        // deno-lint-ignore no-explicit-any
        } as any).select().single(),
        "add_note",
      );
      await audit(ctx, "note_created", {
        candidate_id: i.candidate_id ?? null,
        client_id: i.client_id ?? null,
        job_id: i.job_id ?? null,
      });
      return row;
    },
  },
  {
    name: "get_notes",
    kind: "read",
    description: "List notes for a candidate, contact, client or job, newest first.",
    schema: z.object({
      candidate_id: uuid.optional(),
      contact_id: uuid.optional(),
      client_id: uuid.optional(),
      job_id: uuid.optional(),
      ...paging,
    }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("notes").select("*").order("created_at", { ascending: false }).limit(i.limit ?? 50);
      if (i.candidate_id) q = q.eq("candidate_id", i.candidate_id);
      if (i.contact_id) q = q.eq("contact_id", i.contact_id);
      if (i.client_id) q = q.eq("client_id", i.client_id);
      if (i.job_id) q = q.eq("job_id", i.job_id);
      const { data, error } = await q;
      if (error) return unwrap({ data: null, error }, "get_notes");
      return { rows: data ?? [] };
    },
  },
  {
    name: "bulk_update_candidates",
    kind: "write",
    description: "Apply the same field changes (e.g. owner_user_id, status, location) to several candidates at once.",
    schema: z.object({ candidate_ids: z.array(uuid).min(1).max(200), patch: z.object(candidateWritable) }),
    preview: async (i, ctx) => {
      const { data } = await ctx.db.from("candidates").select("id, name, job_title, owner_user_id").in("id", i.candidate_ids);
      return {
        affected: data ?? [],
        summary: `Update ${data?.length ?? 0} candidate(s): set ${Object.keys(i.patch).join(", ")}`,
      };
    },
    handler: async (i, ctx) => {
      if (!Object.keys(i.patch).length) throw new ActionError("invalid_input", "patch is empty");
      const { data, error } = await ctx.db.from("candidates").update(i.patch).in("id", i.candidate_ids).select("id, name, owner_user_id, status");
      if (error) return unwrap({ data: null, error }, "bulk_update_candidates");
      for (const r of data ?? []) {
        await audit(ctx, "candidate_updated", { candidate_id: r.id, metadata: { fields: Object.keys(i.patch), bulk: true } });
      }
      return { updated: (data ?? []).length, rows: data ?? [] };
    },
  },

  // ---- Tags -----------------------------------------------------------
  {
    name: "list_tags",
    kind: "read",
    description: "List the tag definitions available to apply to candidates and jobs.",
    schema: z.object({ query: z.string().max(80).optional() }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("tag_definitions").select("id, label, category").eq("archived", false).order("category").order("position");
      if (i.query) q = q.ilike("label", `%${i.query}%`);
      const { data } = await q;
      return { rows: data ?? [] };
    },
  },
  {
    name: "add_candidate_tag",
    kind: "write",
    description: "Add a tag to one or more candidates. Reuses an existing tag with the same label; creates it only if create_if_missing is true.",
    schema: z.object({
      candidate_ids: z.array(uuid).min(1).max(200),
      tag: z.string().min(1).max(80),
      category: z.string().max(60).optional(),
      create_if_missing: z.boolean().optional(),
    }),
    handler: async (i, ctx) => {
      const def = await resolveTag(ctx, i.tag, i.category ?? "Skill", i.create_if_missing ?? true);
      const rows = i.candidate_ids.map((candidate_id: string) => ({ candidate_id, tag_definition_id: def.id, source: "action_layer" }));
      const { error } = await ctx.db.from("candidate_tags").upsert(rows, { onConflict: "candidate_id,tag_definition_id", ignoreDuplicates: true });
      if (error) return unwrap({ data: null, error }, "add_candidate_tag");
      for (const cid of i.candidate_ids) await audit(ctx, "candidate_tagged", { candidate_id: cid, metadata: { tag: def.label } });
      return { tag: def, candidate_ids: i.candidate_ids };
    },
  },
  {
    name: "remove_candidate_tag",
    kind: "write",
    description: "Remove a tag from one or more candidates.",
    schema: z.object({ candidate_ids: z.array(uuid).min(1).max(200), tag: z.string().min(1).max(80) }),
    handler: async (i, ctx) => {
      const def = await resolveTag(ctx, i.tag, "Skill", false);
      const { data, error } = await ctx.db.from("candidate_tags").delete()
        .eq("tag_definition_id", def.id).in("candidate_id", i.candidate_ids).select("candidate_id");
      if (error) return unwrap({ data: null, error }, "remove_candidate_tag");
      return { tag: def, removed: (data ?? []).length, candidate_ids: i.candidate_ids };
    },
  },

  // ---- Talent pools ---------------------------------------------------
  {
    name: "search_talent_pools",
    kind: "read",
    description: "List talent pools (optionally filtered by name) with member counts.",
    schema: z.object({ query: z.string().max(120).optional() }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("talent_pools").select("id, name, description, target_size, created_at").order("name");
      if (i.query) q = q.ilike("name", `%${i.query}%`);
      const { data } = await q;
      const pools = data ?? [];
      const { data: links } = await ctx.db.from("candidate_talent_pools").select("pool_id");
      const counts = new Map<string, number>();
      for (const l of links ?? []) counts.set(l.pool_id, (counts.get(l.pool_id) ?? 0) + 1);
      // deno-lint-ignore no-explicit-any
      return { rows: pools.map((p: any) => ({ ...p, member_count: counts.get(p.id) ?? 0 })) };
    },
  },
  {
    name: "create_talent_pool",
    kind: "write",
    description: "Create a talent pool. If a pool with an equivalent name already exists it is returned instead of creating a duplicate.",
    schema: z.object({ name: z.string().min(1).max(120), description: z.string().max(2000).optional() }),
    handler: async (i, ctx) => {
      const existing = await findPool(ctx, i.name);
      if (existing) return { ...existing, existed: true };
      const row = unwrap(
        await ctx.db.from("talent_pools").insert({ owner_user_id: ctx.userId, name: i.name.trim(), description: i.description ?? null })
          .select("id, name, description").single(),
        "create_talent_pool",
      );
      await audit(ctx, "talent_pool_created", { metadata: { pool_id: row.id, name: row.name } });
      return { ...row, existed: false };
    },
  },
  {
    name: "add_candidates_to_talent_pool",
    kind: "write",
    description: "Add one or more candidates to a talent pool (by pool_id or pool_name). Already-members are skipped.",
    schema: z.object({ candidate_ids: z.array(uuid).min(1).max(200), pool_id: uuid.optional(), pool_name: z.string().max(120).optional() }),
    preview: async (i, ctx) => {
      const pool = await requirePool(ctx, i);
      const { data } = await ctx.db.from("candidates").select("id, name").in("id", i.candidate_ids);
      return { affected: data ?? [], summary: `Add ${data?.length ?? 0} candidate(s) to talent pool "${pool.name}"` };
    },
    handler: async (i, ctx) => {
      const pool = await requirePool(ctx, i);
      const rows = i.candidate_ids.map((candidate_id: string) => ({ candidate_id, pool_id: pool.id, owner_user_id: ctx.userId, added_by: ctx.userId }));
      const { error } = await ctx.db.from("candidate_talent_pools").upsert(rows, { onConflict: "candidate_id,pool_id", ignoreDuplicates: true });
      if (error) return unwrap({ data: null, error }, "add_candidates_to_talent_pool");
      for (const cid of i.candidate_ids) await audit(ctx, "talent_pool_added", { candidate_id: cid, metadata: { pool_id: pool.id, pool: pool.name } });
      return { pool, candidate_ids: i.candidate_ids };
    },
  },
  {
    name: "remove_candidates_from_talent_pool",
    kind: "write",
    description: "Remove one or more candidates from a talent pool.",
    schema: z.object({ candidate_ids: z.array(uuid).min(1).max(200), pool_id: uuid.optional(), pool_name: z.string().max(120).optional() }),
    preview: async (i, ctx) => {
      const pool = await requirePool(ctx, i);
      const { data } = await ctx.db.from("candidate_talent_pools").select("candidate_id").eq("pool_id", pool.id).in("candidate_id", i.candidate_ids);
      return { affected: data ?? [], summary: `Remove ${data?.length ?? 0} candidate(s) from talent pool "${pool.name}"` };
    },
    handler: async (i, ctx) => {
      const pool = await requirePool(ctx, i);
      const { data, error } = await ctx.db.from("candidate_talent_pools").delete()
        .eq("pool_id", pool.id).in("candidate_id", i.candidate_ids).select("candidate_id");
      if (error) return unwrap({ data: null, error }, "remove_candidates_from_talent_pool");
      return { pool, removed: (data ?? []).length, candidate_ids: i.candidate_ids };
    },
  },
  {
    name: "list_talent_pool_candidates",
    kind: "read",
    description: "List the candidates in a talent pool.",
    schema: z.object({ pool_id: uuid.optional(), pool_name: z.string().max(120).optional(), ...paging }),
    handler: async (i, ctx) => {
      const pool = await requirePool(ctx, i);
      const { data } = await ctx.db.from("candidate_talent_pools")
        .select("added_at, candidate:candidates(id, name, job_title, current_employer, location, email, do_not_contact)")
        .eq("pool_id", pool.id).limit(i.limit ?? 100);
      return { pool, rows: data ?? [] };
    },
  },
];
