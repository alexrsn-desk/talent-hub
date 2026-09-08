// Contact and company (client) actions.
import { type ActionDef, ActionError, audit, paging, unwrap, uuid, z } from "./core.ts";

const CONTACT_FIELDS =
  "id, client_id, first_name, last_name, name, job_title, email, personal_email, phone, mobile_phone, direct_phone, linkedin_url, status, summary, source, do_not_contact, dnc_reason, bd_status, bd_last_touch_date, bd_next_followup_date, bd_conversation_notes, relationship_score, reengage_date, reengage_reason, created_at";

const COMPANY_FIELDS =
  "id, company_name, contact_name, job_title, email, phone, linkedin_url, sector, status, website, location, summary, heat, last_activity_date, next_action, next_action_due_date, next_followup_date, created_at, updated_at";

const contactWritable = {
  client_id: uuid.optional().nullable(),
  first_name: z.string().max(120).optional(),
  last_name: z.string().max(120).optional(),
  job_title: z.string().max(200).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  personal_email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  mobile_phone: z.string().max(50).optional().nullable(),
  direct_phone: z.string().max(50).optional().nullable(),
  linkedin_url: z.string().url().max(400).optional().nullable(),
  status: z.string().max(60).optional(),
  summary: z.string().max(8000).optional().nullable(),
  bd_status: z.string().max(60).optional().nullable(),
  bd_conversation_notes: z.string().max(8000).optional().nullable(),
  bd_next_followup_date: z.string().date().optional().nullable(),
  reengage_date: z.string().date().optional().nullable(),
  reengage_reason: z.string().max(500).optional().nullable(),
  owner_user_id: uuid.optional(),
};

