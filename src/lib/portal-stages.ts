/**
 * Pipeline stages for the standalone Client/Candidate/Agency Portal feature.
 * Self-contained — deliberately unrelated to Desky's own job_stages.
 */
export type PortalStage = {
  name: string;
  /** internal-only stages are hidden from the candidate progress indicator */
  internal: boolean;
  /** stages where interview scheduling + details are relevant */
  interview: boolean;
};

export const PORTAL_STAGES: PortalStage[] = [
  { name: "Application Submitted", internal: false, interview: false },
  { name: "Reviewed", internal: true, interview: false },
  { name: "First Interview", internal: false, interview: true },
  { name: "Second Interview", internal: false, interview: true },
  { name: "Offer", internal: false, interview: false },
  { name: "Placed", internal: false, interview: false },
];

export const PORTAL_STAGE_NAMES = PORTAL_STAGES.map((s) => s.name);

export const CANDIDATE_VISIBLE_STAGES = PORTAL_STAGES.filter((s) => !s.internal);

export function stageIndex(stage: string) {
  const i = PORTAL_STAGE_NAMES.indexOf(stage);
  return i === -1 ? 0 : i;
}

export function isInterviewStage(stage: string) {
  return PORTAL_STAGES.find((s) => s.name === stage)?.interview ?? false;
}
