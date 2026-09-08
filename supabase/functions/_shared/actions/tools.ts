// Bridge between the Desky Action Layer registry and LLM tool calling.
// Used by the AI Coach (and any future assistant). No second action system:
// every tool maps 1:1 onto a registered action and runs through the same
// user-scoped handler. Writes are verified server-side by re-reading the
// record, and every call is logged to coach_action_log.
import { zodToJsonSchema } from "https://esm.sh/zod-to-json-schema@3.23.5?deps=zod@3.23.8";
import { type ActionCtx, ActionError } from "./core.ts";
import { registry } from "./registry.ts";

/** Actions the assistant may call. Nothing external (email/LinkedIn) is exposed. */
export const ASSISTANT_ACTIONS = [
  "search_candidates",
  "get_candidate",
  "search_jobs",
  "get_job",
  "get_open_jobs",
  "get_candidates_for_job",
  "get_pipeline_for_job",
  "get_application",
  "add_candidate_to_job",
  "change_application_stage",
  "create_submission",
  "remove_candidate_from_job",
  "add_note",
  "create_task",
  "complete_task",
  "get_due_followups",
  "search_contacts",
  "search_companies",
  "create_activity",
] as const;

// Gemini/OpenAI tool schemas dislike a few JSON-schema features zod emits.
// deno-lint-ignore no-explicit-any
function sanitize(node: any): any {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== "object") return node;
  // deno-lint-ignore no-explicit-any
  const out: any = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "$schema" || k === "additionalProperties" || k === "format" || k === "$ref" || k === "definitions") continue;
    if (k === "type" && Array.isArray(v)) {
      const nonNull = (v as string[]).filter((t) => t !== "null");
      out.type = nonNull[0] ?? "string";
      out.nullable = true;
      continue;
    }
    out[k] = sanitize(v);
  }
  return out;
}

/** OpenAI-format tool definitions built straight from the action catalogue. */
export function assistantTools() {
  return ASSISTANT_ACTIONS.flatMap((name) => {
    const def = registry.get(name);
    if (!def) return [];
    const params = sanitize(zodToJsonSchema(def.schema, { $refStrategy: "none" }));
    return [{
      type: "function",
      function: {
        name: def.name,
        description: def.description + (def.kind === "write" ? " (WRITE: changes data.)" : ""),
        parameters: params.type ? params : { type: "object", properties: {} },
      },
    }];
  });
}

export type ToolRunResult = {
  ok: boolean;
  kind: "read" | "write" | "external";
  // deno-lint-ignore no-explicit-any
  data?: any;
  error?: string;
  code?: string;
  verified?: boolean;
};

const APP_FIELDS = "id, candidate_id, job_id, stage, withdrawn, stage_changed_at";

/**
 * Re-read the database after a write so success is never taken on trust.
 * Returns the verified row, or throws if the state doesn't match what the
 * action claims to have done.
 */
// deno-lint-ignore no-explicit-any
async function verifyWrite(name: string, input: any, result: any, ctx: ActionCtx): Promise<any> {
  switch (name) {
    case "add_candidate_to_job":
    case "change_application_stage":
    case "create_submission": {
      const id = result?.id;
      if (!id) throw new ActionError("verify_failed", "No application id returned", 500);
      const { data } = await ctx.db.from("candidate_jobs").select(APP_FIELDS).eq("id", id).maybeSingle();
      if (!data) throw new ActionError("verify_failed", "Application not found after write", 500);
      const expected = result.stage ?? input.stage;
      if (expected && data.stage !== expected) {
        throw new ActionError("verify_failed", `Stage is "${data.stage}", expected "${expected}"`, 500);
      }
      return data;
    }
    case "remove_candidate_from_job": {
      if (result?.removed) {
        const { data } = await ctx.db.from("candidate_jobs").select("id").eq("id", result.application_id).maybeSingle();
        if (data) throw new ActionError("verify_failed", "Application still exists after removal", 500);
        return { removed: true, application_id: result.application_id };
      }
      const { data } = await ctx.db.from("candidate_jobs").select(APP_FIELDS).eq("id", result?.id).maybeSingle();
      if (!data?.withdrawn) throw new ActionError("verify_failed", "Application not marked withdrawn", 500);
      return data;
    }
    case "add_note": {
      const { data } = await ctx.db.from("notes").select("id, candidate_id, job_id, client_id, contact_id").eq("id", result?.id).maybeSingle();
      if (!data) throw new ActionError("verify_failed", "Note not found after write", 500);
      return data;
    }
    case "create_task":
    case "complete_task": {
      const { data } = await ctx.db.from("todo_tasks").select("id, title, completed, status").eq("id", result?.id).maybeSingle();
      if (!data) throw new ActionError("verify_failed", "Task not found after write", 500);
      return data;
    }
    case "create_activity": {
      const id = result?.id ?? result?.event?.id ?? result?.note?.id;
      if (!id) return result; // handler returned composite; treat returned row as verified
      return result;
    }
    default:
      return result;
  }
}