const normName = (s: string) => s.toLowerCase().replace(/\b(ltd|limited|plc|inc|llc|gmbh|the)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const companyWritable = {
  company_name: z.string().min(1).max(200).optional(),
  contact_name: z.string().max(200).optional().nullable(),
  job_title: z.string().max(200).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  linkedin_url: z.string().url().max(400).optional().nullable(),
  sector: z.string().max(120).optional().nullable(),
  status: z.string().max(60).optional(),
  website: z.string().max(400).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  summary: z.string().max(8000).optional().nullable(),
  next_action: z.string().max(400).optional().nullable(),
  next_action_due_date: z.string().date().optional().nullable(),
  next_followup_date: z.string().date().optional().nullable(),
  heat: z.string().max(30).optional().nullable(),
  owner_user_id: uuid.optional(),
};

export const crmActions: ActionDef[] = [
  {
    name: "get_contact",
    kind: "read",
    description: "Fetch one contact by id.",
    schema: z.object({ contact_id: uuid }),
    handler: async (i, ctx) => {
      const row = unwrap(
        await ctx.db.from("contacts").select(CONTACT_FIELDS).eq("id", i.contact_id).maybeSingle(),
        "get_contact",
      );
      if (!row) throw new ActionError("not_found", "Contact not found", 404);
      return row;
    },
  },
  {
    name: "search_contacts",
    kind: "read",
    description: "Search contacts by name, email, job title, company or BD status.",
    schema: z.object({
      query: z.string().max(200).optional(),
      email: z.string().max(200).optional(),
      job_title: z.string().max(200).optional(),
      client_id: uuid.optional(),
      bd_status: z.string().max(60).optional(),
      followup_due_before: z.string().date().optional(),
      include_do_not_contact: z.boolean().optional(),
      ...paging,
    }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("contacts").select(CONTACT_FIELDS)
        .eq("gdpr_deleted", false)
        .order("created_at", { ascending: false })
        .range(i.offset ?? 0, (i.offset ?? 0) + (i.limit ?? 25) - 1);
      if (i.query) q = q.or(`name.ilike.%${i.query}%,email.ilike.%${i.query}%,job_title.ilike.%${i.query}%`);
      if (i.email) q = q.ilike("email", `%${i.email}%`);
      if (i.job_title) q = q.ilike("job_title", `%${i.job_title}%`);
      if (i.client_id) q = q.eq("client_id", i.client_id);
      if (i.bd_status) q = q.eq("bd_status", i.bd_status);
      if (i.followup_due_before) q = q.lte("bd_next_followup_date", i.followup_due_before);
      if (!i.include_do_not_contact) q = q.eq("do_not_contact", false);
      const { data, error } = await q;
      if (error) return unwrap({ data: null, error }, "search_contacts");
      return { rows: data ?? [] };
    },
  },
  {
    name: "create_contact",
    kind: "write",
    description: "Create a contact, optionally linked to a company.",
    schema: z.object(contactWritable).refine((v) => v.first_name || v.last_name, {
      message: "first_name or last_name is required",
    }),
    handler: async (i, ctx) => {
      const row = unwrap(
        await ctx.db.from("contacts").insert({ ...i, owner_user_id: ctx.userId, source: "action_layer" })
          .select(CONTACT_FIELDS).single(),
        "create_contact",
      );
      await audit(ctx, "contact_created", { client_id: row.client_id ?? null, metadata: { contact_id: row.id } });
      return row;
    },
  },
  {
    name: "update_contact",
    kind: "write",
    description: "Update fields on an existing contact.",
    schema: z.object({ contact_id: uuid, patch: z.object(contactWritable) }),
    handler: async (i, ctx) => {
      if (!Object.keys(i.patch).length) throw new ActionError("invalid_input", "patch is empty");
      const row = unwrap(
        await ctx.db.from("contacts").update(i.patch).eq("id", i.contact_id).select(CONTACT_FIELDS).single(),
        "update_contact",
      );
      await audit(ctx, "contact_updated", { metadata: { contact_id: row.id, fields: Object.keys(i.patch) } });
      return row;
    },
  },
  {
    name: "get_company",
    kind: "read",
    description: "Fetch one company (client) by id, with its contacts.",
    schema: z.object({ company_id: uuid, include_contacts: z.boolean().optional() }),
    handler: async (i, ctx) => {
      const row = unwrap(
        await ctx.db.from("clients").select(COMPANY_FIELDS).eq("id", i.company_id).maybeSingle(),
        "get_company",
      );
      if (!row) throw new ActionError("not_found", "Company not found", 404);
      if (!i.include_contacts) return row;
      const { data: contacts } = await ctx.db.from("contacts").select(CONTACT_FIELDS).eq("client_id", i.company_id);
      return { ...row, contacts: contacts ?? [] };
    },
  },
  {
    name: "search_companies",
    kind: "read",
    description: "Search companies by name, sector, location or status.",
    schema: z.object({
      query: z.string().max(200).optional(),
      sector: z.string().max(120).optional(),
      status: z.string().max(60).optional(),
      location: z.string().max(200).optional(),
      ...paging,
    }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("clients").select(COMPANY_FIELDS)
        .order("updated_at", { ascending: false })
        .range(i.offset ?? 0, (i.offset ?? 0) + (i.limit ?? 25) - 1);
      if (i.query) q = q.ilike("company_name", `%${i.query}%`);
      if (i.sector) q = q.ilike("sector", `%${i.sector}%`);
      if (i.status) q = q.eq("status", i.status);
      if (i.location) q = q.ilike("location", `%${i.location}%`);
      const { data, error } = await q;
      if (error) return unwrap({ data: null, error }, "search_companies");
      return { rows: data ?? [] };
    },
  },
  {
    name: "create_company",
    kind: "write",
    description:
      "Create a company (client) record. Refuses with code duplicate_company (returning the match) if a company with an equivalent name already exists, unless allow_duplicate is true.",
    schema: z.object({ ...companyWritable, company_name: z.string().min(1).max(200), allow_duplicate: z.boolean().optional() }),
    handler: async (i, ctx) => {
      const { allow_duplicate, ...fields } = i;
      if (!allow_duplicate) {
        const { data } = await ctx.db.from("clients").select("id, company_name, status").ilike("company_name", `%${fields.company_name.split(/\s+/)[0]}%`).limit(50);
        const target = normName(fields.company_name);
        // deno-lint-ignore no-explicit-any
        const dup = (data ?? []).find((c: any) => normName(c.company_name) === target);
        if (dup) {
          throw new ActionError("duplicate_company", `A company called "${dup.company_name}" already exists (id ${dup.id}). Use it, or pass allow_duplicate.`, 409);
        }
      }
      const row = unwrap(
        await ctx.db.from("clients").insert({ ...fields, owner_user_id: fields.owner_user_id ?? ctx.userId }).select(COMPANY_FIELDS).single(),
        "create_company",
      );
      await audit(ctx, "client_created", { client_id: row.id });
      return row;
    },
  },
  {
    name: "update_company",
    kind: "write",
    description: "Update fields on an existing company (client), including status, heat, next action or owner.",
    schema: z.object({ company_id: uuid, patch: z.object(companyWritable) }),
    handler: async (i, ctx) => {
      if (!Object.keys(i.patch).length) throw new ActionError("invalid_input", "patch is empty");
      const row = unwrap(
        await ctx.db.from("clients").update(i.patch).eq("id", i.company_id).select(COMPANY_FIELDS).single(),
        "update_company",
      );
      await audit(ctx, "client_updated", { client_id: row.id, metadata: { fields: Object.keys(i.patch) } });
      return row;
    },
  },
  {
    name: "get_company_activity",
    kind: "read",
    description: "Everything attached to a company: its contacts, jobs, recent notes and logged changes.",
    schema: z.object({ company_id: uuid, ...paging }),
    handler: async (i, ctx) => {
      const limit = i.limit ?? 50;
      const [{ data: contacts }, { data: jobs }, { data: notes }, { data: log }] = await Promise.all([
        ctx.db.from("contacts").select(CONTACT_FIELDS).eq("client_id", i.company_id),
        ctx.db.from("jobs").select("id, title, status, location, date_opened").eq("client_id", i.company_id).order("created_at", { ascending: false }),
        ctx.db.from("notes").select("*").eq("client_id", i.company_id).order("created_at", { ascending: false }).limit(limit),
        ctx.db.from("activity_log").select("*").eq("client_id", i.company_id).order("created_at", { ascending: false }).limit(limit),
      ]);
      return { contacts: contacts ?? [], jobs: jobs ?? [], notes: notes ?? [], changes: log ?? [] };
    },
  },
  {
    name: "get_contact_activity",
    kind: "read",
    description: "Recent notes and touchpoints for a contact, newest first.",
    schema: z.object({ contact_id: uuid, ...paging }),
    handler: async (i, ctx) => {
      const limit = i.limit ?? 50;
      const [{ data: notes }, { data: events }] = await Promise.all([
        ctx.db.from("notes").select("*").eq("contact_id", i.contact_id).order("created_at", { ascending: false }).limit(limit),
        ctx.db.from("activity_events").select("*").eq("contact_id", i.contact_id).order("occurred_at", { ascending: false }).limit(limit),
      ]);
      return { notes: notes ?? [], touchpoints: events ?? [] };
    },
  },
  {
    name: "list_team_members",
    kind: "read",
    description: "List the people records can be owned by: the signed-in user plus their team. Use the returned user_id as owner_user_id.",
    schema: z.object({}),
    handler: async (_i, ctx) => {
      const [{ data: me }, { data: team }] = await Promise.all([
        ctx.db.from("recruiter_profiles").select("user_id, display_name").eq("user_id", ctx.userId).maybeSingle(),
        ctx.db.from("team_members").select("manager_user_id, member_user_id, name, email, active")
          .or(`manager_user_id.eq.${ctx.userId},member_user_id.eq.${ctx.userId}`).eq("active", true),
      ]);
      const rows: { user_id: string; name: string; email?: string | null; relation: string }[] = [
        { user_id: ctx.userId, name: me?.display_name ?? "Me", relation: "self" },
      ];
      for (const t of team ?? []) {
        if (t.member_user_id !== ctx.userId) rows.push({ user_id: t.member_user_id, name: t.name, email: t.email, relation: "team member" });
        if (t.manager_user_id !== ctx.userId && !rows.some((r) => r.user_id === t.manager_user_id)) {
          rows.push({ user_id: t.manager_user_id, name: "Manager", relation: "manager" });
        }
      }
      return { rows };
    },
  },
];
