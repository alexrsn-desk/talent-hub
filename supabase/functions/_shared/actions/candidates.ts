// Candidate, note and candidate-activity actions.
import { type ActionCtx, type ActionDef, ActionError, audit, paging, unwrap, uuid, z } from "./core.ts";

const CANDIDATE_FIELDS =
  "id, first_name, last_name, name, job_title, current_employer, location, email, phone, linkedin_url, status, source, salary_current, salary_expectation, notice_period, availability, summary, client_ready_notes, reengage_date, reengage_reason, do_not_contact, dnc_reason, relationship_score, created_at, updated_at";

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
};

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
          `name.ilike.%${i.query}%,job_title.ilike.%${i.query}%,current_employer.ilike.%${i.query}%,email.ilike.%${i.query}%`,
        );
      }
      if (i.name) q = q.ilike("name", `%${i.name}%`);
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
];
