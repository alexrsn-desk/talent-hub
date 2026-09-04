// Prepare → review → approve → execute pipeline for AI-initiated changes.
// Any write/external action with a preview() can be proposed instead of run.
// Nothing here sends external communications.
import { type ActionCtx, type ActionDef, ActionError, audit, unwrap, uuid, z } from "./core.ts";
import { registry } from "./registry.ts";

export async function runAction(name: string, input: unknown, ctx: ActionCtx) {
  const def = registry.get(name);
  if (!def) throw new ActionError("unknown_action", `Unknown action "${name}"`, 404);
  const parsed = def.schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ActionError("invalid_input", parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
  }
  return await def.handler(parsed.data, ctx);
}

export const proposalActions: ActionDef[] = [
  {
    name: "propose_action",
    kind: "read",
    description:
      "Dry-run a write action and store the proposal: returns which records would be affected so a human can approve before anything executes.",
    schema: z.object({
      // deno-lint-ignore no-explicit-any
      action: z.string().min(1).max(80),
      // deno-lint-ignore no-explicit-any
      input: z.record(z.any()).default({}),
      intent: z.string().max(2000).optional(),
    }),
    handler: async (i, ctx) => {
      const def = registry.get(i.action);
      if (!def) throw new ActionError("unknown_action", `Unknown action "${i.action}"`, 404);
      if (def.kind === "read") throw new ActionError("invalid_input", "Read actions do not need approval");
      const parsed = def.schema.safeParse(i.input);
      if (!parsed.success) {
        throw new ActionError("invalid_input", parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
      }
      const preview = def.preview
        ? await def.preview(parsed.data, ctx)
        : { affected: [], summary: `${i.action} (no preview available — affected records resolved at execution time)` };

      const row = unwrap(
        await ctx.db.from("action_proposals").insert({
          owner_user_id: ctx.userId,
          action: i.action,
          requested_by: ctx.requestedBy,
          intent: i.intent ?? null,
          input: parsed.data,
          affected: preview.affected,
          affected_count: preview.affected.length,
          requires_external_send: def.kind === "external",
        // deno-lint-ignore no-explicit-any
        } as any).select("*").single(),
        "propose_action",
      );
      return { proposal: row, summary: preview.summary };
    },
  },
  {
    name: "list_proposals",
    kind: "read",
    description: "List proposed actions awaiting review.",
    schema: z.object({ status: z.enum(["pending", "approved", "executed", "rejected", "failed"]).optional() }),
    handler: async (i, ctx) => {
      let q = ctx.db.from("action_proposals").select("*").order("created_at", { ascending: false }).limit(100);
      if (i.status) q = q.eq("status", i.status);
      const { data } = await q;
      return { rows: data ?? [] };
    },
  },
  {
    name: "approve_proposal",
    kind: "write",
    description: "Approve and execute a pending proposal. Only the signed-in user can approve.",
    schema: z.object({ proposal_id: uuid }),
    handler: async (i, ctx) => {
      const p = unwrap(
        await ctx.db.from("action_proposals").select("*").eq("id", i.proposal_id).maybeSingle(),
        "approve_proposal",
      );
      if (p.status !== "pending") throw new ActionError("invalid_state", `Proposal is already ${p.status}`, 409);
      if (new Date(p.expires_at) < new Date()) throw new ActionError("expired", "Proposal has expired", 409);

      const now = new Date().toISOString();
      try {
        const result = await runAction(p.action, p.input, ctx);
        const row = unwrap(
          await ctx.db.from("action_proposals").update({
            status: "executed", approved_at: now, approved_by: ctx.userId, executed_at: now, result,
          // deno-lint-ignore no-explicit-any
          } as any).eq("id", p.id).select("*").single(),
          "approve_proposal",
        );
        await audit(ctx, "proposal_executed", { metadata: { proposal_id: p.id, action: p.action } });
        return row;
      } catch (e) {
        const message = e instanceof ActionError ? e.message : "Execution failed";
        // deno-lint-ignore no-explicit-any
        await ctx.db.from("action_proposals").update({ status: "failed", error: message } as any).eq("id", p.id);
        throw e;
      }
    },
  },
  {
    name: "reject_proposal",
    kind: "write",
    description: "Reject a pending proposal without executing it.",
    schema: z.object({ proposal_id: uuid, reason: z.string().max(1000).optional() }),
    handler: async (i, ctx) => {
      const row = unwrap(
        // deno-lint-ignore no-explicit-any
        await ctx.db.from("action_proposals").update({ status: "rejected", error: i.reason ?? null } as any)
          .eq("id", i.proposal_id).eq("status", "pending").select("*").single(),
        "reject_proposal",
      );
      return row;
    },
  },
];
