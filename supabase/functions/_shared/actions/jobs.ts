// Job and pipeline read actions. Stages always come from the job's own
// job_stages rows — the action layer never introduces a second stage list.
import { type ActionCtx, type ActionDef, ActionError, paging, unwrap, uuid, z } from "./core.ts";

const JOB_FIELDS =
  "id, title, client_id, location, salary_min, salary_max, job_type, status, fee_type, fee_value, date_opened, description, key_skills, similar_titles, intake_summary, launch_hook, ideal_candidate_line, search_launched_at, launch_summary, created_at, updated_at";

export async function jobStages(ctx: ActionCtx, jobId: string): Promise<string[]> {
  const { data } = await ctx.db.from("job_stages").select("stage_name, stage_order")
    .eq("job_id", jobId).order("stage_order", { ascending: true });
  return (data ?? []).map((s: { stage_name: string }) => s.stage_name);
}

export const jobActions: ActionDef[] = [
  {
    name: "get_job",
    kind: "read",
    description: "Fetch one job by id, including its configured pipeline stages.",
    schema: z.object({ job_id: uuid }),
    handler: async (i, ctx) => {
      const row = unwrap(await ctx.db.from("jobs").select(JOB_FIELDS).eq("id", i.job_id).maybeSingle(), "get_job");
      if (!row) throw new ActionError("not_found", "Job not found", 404);
      return { ...row, stages: await jobStages(ctx, i.job_id) };
    },
  },
  {
    name: "search_jobs",
    kind: "read",
    description: "Search jobs by title, status, client or location.",
    schema: z.object({
      query: z.string().max(200).optional(),
      status: z.string().max(60).optional(),
      client_id: uuid.optional(),
      location: z.string().max(200).optional(),
      ...paging,
    }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("jobs").select(`${JOB_FIELDS}, client:clients(id, company_name)`)
        .order("updated_at", { ascending: false })
        .range(i.offset ?? 0, (i.offset ?? 0) + (i.limit ?? 25) - 1);
      if (i.query) q = q.ilike("title", `%${i.query}%`);
      if (i.status) q = q.eq("status", i.status);
      if (i.client_id) q = q.eq("client_id", i.client_id);
      if (i.location) q = q.ilike("location", `%${i.location}%`);
      const { data, error } = await q;
      if (error) return unwrap({ data: null, error }, "search_jobs");
      return { rows: data ?? [] };
    },
  },
  {
    name: "get_open_jobs",
    kind: "read",
    description: "List jobs that are currently open (Active or On Hold).",
    schema: z.object({ include_on_hold: z.boolean().optional(), ...paging }),
    handler: async (i, ctx) => {
      const statuses = i.include_on_hold === false ? ["Active"] : ["Active", "On Hold"];
      const { data, error } = await ctx.db.from("jobs").select(JOB_FIELDS)
        .in("status", statuses)
        .order("date_opened", { ascending: false })
        .limit(i.limit ?? 50);
      if (error) return unwrap({ data: null, error }, "get_open_jobs");
      return { rows: data ?? [] };
    },
  },
  {
    name: "get_candidates_for_job",
    kind: "read",
    description: "List the candidates linked to a job with their current stage.",
    schema: z.object({ job_id: uuid, stage: z.string().max(80).optional(), include_withdrawn: z.boolean().optional() }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("candidate_jobs")
        .select(
          "id, stage, stage_changed_at, source, withdrawn, withdrawn_reason, interview_date, ai_suggested, ai_suggested_score, candidate:candidates(id, name, job_title, current_employer, email, linkedin_url, location, do_not_contact)",
        )
        .eq("job_id", i.job_id);
      if (i.stage) q = q.eq("stage", i.stage);
      if (!i.include_withdrawn) q = q.eq("withdrawn", false);
      const { data, error } = await q;
      if (error) return unwrap({ data: null, error }, "get_candidates_for_job");
      return { rows: data ?? [] };
    },
  },
  {
    name: "get_pipeline_for_job",
    kind: "read",
    description: "Return the job's pipeline grouped by its configured stages, with counts.",
    schema: z.object({ job_id: uuid, include_withdrawn: z.boolean().optional() }),
    handler: async (i, ctx) => {
      const stages = await jobStages(ctx, i.job_id);
      let q = ctx.db.from("candidate_jobs")
        .select("id, stage, withdrawn, candidate:candidates(id, name, job_title, current_employer)")
        .eq("job_id", i.job_id);
      if (!i.include_withdrawn) q = q.eq("withdrawn", false);
      const { data, error } = await q;
      if (error) return unwrap({ data: null, error }, "get_pipeline_for_job");
      const rows = data ?? [];
      return {
        stages: stages.map((name) => {
          // deno-lint-ignore no-explicit-any
          const items = rows.filter((r: any) => r.stage === name);
          return { stage: name, count: items.length, applications: items };
        }),
        total: rows.length,
      };
    },
  },
  {
    name: "get_job_activity",
    kind: "read",
    description: "Timeline of notes and logged changes for a job, newest first.",
    schema: z.object({ job_id: uuid, ...paging }),
    handler: async (i, ctx) => {
      const limit = i.limit ?? 50;
      const [{ data: notes }, { data: log }] = await Promise.all([
        ctx.db.from("notes").select("*").eq("job_id", i.job_id).order("created_at", { ascending: false }).limit(limit),
        ctx.db.from("activity_log").select("*").eq("job_id", i.job_id).order("created_at", { ascending: false }).limit(limit),
      ]);
      return { notes: notes ?? [], changes: log ?? [] };
    },
  },
];
