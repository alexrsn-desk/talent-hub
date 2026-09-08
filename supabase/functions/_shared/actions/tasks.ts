// Tasks and structured follow-ups. Uses the existing todo_tasks table
// (extended with candidate/contact/client/job links, reason, kind and status)
// so the To-do list UI and agent follow-ups share one model.
import { type ActionDef, ActionError, audit, unwrap, uuid, z } from "./core.ts";

const TASK_FIELDS =
  "id, title, due_date, priority, position, completed, completed_at, recurrence, kind, status, reason, source, candidate_id, contact_id, client_id, job_id, created_at";

const taskWritable = {
  title: z.string().min(1).max(300).optional(),
  due_date: z.string().date().optional().nullable(),
  priority: z.string().max(30).optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  kind: z.enum(["task", "followup"]).optional(),
  status: z.enum(["open", "snoozed", "done", "cancelled"]).optional(),
  candidate_id: uuid.optional().nullable(),
  contact_id: uuid.optional().nullable(),
  client_id: uuid.optional().nullable(),
  job_id: uuid.optional().nullable(),
  /** Assign the task to another team member (see list_team_members). */
  owner_user_id: uuid.optional(),
};

export const taskActions: ActionDef[] = [
  {
    name: "create_task",
    kind: "write",
    description:
      'Create a task or structured follow-up against a candidate/contact/company/job, e.g. "not looking now, contact again in three months".',
    schema: z.object({ ...taskWritable, title: z.string().min(1).max(300) }),
    handler: async (i, ctx) => {
      const row = unwrap(
        await ctx.db.from("todo_tasks").insert({
          ...i,
          kind: i.kind ?? "task",
          status: i.status ?? "open",
          source: "action_layer",
          user_id: i.owner_user_id ?? ctx.userId,
          owner_user_id: i.owner_user_id ?? ctx.userId,
        // deno-lint-ignore no-explicit-any
        } as any).select(TASK_FIELDS).single(),
        "create_task",
      );
      await audit(ctx, "task_created", {
        candidate_id: i.candidate_id ?? null, client_id: i.client_id ?? null, job_id: i.job_id ?? null,
        metadata: { task_id: row.id, kind: row.kind, due_date: row.due_date },
      });
      return row;
    },
  },
  {
    name: "update_task",
    kind: "write",
    description: "Update a task or follow-up (title, due date, owner context, reason or status).",
    schema: z.object({ task_id: uuid, patch: z.object(taskWritable) }),
    handler: async (i, ctx) => {
      if (!Object.keys(i.patch).length) throw new ActionError("invalid_input", "patch is empty");
      const row = unwrap(
        await ctx.db.from("todo_tasks").update(i.patch).eq("id", i.task_id).select(TASK_FIELDS).single(),
        "update_task",
      );
      await audit(ctx, "task_updated", { metadata: { task_id: row.id, fields: Object.keys(i.patch) } });
      return row;
    },
  },
  {
    name: "complete_task",
    kind: "write",
    description: "Mark a task or follow-up complete.",
    schema: z.object({ task_id: uuid, outcome: z.string().max(2000).optional() }),
    handler: async (i, ctx) => {
      const row = unwrap(
        await ctx.db.from("todo_tasks").update({
          completed: true, completed_at: new Date().toISOString(), status: "done",
        // deno-lint-ignore no-explicit-any
        } as any).eq("id", i.task_id).select(TASK_FIELDS).single(),
        "complete_task",
      );
      await audit(ctx, "task_completed", { metadata: { task_id: row.id, outcome: i.outcome ?? null } });
      return row;
    },
  },
  {
    name: "get_due_followups",
    kind: "read",
    description:
      "List follow-ups and tasks due on or before a date, plus candidate/contact re-engage dates that have come around.",
    schema: z.object({
      due_before: z.string().date().optional(),
      include_tasks: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    handler: async (i, ctx) => {
      const due = i.due_before ?? new Date().toISOString().slice(0, 10);
      const limit = i.limit ?? 50;
      let q = ctx.db.from("todo_tasks").select(TASK_FIELDS)
        .eq("completed", false).lte("due_date", due)
        .order("due_date", { ascending: true }).limit(limit);
      if (i.include_tasks === false) q = q.eq("kind", "followup");
      const [{ data: tasks }, { data: candidates }, { data: contacts }] = await Promise.all([
        q,
        ctx.db.from("candidates").select("id, name, email, reengage_date, reengage_reason")
          .not("reengage_date", "is", null).lte("reengage_date", due).limit(limit),
        ctx.db.from("contacts").select("id, name, email, reengage_date, reengage_reason, bd_next_followup_date")
          .not("reengage_date", "is", null).lte("reengage_date", due).limit(limit),
      ]);
      return {
        tasks: tasks ?? [],
        candidate_reengagements: candidates ?? [],
        contact_reengagements: contacts ?? [],
      };
    },
  },
  {
    name: "reopen_task",
    kind: "write",
    description: "Reopen a completed or cancelled task / follow-up.",
    schema: z.object({ task_id: uuid }),
    handler: async (i, ctx) => {
      const row = unwrap(
        await ctx.db.from("todo_tasks").update({ completed: false, completed_at: null, status: "open" } as any)
          .eq("id", i.task_id).select(TASK_FIELDS).single(),
        "reopen_task",
      );
      await audit(ctx, "task_reopened", { metadata: { task_id: row.id } });
      return row;
    },
  },
  {
    name: "search_tasks",
    kind: "read",
    description:
      "Find tasks and follow-ups: open, overdue, due in a date range, linked to a candidate/contact/company/job, or by title text. Use this to find the task to complete or change.",
    schema: z.object({
      query: z.string().max(200).optional(),
      candidate_id: uuid.optional(),
      contact_id: uuid.optional(),
      client_id: uuid.optional(),
      job_id: uuid.optional(),
      status: z.enum(["open", "overdue", "done", "all"]).optional(),
      due_from: z.string().date().optional(),
      due_to: z.string().date().optional(),
      kind: z.enum(["task", "followup"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("todo_tasks").select(TASK_FIELDS).order("due_date", { ascending: true, nullsFirst: false }).limit(i.limit ?? 50);
      const status = i.status ?? "open";
      if (status === "open") q = q.eq("completed", false);
      if (status === "done") q = q.eq("completed", true);
      if (status === "overdue") q = q.eq("completed", false).lt("due_date", new Date().toISOString().slice(0, 10));
      if (i.query) q = q.ilike("title", `%${i.query}%`);
      if (i.candidate_id) q = q.eq("candidate_id", i.candidate_id);
      if (i.contact_id) q = q.eq("contact_id", i.contact_id);
      if (i.client_id) q = q.eq("client_id", i.client_id);
      if (i.job_id) q = q.eq("job_id", i.job_id);
      if (i.kind) q = q.eq("kind", i.kind);
      if (i.due_from) q = q.gte("due_date", i.due_from);
      if (i.due_to) q = q.lte("due_date", i.due_to);
      const { data, error } = await q;
      if (error) return unwrap({ data: null, error }, "search_tasks");
      return { rows: data ?? [] };
    },
  },
  {
    name: "bulk_create_followups",
    kind: "write",
    description: "Create one follow-up per candidate (or contact) with the same title, due date and reason — e.g. follow-ups for everyone in a list next Monday.",
    schema: z.object({
      title: z.string().min(1).max(300),
      due_date: z.string().date(),
      reason: z.string().max(2000).optional(),
      candidate_ids: z.array(uuid).max(200).optional(),
      contact_ids: z.array(uuid).max(200).optional(),
      job_id: uuid.optional(),
      owner_user_id: uuid.optional(),
    }),
    preview: async (i, ctx) => {
      const [{ data: c }, { data: k }] = await Promise.all([
        i.candidate_ids?.length ? ctx.db.from("candidates").select("id, name").in("id", i.candidate_ids) : Promise.resolve({ data: [] }),
        i.contact_ids?.length ? ctx.db.from("contacts").select("id, name").in("id", i.contact_ids) : Promise.resolve({ data: [] }),
      ]);
      const affected = [...(c ?? []), ...(k ?? [])];
      return { affected, summary: `Create ${affected.length} follow-up(s) due ${i.due_date}` };
    },
    handler: async (i, ctx) => {
      const owner = i.owner_user_id ?? ctx.userId;
      const base = { title: i.title, due_date: i.due_date, reason: i.reason ?? null, kind: "followup", status: "open", source: "action_layer", user_id: owner, owner_user_id: owner, job_id: i.job_id ?? null };
      const rows = [
        ...(i.candidate_ids ?? []).map((candidate_id) => ({ ...base, candidate_id })),
        ...(i.contact_ids ?? []).map((contact_id) => ({ ...base, contact_id })),
      ];
      if (!rows.length) throw new ActionError("invalid_input", "Provide candidate_ids or contact_ids");
      const { data, error } = await ctx.db.from("todo_tasks").insert(rows as any).select(TASK_FIELDS);
      if (error) return unwrap({ data: null, error }, "bulk_create_followups");
      for (const r of data ?? []) {
        await audit(ctx, "task_created", { candidate_id: r.candidate_id, job_id: r.job_id, metadata: { task_id: r.id, kind: "followup", bulk: true } });
      }
      return { created: (data ?? []).length, rows: data ?? [] };
    },
  },
];
