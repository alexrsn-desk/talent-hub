// Bridge between the Desky Action Layer registry and LLM tool calling.
// Used by the AI Coach (and any future assistant). No second action system:
// every tool maps 1:1 onto a registered action and runs through the same
// user-scoped handler. Writes are verified server-side by re-reading the
// record, risky writes go through the existing action_proposals approval
// flow, and every call is logged to coach_action_log.
import { zodToJsonSchema } from "https://esm.sh/zod-to-json-schema@3.23.5?deps=zod@3.23.8";
import { type ActionCtx, ActionError } from "./core.ts";
import { registry } from "./registry.ts";

export type Risk = "low" | "medium" | "high";

/**
 * Actions the assistant may call, with their risk class.
 *  low    — executes directly (routine admin a recruiter does all day).
 *  medium — executes directly for a handful of records; above BULK_THRESHOLD
 *           records it is turned into a proposal the recruiter must confirm.
 *  high   — always a proposal; never executes without explicit confirmation.
 * Nothing external (email / LinkedIn / sending) is exposed at all.
 */
export const ASSISTANT_ACTIONS: Record<string, Risk> = {
  // reads
  search_candidates: "low", get_candidate: "low", get_candidate_activity: "low", get_notes: "low",
  search_jobs: "low", get_job: "low", get_open_jobs: "low", get_candidates_for_job: "low",
  get_pipeline_for_job: "low", get_job_activity: "low", get_application: "low", get_application_history: "low",
  get_placement: "low", search_contacts: "low", get_contact: "low", get_contact_activity: "low",
  search_companies: "low", get_company: "low", get_company_activity: "low", list_team_members: "low",
  list_tags: "low", search_talent_pools: "low", list_talent_pool_candidates: "low",
  search_tasks: "low", get_due_followups: "low", list_proposals: "low",
  // candidate admin
  create_candidate: "low", update_candidate: "low", add_note: "low", create_activity: "low",
  add_candidate_tag: "low", remove_candidate_tag: "low",
  create_talent_pool: "low", add_candidates_to_talent_pool: "medium", remove_candidates_from_talent_pool: "medium",
  bulk_update_candidates: "medium",
  // contacts & companies
  create_contact: "low", update_contact: "low", create_company: "low", update_company: "low",
  // jobs
  create_job: "low", update_job: "low", run_job_launch: "low",
  // pipeline
  add_candidate_to_job: "low", change_application_stage: "low", create_submission: "low",
  create_interview: "low", record_rejection: "low", remove_candidate_from_job: "medium",
  bulk_change_stage: "medium", create_placement: "low", update_placement: "low",
  // tasks
  create_task: "low", update_task: "low", complete_task: "low", reopen_task: "low", bulk_create_followups: "medium",
  // approval flow (reuses action_proposals)
  approve_proposal: "low", reject_proposal: "low",
};

/** Medium-risk actions touching more records than this need confirmation first. */
export const BULK_THRESHOLD = 3;

