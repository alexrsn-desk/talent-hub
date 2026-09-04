// Application (candidate_jobs) actions plus the recruitment milestones that
// hang off them: submissions, interviews and placements.
import { type ActionCtx, type ActionDef, ActionError, audit, unwrap, uuid, z } from "./core.ts";
import { jobStages } from "./jobs.ts";

const APP_FIELDS =
  "id, candidate_id, job_id, stage, stage_changed_at, interview_date, source, withdrawn, withdrawn_reason, withdrawn_at, rejection_reason, ai_suggested, ai_suggested_score, ai_suggested_reason, created_at";

async function assertStage(ctx: ActionCtx, jobId: string, stage: string) {
  const stages = await jobStages(ctx, jobId);
  if (stages.length && !stages.includes(stage)) {
    throw new ActionError("invalid_stage", `Stage "${stage}" is not configured for this job. Valid: ${stages.join(", ")}`);
  }
}

async function getApp(ctx: ActionCtx, id: string) {
  const row = unwrap(await ctx.db.from("candidate_jobs").select(APP_FIELDS).eq("id", id).maybeSingle(), "get_application");
  if (!row) throw new ActionError("not_found", "Application not found", 404);
  return row;
}

async function resolveApp(ctx: ActionCtx, i: { application_id?: string; candidate_id?: string; job_id?: string }): Promise<any> {
  if (i.application_id) return await getApp(ctx, i.application_id);
  if (i.candidate_id && i.job_id) {
    const row = unwrap(
      await ctx.db.from("candidate_jobs").select(APP_FIELDS)
        .eq("candidate_id", i.candidate_id).eq("job_id", i.job_id).maybeSingle(),
      "get_application",
    );
    if (!row) throw new ActionError("not_found", "Candidate is not on this job", 404);
    return row;
  }
  throw new ActionError("invalid_input", "Provide application_id, or candidate_id plus job_id");
}

