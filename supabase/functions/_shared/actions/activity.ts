// Activity history. Notes remain the canonical human-readable timeline;
// activity_events carries the structured touchpoint (channel/medium) record.
import { type ActionDef, ActionError, audit, paging, unwrap, uuid, z } from "./core.ts";

export const ACTIVITY_TYPES = [
  "email",
  "call",
  "linkedin",
  "slack",
  "note",
  "submission",
  "interview",
  "offer",
  "placement",
  "stage_change",
  "followup",
] as const;

export const activityActions: ActionDef[] = [
  {
    name: "create_activity",
    kind: "write",
    description:
      "Record an activity (email, call, LinkedIn, Slack, note, submission, interview, offer, placement, stage change or follow-up) against a candidate, contact, company or job. Recording an email does not send one.",
    schema: z.object({
      type: z.enum(ACTIVITY_TYPES),
      candidate_id: uuid.optional(),
      contact_id: uuid.optional(),
      client_id: uuid.optional(),
      job_id: uuid.optional(),
      content: z.string().max(20000).optional(),
      medium: z.string().max(40).optional(),
      outcome: z.string().max(200).optional(),
      occurred_at: z.string().datetime().optional(),
      duration: z.number().int().min(0).optional(),
      follow_up_date: z.string().date().optional(),
      // deno-lint-ignore no-explicit-any
      payload: z.record(z.any()).optional(),
    }),
    handler: async (i, ctx) => {
      if (![i.candidate_id, i.contact_id, i.client_id, i.job_id].some(Boolean)) {
        throw new ActionError("invalid_input", "Provide at least one of candidate_id, contact_id, client_id or job_id");
      }
      const occurred = i.occurred_at ?? new Date().toISOString();

      const note = unwrap(
        await ctx.db.from("notes").insert({
          owner_user_id: ctx.userId,
          candidate_id: i.candidate_id ?? null,
          contact_id: i.contact_id ?? null,
          client_id: i.client_id ?? null,
          job_id: i.job_id ?? null,
          activity_type: i.type,
          content: i.content ?? `${i.type} logged`,
          outcome: i.outcome ?? null,
          duration: i.duration ?? null,
          follow_up_date: i.follow_up_date ?? null,
        // deno-lint-ignore no-explicit-any
        } as any).select().single(),
        "create_activity",
      );

      if (i.candidate_id || i.contact_id) {
        await ctx.db.from("activity_events").insert({
          owner_user_id: ctx.userId,
          candidate_id: i.candidate_id ?? null,
          contact_id: i.contact_id ?? null,
          event_type: i.type,
          medium: i.medium ?? i.type,
          source: ctx.requestedBy,
          occurred_at: occurred,
          payload: { ...(i.payload ?? {}), note_id: note.id, outcome: i.outcome ?? null },
        // deno-lint-ignore no-explicit-any
        } as any);
      }

      await audit(ctx, "activity_logged", {
        candidate_id: i.candidate_id ?? null, client_id: i.client_id ?? null, job_id: i.job_id ?? null,
        metadata: { type: i.type, medium: i.medium ?? null },
      });
      return note;
    },
  },
  {
    name: "get_candidate_activity",
    kind: "read",
    description: "Full activity timeline for a candidate: notes, structured touchpoints and logged changes.",
    schema: z.object({ candidate_id: uuid, ...paging }),
    handler: async (i, ctx) => {
      const limit = i.limit ?? 50;
      const [{ data: notes }, { data: events }, { data: log }] = await Promise.all([
        ctx.db.from("notes").select("*").eq("candidate_id", i.candidate_id)
          .order("created_at", { ascending: false }).limit(limit),
        ctx.db.from("activity_events").select("*").eq("candidate_id", i.candidate_id)
          .order("occurred_at", { ascending: false }).limit(limit),
        ctx.db.from("activity_log").select("*").eq("candidate_id", i.candidate_id)
          .order("created_at", { ascending: false }).limit(limit),
      ]);
      return { notes: notes ?? [], touchpoints: events ?? [], changes: log ?? [] };
    },
  },
];