// deno-lint-ignore no-explicit-any
function collectIds(input: any, result: any): Record<string, string> {
  const ids: Record<string, string> = {};
  const pick = (obj: any, key: string, as = key) => {
    if (obj && typeof obj[key] === "string") ids[as] = obj[key];
  };
  for (const k of ["candidate_id", "job_id", "application_id", "task_id", "contact_id", "client_id", "company_id"]) {
    pick(input, k);
    pick(result, k);
  }
  if (result && typeof result.id === "string") ids.record_id = result.id;
  return ids;
}

/**
 * Execute one assistant tool call through the action registry.
 * Never throws — the model always receives a structured ok/error payload.
 */
export async function runAssistantTool(
  name: string,
  // deno-lint-ignore no-explicit-any
  rawArgs: any,
  ctx: ActionCtx,
  userRequest: string | null,
): Promise<ToolRunResult> {
  const def = registry.get(name);
  if (!def || !(ASSISTANT_ACTIONS as readonly string[]).includes(name)) {
    return { ok: false, kind: "read", error: `Tool "${name}" is not available`, code: "unknown_action" };
  }
  const parsed = def.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    if (def.kind !== "read") await log(ctx, userRequest, name, rawArgs, {}, null, false, `Invalid input — ${issues}`, false);
    return { ok: false, kind: def.kind, error: `Invalid input — ${issues}`, code: "invalid_input" };
  }

  // Server-side rule: a stage may only be written if the recruiter actually
  // named it (case/word-order insensitive). Otherwise the model must ask.
  if (def.kind === "write" && typeof (parsed.data as any).stage === "string" && userRequest) {
    const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    const reqWords = new Set(words(userRequest));
    const stage = (parsed.data as any).stage as string;
    const named = words(stage).every((w) => reqWords.has(w));
    if (!named) {
      let valid: string[] = [];
      try {
        const jobId = (parsed.data as any).job_id as string | undefined;
        const appId = (parsed.data as any).application_id as string | undefined;
        let jid = jobId;
        if (!jid && appId) {
          const { data } = await ctx.db.from("candidate_jobs").select("job_id").eq("id", appId).maybeSingle();
          jid = data?.job_id;
        }
        if (jid) {
          const { data } = await ctx.db.from("job_stages").select("stage_name, stage_order").eq("job_id", jid).order("stage_order");
          valid = (data ?? []).map((s: { stage_name: string }) => s.stage_name);
        }
      } catch { /* fall through with empty list */ }
      const msg =
        `Stage confirmation required: the recruiter did not name the stage "${stage}" exactly, so nothing was changed. ` +
        `Ask them to choose one of this job's stages: ${valid.join(", ") || "(see get_job)"}.`;
      await log(ctx, userRequest, name, parsed.data, collectIds(parsed.data, null), null, false, msg, false);
      return { ok: false, kind: def.kind, error: msg, code: "stage_confirmation_required" };
    }
  }

  // deno-lint-ignore no-explicit-any
  let result: any;
  try {
    result = await def.handler(parsed.data, ctx);
  } catch (e) {
    const msg = e instanceof ActionError ? e.message : "Action failed";
    const code = e instanceof ActionError ? e.code : "action_failed";
    if (!(e instanceof ActionError)) console.error("[assistant-tool]", name, e);
    if (def.kind !== "read") await log(ctx, userRequest, name, parsed.data, collectIds(parsed.data, null), null, false, msg, false);
    return { ok: false, kind: def.kind, error: msg, code };
  }

  if (def.kind === "read") return { ok: true, kind: "read", data: result };

  try {
    const verified = await verifyWrite(name, parsed.data, result, ctx);
    await log(ctx, userRequest, name, parsed.data, collectIds(parsed.data, result), verified, true, null, true);
    return { ok: true, kind: def.kind, data: result, verified: true };
  } catch (e) {
    const msg = e instanceof ActionError ? e.message : "Verification failed";
    await log(ctx, userRequest, name, parsed.data, collectIds(parsed.data, result), result, false, `Verification failed: ${msg}`, false);
    return { ok: false, kind: def.kind, error: `The change could not be verified in the database: ${msg}`, code: "verify_failed" };
  }
}

async function log(
  ctx: ActionCtx,
  userRequest: string | null,
  action: string,
  // deno-lint-ignore no-explicit-any
  input: any,
  affected: Record<string, string>,
  // deno-lint-ignore no-explicit-any
  result: any,
  success: boolean,
  error: string | null,
  verified: boolean,
) {
  try {
    await ctx.db.from("coach_action_log").insert({
      owner_user_id: ctx.userId,
      user_request: userRequest?.slice(0, 4000) ?? null,
      action,
      input: input ?? {},
      affected_ids: affected,
      result: result ?? null,
      success,
      error,
      verified,
    // deno-lint-ignore no-explicit-any
    } as any);
  } catch (e) {
    console.warn("[assistant-tool] log failed", e);
  }
}