export const applicationActions: ActionDef[] = [
  {
    name: "get_application",
    kind: "read",
    description: "Fetch one application by id, or by candidate_id + job_id.",
    schema: z.object({ application_id: uuid.optional(), candidate_id: uuid.optional(), job_id: uuid.optional() }),
    handler: (i, ctx) => resolveApp(ctx, i),
  },
  {
    name: "add_candidate_to_job",
    kind: "write",
    description: "Add a candidate to a job pipeline at one of that job's configured stages.",
    schema: z.object({
      candidate_id: uuid,
      job_id: uuid,
      stage: z.string().max(80).optional(),
      source: z.string().max(80).optional(),
    }),
    handler: async (i, ctx) => {
      const stages = await jobStages(ctx, i.job_id);
      const stage = i.stage ?? stages.find((s) => s !== "AI Suggested") ?? stages[0] ?? "Shortlist";
      await assertStage(ctx, i.job_id, stage);
      const { data: existing } = await ctx.db.from("candidate_jobs").select(APP_FIELDS)
        .eq("candidate_id", i.candidate_id).eq("job_id", i.job_id).maybeSingle();
      if (existing) {
        throw new ActionError("already_in_pipeline", `Candidate is already in this pipeline at ${existing.stage}`, 409);
      }
      const row = unwrap(
        await ctx.db.from("candidate_jobs").insert({
          candidate_id: i.candidate_id,
          job_id: i.job_id,
          stage,
          source: i.source ?? "action_layer",
          owner_user_id: ctx.userId,
        // deno-lint-ignore no-explicit-any
        } as any).select(APP_FIELDS).single(),
        "add_candidate_to_job",
      );
      await audit(ctx, "candidate_job_linked", {
        candidate_id: i.candidate_id, job_id: i.job_id, candidate_job_id: row.id, metadata: { stage },
      });
      return row;
    },
  },
  {
    name: "remove_candidate_from_job",
    kind: "write",
    description:
      "Remove a candidate from a job. Defaults to marking the application withdrawn (reversible); pass hard_delete to unlink entirely.",
    schema: z.object({
      application_id: uuid.optional(),
      candidate_id: uuid.optional(),
      job_id: uuid.optional(),
      reason: z.string().max(500).optional(),
      hard_delete: z.boolean().optional(),
    }),
    preview: async (i, ctx) => {
      const app = await resolveApp(ctx, i);
      return {
        affected: [app],
        summary: `${i.hard_delete ? "Unlink" : "Withdraw"} 1 application currently at ${app.stage}`,
      };
    },
    handler: async (i, ctx) => {
      const app = await resolveApp(ctx, i);
      if (i.hard_delete) {
        unwrap(
          await ctx.db.from("candidate_jobs").delete().eq("id", app.id).select("id").single(),
          "remove_candidate_from_job",
        );
        await audit(ctx, "candidate_job_unlinked", {
          candidate_id: app.candidate_id, job_id: app.job_id, metadata: { reason: i.reason ?? null },
        });
        return { removed: true, application_id: app.id };
      }
      const row = unwrap(
        await ctx.db.from("candidate_jobs").update({
          withdrawn: true,
          withdrawn_reason: i.reason ?? null,
          withdrawn_at: new Date().toISOString(),
        // deno-lint-ignore no-explicit-any
        } as any).eq("id", app.id).select(APP_FIELDS).single(),
        "remove_candidate_from_job",
      );
      await audit(ctx, "candidate_job_withdrawn", {
        candidate_id: app.candidate_id, job_id: app.job_id, candidate_job_id: app.id, metadata: { reason: i.reason ?? null },
      });
      return row;
    },
  },
  {
    name: "change_application_stage",
    kind: "write",
    description: "Move an application to another stage configured on its job.",
    schema: z.object({
      application_id: uuid.optional(),
      candidate_id: uuid.optional(),
      job_id: uuid.optional(),
      stage: z.string().min(1).max(80),
      note: z.string().max(2000).optional(),
    }),
    preview: async (i, ctx) => {
      const app = await resolveApp(ctx, i);
      return { affected: [app], summary: `Move 1 application from ${app.stage} to ${i.stage}` };
    },
    handler: async (i, ctx) => {
      const app = await resolveApp(ctx, i);
      await assertStage(ctx, app.job_id, i.stage);
      const row = unwrap(
        await ctx.db.from("candidate_jobs").update({ stage: i.stage }).eq("id", app.id).select(APP_FIELDS).single(),
        "change_application_stage",
      );
      await audit(ctx, "stage_change", {
        candidate_id: app.candidate_id, job_id: app.job_id, candidate_job_id: app.id,
        metadata: { from: app.stage, to: i.stage },
      });
      if (i.note) {
        await ctx.db.from("notes").insert({
          owner_user_id: ctx.userId, candidate_id: app.candidate_id, job_id: app.job_id,
          activity_type: "stage_change", content: i.note,
        // deno-lint-ignore no-explicit-any
        } as any);
      }
      return row;
    },
  },
  {
    name: "create_submission",
    kind: "write",
    description:
      "Record a CV submission: moves the application to the job's CV-sent stage and logs it in activity history. Does not send any email.",
    schema: z.object({
      application_id: uuid.optional(),
      candidate_id: uuid.optional(),
      job_id: uuid.optional(),
      stage: z.string().max(80).optional(),
      summary: z.string().max(4000).optional(),
    }),
    handler: async (i, ctx) => {
      const app = await resolveApp(ctx, i);
      const stages = await jobStages(ctx, app.job_id);
      const stage = i.stage ??
        stages.find((s) => /sent cv|submitted|cv sent/i.test(s)) ?? app.stage;
      await assertStage(ctx, app.job_id, stage);
      const row = unwrap(
        await ctx.db.from("candidate_jobs").update({ stage }).eq("id", app.id).select(APP_FIELDS).single(),
        "create_submission",
      );
      await ctx.db.from("notes").insert({
        owner_user_id: ctx.userId, candidate_id: app.candidate_id, job_id: app.job_id,
        activity_type: "cv_sent", content: i.summary ?? "CV submitted to client.",
      // deno-lint-ignore no-explicit-any
      } as any);
      await audit(ctx, "cv_sent", {
        candidate_id: app.candidate_id, job_id: app.job_id, candidate_job_id: app.id, metadata: { stage },
      });
      return row;
    },
  },
  {
    name: "create_interview",
    kind: "write",
    description:
      "Create an interview against an application, move the pipeline to the matching stage and log the activity.",
    schema: z.object({
      application_id: uuid.optional(),
      candidate_id: uuid.optional(),
      job_id: uuid.optional(),
      stage: z.string().max(80).optional(),
      scheduled_at: z.string().datetime().optional(),
      duration_mins: z.number().int().min(5).max(600).optional(),
      format: z.string().max(60).optional(),
      location: z.string().max(200).optional(),
      interview_type: z.string().max(60).optional(),
      prep_notes: z.string().max(8000).optional(),
    }),
    handler: async (i, ctx) => {
      const app = await resolveApp(ctx, i);
      const stages = await jobStages(ctx, app.job_id);
      const stage = i.stage ?? stages.find((s) => /first stage|first interview/i.test(s)) ?? app.stage;
      await assertStage(ctx, app.job_id, stage);

      const interview = unwrap(
        await ctx.db.from("interviews").insert({
          owner_user_id: ctx.userId,
          candidate_id: app.candidate_id,
          job_id: app.job_id,
          candidate_job_id: app.id,
          stage,
          scheduled_at: i.scheduled_at ?? null,
          duration_mins: i.duration_mins ?? null,
          format: i.format ?? null,
          location: i.location ?? null,
          interview_type: i.interview_type ?? null,
          prep_notes: i.prep_notes ?? null,
        // deno-lint-ignore no-explicit-any
        } as any).select().single(),
        "create_interview",
      );
      await ctx.db.from("candidate_jobs")
        .update({ stage, interview_date: i.scheduled_at ?? null })
        .eq("id", app.id);
      await audit(ctx, "interview_scheduled", {
        candidate_id: app.candidate_id, job_id: app.job_id, candidate_job_id: app.id,
        metadata: { interview_id: interview.id, stage, scheduled_at: i.scheduled_at ?? null },
      });
      return interview;
    },
  },
  {
    name: "create_placement",
    kind: "write",
    description:
      "Record a placement: moves the application to the job's Placed stage (the existing database trigger creates the placement record and check-ins) and returns the placement.",
    schema: z.object({
      application_id: uuid.optional(),
      candidate_id: uuid.optional(),
      job_id: uuid.optional(),
      start_date: z.string().date().optional(),
      salary_placed_at: z.number().int().min(0).optional(),
      fee_amount: z.number().min(0).optional(),
      notes: z.string().max(4000).optional(),
    }),
    handler: async (i, ctx) => {
      const app = await resolveApp(ctx, i);
      const stages = await jobStages(ctx, app.job_id);
      const placedStage = stages.find((s) => /placed/i.test(s)) ?? "Placed";
      await ctx.db.from("candidate_jobs").update({ stage: placedStage }).eq("id", app.id);

      const { data: placement } = await ctx.db.from("placements").select("*")
        .eq("candidate_job_id", app.id).maybeSingle();
      let row = placement;
      const patch: Record<string, unknown> = {};
      if (i.start_date) patch.start_date = i.start_date;
      if (typeof i.salary_placed_at === "number") patch.salary_placed_at = i.salary_placed_at;
      if (typeof i.fee_amount === "number") patch.fee_amount = i.fee_amount;
      if (i.notes) patch.notes = i.notes;
      if (row && Object.keys(patch).length) {
        row = unwrap(
          await ctx.db.from("placements").update(patch).eq("id", row.id).select("*").single(),
          "create_placement",
        );
      }
      await audit(ctx, "placement_created", {
        candidate_id: app.candidate_id, job_id: app.job_id, candidate_job_id: app.id,
        metadata: { placement_id: row?.id ?? null },
      });
      return row ?? { application_id: app.id, stage: placedStage };
    },
  },
];