/** Words the recruiter must have used before a pending proposal may be approved. */
const CONFIRM_RE = /\b(confirm|confirmed|yes|yep|yeah|go ahead|do it|proceed|approve|approved|ok|okay|sure|fine|please do|go for it)\b/i;

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
  return Object.entries(ASSISTANT_ACTIONS).flatMap(([name, risk]) => {
    const def = registry.get(name);
    if (!def) return [];
    const params = sanitize(zodToJsonSchema(def.schema, { $refStrategy: "none" }));
    const suffix = def.kind === "read"
      ? ""
      : risk === "high"
      ? " (WRITE, HIGH RISK: always returns a proposal the recruiter must confirm.)"
      : risk === "medium"
      ? ` (WRITE, BULK: more than ${BULK_THRESHOLD} records returns a proposal to confirm instead of executing.)`
      : " (WRITE: changes data.)";
    return [{
      type: "function",
      function: {
        name: def.name,
        description: def.description + suffix,
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
  /** Set when the call was converted into a proposal awaiting confirmation. */
  requires_confirmation?: boolean;
  proposal_id?: string;
};

const APP_FIELDS = "id, candidate_id, job_id, stage, withdrawn, stage_changed_at, rejection_reason";

// deno-lint-ignore no-explicit-any
async function mustExist(ctx: ActionCtx, table: string, id: string | undefined, fields: string, what: string): Promise<any> {
  if (!id) throw new ActionError("verify_failed", `No ${what} id returned`, 500);
  const { data } = await ctx.db.from(table).select(fields).eq("id", id).maybeSingle();
  if (!data) throw new ActionError("verify_failed", `${what} not found after write`, 500);
  return data;
}

// deno-lint-ignore no-explicit-any
function patchMatches(row: any, patch: any) {
  const mismatched = Object.keys(patch ?? {}).filter((k) => k in row && JSON.stringify(row[k]) !== JSON.stringify(patch[k]));
  if (mismatched.length) throw new ActionError("verify_failed", `Fields not saved as requested: ${mismatched.join(", ")}`, 500);
}

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
      const data = await mustExist(ctx, "candidate_jobs", result?.id, APP_FIELDS, "Application");
      const expected = result.stage ?? input.stage;
      if (expected && data.stage !== expected) {
        throw new ActionError("verify_failed", `Stage is "${data.stage}", expected "${expected}"`, 500);
      }
      return data;
    }
    case "bulk_change_stage": {
      const ids = (result?.rows ?? []).map((r: { id: string }) => r.id);
      const { data } = await ctx.db.from("candidate_jobs").select(APP_FIELDS).in("id", ids);
      const wrong = (data ?? []).filter((r: { stage: string }) => r.stage !== input.stage);
      if ((data ?? []).length !== ids.length || wrong.length) throw new ActionError("verify_failed", "Not every application reached the requested stage", 500);
      return { moved: ids.length };
    }
    case "remove_candidate_from_job": {
      if (result?.removed) {
        const { data } = await ctx.db.from("candidate_jobs").select("id").eq("id", result.application_id).maybeSingle();
        if (data) throw new ActionError("verify_failed", "Application still exists after removal", 500);
        return { removed: true, application_id: result.application_id };
      }
      const data = await mustExist(ctx, "candidate_jobs", result?.id, APP_FIELDS, "Application");
      if (!data.withdrawn) throw new ActionError("verify_failed", "Application not marked withdrawn", 500);
      return data;
    }
    case "record_rejection": {
      const data = await mustExist(ctx, "candidate_jobs", result?.id, APP_FIELDS, "Application");
      if (!data.withdrawn) throw new ActionError("verify_failed", "Application not marked withdrawn/rejected", 500);
      return data;
    }
    case "create_interview":
      return await mustExist(ctx, "interviews", result?.id, "id, candidate_job_id, stage, scheduled_at", "Interview");
    case "create_placement": {
      if (result?.id) return await mustExist(ctx, "placements", result.id, "id, candidate_job_id, status, start_date", "Placement");
      const { data } = await ctx.db.from("placements").select("id, status").eq("candidate_job_id", result?.application_id).maybeSingle();
      if (!data) throw new ActionError("verify_failed", "Placement record was not created", 500);
      return data;
    }
    case "update_placement": {
      const data = await mustExist(ctx, "placements", result?.id, "*", "Placement");
      patchMatches(data, input.patch);
      return data;
    }
    case "add_note":
      return await mustExist(ctx, "notes", result?.id, "id, candidate_id, job_id, client_id, contact_id, content", "Note");
    case "create_activity":
      return await mustExist(ctx, "notes", result?.id, "id, activity_type, candidate_id, contact_id, client_id, job_id", "Activity");
    case "create_task":
    case "update_task":
    case "complete_task":
    case "reopen_task": {
      const data = await mustExist(ctx, "todo_tasks", result?.id, "id, title, completed, status, due_date, candidate_id, contact_id, owner_user_id", "Task");
      if (name === "complete_task" && !data.completed) throw new ActionError("verify_failed", "Task not marked complete", 500);
      if (name === "reopen_task" && data.completed) throw new ActionError("verify_failed", "Task still complete", 500);
      if (name === "update_task") patchMatches(data, input.patch);
      return data;
    }
    case "bulk_create_followups": {
      const ids = (result?.rows ?? []).map((r: { id: string }) => r.id);
      const { data } = await ctx.db.from("todo_tasks").select("id").in("id", ids);
      if ((data ?? []).length !== ids.length) throw new ActionError("verify_failed", "Not all follow-ups were saved", 500);
      return { created: ids.length };
    }
    case "create_candidate":
    case "update_candidate": {
      const data = await mustExist(ctx, "candidates", result?.id, "*", "Candidate");
      if (name === "update_candidate") patchMatches(data, input.patch);
      return data;
    }
    case "bulk_update_candidates": {
      const { data } = await ctx.db.from("candidates").select("*").in("id", input.candidate_ids);
      if ((data ?? []).length !== input.candidate_ids.length) throw new ActionError("verify_failed", "Some candidates were not found after update", 500);
      for (const r of data ?? []) patchMatches(r, input.patch);
      return { updated: (data ?? []).length };
    }
    case "create_contact":
    case "update_contact": {
      const data = await mustExist(ctx, "contacts", result?.id, "*", "Contact");
      if (name === "update_contact") patchMatches(data, input.patch);
      return data;
    }
    case "create_company":
    case "update_company": {
      const data = await mustExist(ctx, "clients", result?.id, "*", "Company");
      if (name === "update_company") patchMatches(data, input.patch);
      return data;
    }
    case "create_job":
    case "update_job": {
      const data = await mustExist(ctx, "jobs", result?.id, "*", "Job");
      if (name === "update_job") patchMatches(data, input.patch);
      return data;
    }
    case "add_candidate_tag": {
      const { data } = await ctx.db.from("candidate_tags").select("candidate_id").eq("tag_definition_id", result?.tag?.id).in("candidate_id", input.candidate_ids);
      if ((data ?? []).length !== input.candidate_ids.length) throw new ActionError("verify_failed", "Tag missing on some candidates", 500);
      return { tagged: input.candidate_ids.length, tag: result.tag?.label };
    }
    case "remove_candidate_tag": {
      const { data } = await ctx.db.from("candidate_tags").select("candidate_id").eq("tag_definition_id", result?.tag?.id).in("candidate_id", input.candidate_ids);
      if ((data ?? []).length) throw new ActionError("verify_failed", "Tag still present on some candidates", 500);
      return { removed: result.removed };
    }
    case "create_talent_pool":
      return await mustExist(ctx, "talent_pools", result?.id, "id, name", "Talent pool");
    case "add_candidates_to_talent_pool": {
      const { data } = await ctx.db.from("candidate_talent_pools").select("candidate_id").eq("pool_id", result?.pool?.id).in("candidate_id", input.candidate_ids);
      if ((data ?? []).length !== input.candidate_ids.length) throw new ActionError("verify_failed", "Some candidates are not in the pool", 500);
      return { pool: result.pool, added: input.candidate_ids.length };
    }
    case "remove_candidates_from_talent_pool": {
      const { data } = await ctx.db.from("candidate_talent_pools").select("candidate_id").eq("pool_id", result?.pool?.id).in("candidate_id", input.candidate_ids);
      if ((data ?? []).length) throw new ActionError("verify_failed", "Some candidates are still in the pool", 500);
      return { pool: result.pool, removed: result.removed };
    }
    case "approve_proposal": {
      const data = await mustExist(ctx, "action_proposals", result?.id, "id, action, status, result", "Proposal");
      if (data.status !== "executed") throw new ActionError("verify_failed", `Proposal is ${data.status}, not executed`, 500);
      return data;
    }
    case "reject_proposal":
      return await mustExist(ctx, "action_proposals", result?.id, "id, status", "Proposal");
    case "run_job_launch":
      return result; // prepare-only; nothing persisted to verify beyond the audit row
    default:
      return result;
  }
}

/** Snapshot the record an update-style action is about to change (for before/after logging). */
// deno-lint-ignore no-explicit-any
async function beforeState(name: string, input: any, ctx: ActionCtx): Promise<any> {
  const one = async (table: string, id?: string) => {
    if (!id) return null;
    const { data } = await ctx.db.from(table).select("*").eq("id", id).maybeSingle();
    return data;
  };
  try {
    switch (name) {
      case "update_candidate": return await one("candidates", input.candidate_id);
      case "update_contact": return await one("contacts", input.contact_id);
      case "update_company": return await one("clients", input.company_id);
      case "update_job": return await one("jobs", input.job_id);
      case "update_task": case "complete_task": case "reopen_task": return await one("todo_tasks", input.task_id);
      case "update_placement": return await one("placements", input.placement_id);
      case "change_application_stage": case "create_submission": case "record_rejection": case "remove_candidate_from_job": case "create_interview": case "create_placement": {
        if (input.application_id) return await one("candidate_jobs", input.application_id);
        if (input.candidate_id && input.job_id) {
          const { data } = await ctx.db.from("candidate_jobs").select("*").eq("candidate_id", input.candidate_id).eq("job_id", input.job_id).maybeSingle();
          return data;
        }
        return null;
      }
      case "bulk_update_candidates": {
        const { data } = await ctx.db.from("candidates").select("id, name, status, location, owner_user_id, salary_expectation").in("id", input.candidate_ids);
        return data;
      }
      case "bulk_change_stage": {
        const { data } = await ctx.db.from("candidate_jobs").select("id, candidate_id, stage").eq("job_id", input.job_id);
        return data;
      }
      default: return null;
    }
  } catch { return null; }
}

// deno-lint-ignore no-explicit-any
function collectIds(input: any, result: any): Record<string, unknown> {
  const ids: Record<string, unknown> = {};
  // deno-lint-ignore no-explicit-any
  const pick = (obj: any, key: string) => {
    if (!obj) return;
    if (typeof obj[key] === "string") ids[key] = obj[key];
    if (Array.isArray(obj[key]) && obj[key].every((x: unknown) => typeof x === "string")) ids[key] = obj[key];
  };
  for (const k of ["candidate_id", "job_id", "application_id", "task_id", "contact_id", "client_id", "company_id", "placement_id", "pool_id", "proposal_id", "candidate_ids", "application_ids", "contact_ids"]) {
    pick(input, k);
    pick(result, k);
  }
  if (result && typeof result.id === "string") ids.record_id = result.id;
  if (Array.isArray(result?.rows)) ids.record_ids = result.rows.map((r: { id?: string }) => r.id).filter(Boolean);
  return ids;
}

/** Number of records a call touches, from its preview. */
// deno-lint-ignore no-explicit-any
function affectedCount(input: any): number {
  for (const k of ["candidate_ids", "application_ids", "contact_ids"]) {
    if (Array.isArray(input?.[k])) return input[k].length;
  }
  return 1;
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
  const risk = ASSISTANT_ACTIONS[name];
  if (!def || !risk) {
    return { ok: false, kind: "read", error: `Tool "${name}" is not available`, code: "unknown_action" };
  }
  const parsed = def.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    if (def.kind !== "read") await log(ctx, { userRequest, action: name, input: rawArgs, affected: {}, success: false, error: `Invalid input — ${issues}`, risk });
    return { ok: false, kind: def.kind, error: `Invalid input — ${issues}`, code: "invalid_input" };
  }
  // deno-lint-ignore no-explicit-any
  const input: any = parsed.data;

  // Server-side rule: a stage may only be written if the recruiter actually
  // named it (case/word-order insensitive). Otherwise the model must ask.
  if (def.kind === "write" && typeof input.stage === "string" && userRequest) {
    const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    const reqWords = new Set(words(userRequest));
    const stage = input.stage as string;
    const named = words(stage).every((w) => reqWords.has(w));
    // Confirmations ("yes", "go ahead") of a stage the Coach already offered are allowed through.
    const isConfirmation = CONFIRM_RE.test(userRequest) && words(userRequest).length <= 8;
    if (!named && !isConfirmation) {
      let valid: string[] = [];
      try {
        let jid = input.job_id as string | undefined;
        if (!jid && input.application_id) {
          const { data } = await ctx.db.from("candidate_jobs").select("job_id").eq("id", input.application_id).maybeSingle();
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
      await log(ctx, { userRequest, action: name, input, affected: collectIds(input, null), success: false, error: msg, risk });
      return { ok: false, kind: def.kind, error: msg, code: "stage_confirmation_required" };
    }
  }

  // Approval gate: proposals can only be approved when the recruiter's own
  // latest message is a confirmation — the model cannot self-approve.
  if (name === "approve_proposal" && !(userRequest && CONFIRM_RE.test(userRequest))) {
    const msg = "Approval refused: the recruiter has not confirmed yet. Show them the proposal summary and wait for an explicit yes.";
    await log(ctx, { userRequest, action: name, input, affected: collectIds(input, null), success: false, error: msg, risk, approval: "refused", proposalId: input.proposal_id });
    return { ok: false, kind: "write", error: msg, code: "confirmation_required" };
  }

  // Risk gate: high-risk, or medium-risk touching many records, becomes a
  // proposal (existing propose/approve flow) instead of executing now.
  if (def.kind !== "read" && (risk === "high" || (risk === "medium" && affectedCount(input) > BULK_THRESHOLD))) {
    return await propose(def.name, input, ctx, userRequest, risk);
  }

  const before = def.kind === "read" ? null : await beforeState(name, input, ctx);

  // deno-lint-ignore no-explicit-any
  let result: any;
  try {
    result = await def.handler(input, ctx);
  } catch (e) {
    const msg = e instanceof ActionError ? e.message : "Action failed";
    const code = e instanceof ActionError ? e.code : "action_failed";
    if (!(e instanceof ActionError)) console.error("[assistant-tool]", name, e);
    if (def.kind !== "read") await log(ctx, { userRequest, action: name, input, affected: collectIds(input, null), success: false, error: msg, risk, before });
    return { ok: false, kind: def.kind, error: msg, code };
  }

  if (def.kind === "read") return { ok: true, kind: "read", data: result };

  try {
    const verified = await verifyWrite(name, input, result, ctx);
    await log(ctx, {
      userRequest, action: name, input, affected: collectIds(input, result), result: verified, success: true, error: null, verified: true, risk, before,
      approval: name === "approve_proposal" ? "approved" : "not_required", proposalId: name === "approve_proposal" ? input.proposal_id : undefined,
    });
    return { ok: true, kind: def.kind, data: result, verified: true };
  } catch (e) {
    const msg = e instanceof ActionError ? e.message : "Verification failed";
    await log(ctx, { userRequest, action: name, input, affected: collectIds(input, result), result, success: false, error: `Verification failed: ${msg}`, risk, before });
    return { ok: false, kind: def.kind, error: `The change could not be verified in the database: ${msg}`, code: "verify_failed" };
  }
}

/** Turn a risky call into a stored proposal via the existing propose_action action. */
// deno-lint-ignore no-explicit-any
async function propose(action: string, input: any, ctx: ActionCtx, userRequest: string | null, risk: Risk): Promise<ToolRunResult> {
  const proposeDef = registry.get("propose_action")!;
  try {
    const out = await proposeDef.handler({ action, input, intent: userRequest ?? undefined }, ctx);
    const proposal = out.proposal;
    await log(ctx, {
      userRequest, action, input, affected: { proposal_id: proposal.id, affected_count: proposal.affected_count }, success: true, error: null,
      verified: false, risk, approval: "pending", proposalId: proposal.id, result: { summary: out.summary },
    });
    return {
      ok: true,
      kind: "write",
      verified: false,
      requires_confirmation: true,
      proposal_id: proposal.id,
      data: {
        NOT_EXECUTED: true,
        message: `This ${risk === "high" ? "high-risk" : "bulk"} change was NOT executed. It is saved as proposal ${proposal.id}. ` +
          `Show the recruiter the summary and affected records, then call approve_proposal(proposal_id) ONLY after they reply with an explicit confirmation.`,
        summary: out.summary,
        affected_count: proposal.affected_count,
        affected: proposal.affected,
      },
    };
  } catch (e) {
    const msg = e instanceof ActionError ? e.message : "Could not prepare the change";
    await log(ctx, { userRequest, action, input, affected: collectIds(input, null), success: false, error: msg, risk, approval: "pending" });
    return { ok: false, kind: "write", error: msg, code: e instanceof ActionError ? e.code : "action_failed" };
  }
}

async function log(
  ctx: ActionCtx,
  e: {
    userRequest: string | null;
    action: string;
    // deno-lint-ignore no-explicit-any
    input: any;
    affected: Record<string, unknown>;
    // deno-lint-ignore no-explicit-any
    result?: any;
    success: boolean;
    error: string | null;
    verified?: boolean;
    risk: Risk;
    // deno-lint-ignore no-explicit-any
    before?: any;
    approval?: "not_required" | "pending" | "approved" | "refused";
    proposalId?: string;
  },
) {
  try {
    await ctx.db.from("coach_action_log").insert({
      owner_user_id: ctx.userId,
      user_request: e.userRequest?.slice(0, 4000) ?? null,
      action: e.action,
      input: e.input ?? {},
      affected_ids: e.affected,
      result: e.result ?? null,
      before_state: e.before ?? null,
      success: e.success,
      error: e.error,
      verified: e.verified ?? false,
      risk: e.risk,
      approval_status: e.approval ?? "not_required",
      proposal_id: e.proposalId ?? null,
    // deno-lint-ignore no-explicit-any
    } as any);
  } catch (err) {
    console.warn("[assistant-tool] log failed", err);
  }
}
