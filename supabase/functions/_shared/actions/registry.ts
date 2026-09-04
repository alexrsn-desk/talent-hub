// The Desky Action Layer registry — the single catalogue of server-side CRM
// actions. Everything (Desky UI, MCP, Viktor, other automations) goes through
// this list; nothing gets raw table access.
import type { ActionDef } from "./core.ts";
import { candidateActions } from "./candidates.ts";
import { crmActions } from "./crm.ts";
import { jobActions } from "./jobs.ts";
import { applicationActions } from "./applications.ts";
import { taskActions } from "./tasks.ts";
import { activityActions } from "./activity.ts";
import { templateActions } from "./templates.ts";
import { jobLaunchActions } from "./joblaunch.ts";
import { proposalActions } from "./proposals.ts";

export const allActions: ActionDef[] = [
  ...candidateActions,
  ...crmActions,
  ...jobActions,
  ...applicationActions,
  ...taskActions,
  ...activityActions,
  ...templateActions,
  ...jobLaunchActions,
  ...proposalActions,
];

export const registry = new Map<string, ActionDef>(allActions.map((a) => [a.name, a]));

/** Machine-readable catalogue — the future MCP server can build tools from this. */
export function catalogue() {
  return allActions.map((a) => ({ name: a.name, kind: a.kind, description: a.description }));
}
