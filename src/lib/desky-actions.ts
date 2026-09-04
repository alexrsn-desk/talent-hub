// Typed frontend client for the Desky Action Layer (desky-actions edge function).
// The UI should prefer these actions over writing to tables directly, so that
// Desky, MCP and future automations share one set of validated CRM operations.
import { supabase } from "@/integrations/supabase/client";

export type ActionMode = "execute" | "preview";

export class DeskyActionError extends Error {
  constructor(message: string, public code = "action_failed") {
    super(message);
  }
}

async function post<T>(action: string, payload: unknown, mode: ActionMode = "execute"): Promise<T> {
  const { data, error } = await supabase.functions.invoke("desky-actions", {
    body: { action, payload, mode },
    headers: { "x-desky-client": "ui" },
  });
  if (error) {
    // Surface the server's message rather than the generic non-2xx wrapper.
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const parsed = JSON.parse(await ctx.text());
        if (parsed?.error) message = parsed.error;
      }
    } catch { /* keep the original message */ }
    throw new DeskyActionError(message);
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    const d = data as { error: string; code?: string };
    throw new DeskyActionError(d.error, d.code);
  }
  if (mode === "preview") return data as T;
  return (data as { data: T }).data;
}

/** Run any action by name. */
export function deskyAction<T = unknown>(action: string, payload: unknown = {}) {
  return post<T>(action, payload);
}

/** Dry-run a write action: returns the records it would affect. */
export function previewAction<T = { affected: unknown[]; summary: string }>(action: string, payload: unknown = {}) {
  return post<T>(action, payload, "preview");
}

/** List the available actions (used by docs/tooling). */
export function listActions() {
  return post<never>("list_actions", {}).catch(() => [] as never);
}

// ---- Convenience wrappers for the actions the UI uses today -------------

// deno-lint-ignore-file
export const candidateActions = {
  get: (candidate_id: string) => deskyAction("get_candidate", { candidate_id }),
  search: (filters: Record<string, unknown>) =>
    deskyAction<{ rows: any[]; count: number }>("search_candidates", filters),
  create: (input: Record<string, unknown>) => deskyAction<any>("create_candidate", input),
  update: (candidate_id: string, patch: Record<string, unknown>) =>
    deskyAction<any>("update_candidate", { candidate_id, patch }),
  activity: (candidate_id: string) => deskyAction<any>("get_candidate_activity", { candidate_id }),
};

export const applicationActions = {
  addToJob: (input: { candidate_id: string; job_id: string; stage?: string; source?: string }) =>
    deskyAction<any>("add_candidate_to_job", input),
  changeStage: (input: { application_id?: string; candidate_id?: string; job_id?: string; stage: string; note?: string }) =>
    deskyAction<any>("change_application_stage", input),
  remove: (input: { application_id?: string; candidate_id?: string; job_id?: string; reason?: string; hard_delete?: boolean }) =>
    deskyAction<any>("remove_candidate_from_job", input),
  submission: (input: { application_id?: string; candidate_id?: string; job_id?: string; summary?: string }) =>
    deskyAction<any>("create_submission", input),
  interview: (input: Record<string, unknown>) => deskyAction<any>("create_interview", input),
  placement: (input: Record<string, unknown>) => deskyAction<any>("create_placement", input),
};

export const taskActions = {
  create: (input: Record<string, unknown>) => deskyAction<any>("create_task", input),
  update: (task_id: string, patch: Record<string, unknown>) => deskyAction<any>("update_task", { task_id, patch }),
  complete: (task_id: string) => deskyAction<any>("complete_task", { task_id }),
  dueFollowups: (due_before?: string) => deskyAction<any>("get_due_followups", { due_before }),
};

export const activityActionsClient = {
  create: (input: Record<string, unknown>) => deskyAction<any>("create_activity", input),
  addNote: (input: Record<string, unknown>) => deskyAction<any>("add_note", input),
};

export const jobLaunchActionsClient = {
  /** Prepare a launch (matching + drafts). Never sends anything. */
  run: (input: { job_id: string } & Record<string, unknown>) => deskyAction<any>("run_job_launch", input),
};
