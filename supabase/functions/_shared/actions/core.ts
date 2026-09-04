// Desky Action Layer — core types, error handling and context.
// Every action runs server-side against a Supabase client that carries the
// caller's JWT, so RLS (owner_user_id + can_access_owner) is always enforced.
// No service-role key is ever used by the action layer.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

export { z };

export type ActionKind = "read" | "write" | "external";

export type ActionCtx = {
  userId: string;
  /** User-scoped client — RLS applies. */
  // deno-lint-ignore no-explicit-any
  db: SupabaseClient<any>;

  /** Caller identity for auditing: "ui", "mcp", "viktor", ... */
  requestedBy: string;
  /** Raw bearer token, for actions that re-invoke other edge functions. */
  token: string;
};

// deno-lint-ignore no-explicit-any
export type ActionDef<I = any, O = any> = {
  name: string;
  kind: ActionKind;
  /** One-line description — reused verbatim by the future MCP server. */
  description: string;
  schema: z.ZodType<I>;
  handler: (input: I, ctx: ActionCtx) => Promise<O>;
  /**
   * Optional dry-run: returns the records a write/external action would touch
   * so an agent or user can approve before anything is executed or sent.
   */
  // deno-lint-ignore no-explicit-any
  preview?: (input: I, ctx: ActionCtx) => Promise<{ affected: any[]; summary: string }>;
};

export class ActionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Wrap a Supabase error so internal details never leak to the caller. */
// deno-lint-ignore no-explicit-any
export function unwrap(res: { data: any; error: any }, what: string): any {
  if (res.error) {
    console.error(`[action-layer] ${what} failed:`, res.error);
    if (res.error.code === "PGRST116") throw new ActionError("not_found", `${what}: record not found`, 404);
    if (res.error.code === "42501") throw new ActionError("forbidden", `${what}: not permitted`, 403);
    if (res.error.code === "23505" || res.error.code === "23503") {
      throw new ActionError("invalid_reference", `${what}: referenced record is missing or duplicated`, 400);
    }
    throw new ActionError("action_failed", `${what} could not be completed`, 400);
  }
  if (res.data === null) throw new ActionError("not_found", `${what}: record not found`, 404);
  return res.data;
}

export async function buildContext(req: Request): Promise<ActionCtx> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new ActionError("unauthenticated", "Authentication required", 401);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await db.auth.getUser();
  if (error || !data?.user) throw new ActionError("unauthenticated", "Authentication required", 401);

  const requestedBy = (req.headers.get("x-desky-client") ?? "ui").slice(0, 40);
  return { userId: data.user.id, db, requestedBy, token };
}

/** Append-only audit trail for every write executed through the layer. */
export async function audit(
  ctx: ActionCtx,
  action: string,
  // deno-lint-ignore no-explicit-any
  refs: { candidate_id?: string | null; client_id?: string | null; job_id?: string | null; candidate_job_id?: string | null; metadata?: any } = {},
) {
  try {
    await ctx.db.from("activity_log").insert({
      user_id: ctx.userId,
      owner_user_id: ctx.userId,
      action_type: action,
      candidate_id: refs.candidate_id ?? null,
      client_id: refs.client_id ?? null,
      job_id: refs.job_id ?? null,
      candidate_job_id: refs.candidate_job_id ?? null,
      metadata: { ...(refs.metadata ?? {}), via: "action_layer", requested_by: ctx.requestedBy },
    // deno-lint-ignore no-explicit-any
    } as any);
  } catch (e) {
    console.warn("[action-layer] audit failed", e);
  }
}

export const uuid = z.string().uuid();
export const paging = {
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
};
