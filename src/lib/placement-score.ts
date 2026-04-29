// Placement Probability Score — deterministic calculation from pipeline data.
// Framing rules (non-negotiable):
//  1. Never show a score without a next action.
//  2. Never frame a high score as a reason to relax — always surface a risk.
//  3. Always show trend (rising / falling / stable).
//  4. Frame low scores as recoverable, never as failures.
//  5. Capped 5–95%. Never 0% or 100%.

import type { Job, CandidateJob, Note, Client } from "@/hooks/use-data";

export type ScoreFactor = {
  label: string;
  points: number;
  action?: string; // For negatives, the one specific action to fix it.
};

export type PlacementScore = {
  score: number; // 5..95
  band: "green" | "amber" | "red";
  trend: "up" | "down" | "flat";
  trendDelta: number; // current - previous
  positives: ScoreFactor[];
  negatives: ScoreFactor[];
  // The single one-line action — every score has one, always.
  topAction: string;
  // Headline framing — never "at risk", always "recoverable / needs attention / on track"
  headline: string;
};

const ACTIVE_BACKUP_STAGES = new Set(["Screening", "Shortlist", "Submitted", "Client Review"]);
const INTERVIEW_STAGES = new Set(["First Interview", "Second Interview", "Client Review"]);

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function computePlacementScore(input: {
  job: Job & { clients?: Client | null };
  candidateJobs: CandidateJob[]; // already filtered to this job, OR full list
  clientNotes: Note[]; // notes for this job's client (or empty)
  jobNotes?: Note[];
  previousScore?: number | null;
}): PlacementScore {
  const { job, previousScore } = input;
  const cjs = (input.candidateJobs || []).filter((cj) => cj.job_id === job.id);
  const today = new Date();

  const positives: ScoreFactor[] = [];
  const negatives: ScoreFactor[] = [];
  let raw = 50; // neutral baseline before factors

  // --- Pipeline factors ---
  const hasOffer = cjs.some((cj) => cj.stage === "Offer");
  const hasInterview = cjs.some((cj) => INTERVIEW_STAGES.has(cj.stage));
  const hasShortlist = cjs.some((cj) => cj.stage === "Shortlist");
  const activeStages = ["Longlist", "Screening", "Shortlist", "Submitted", "Client Review", "First Interview", "Second Interview", "Offer"];
  const inPlay = cjs.filter((cj) => activeStages.includes(cj.stage));
  const backupCount = cjs.filter((cj) => ACTIVE_BACKUP_STAGES.has(cj.stage)).length;

  if (hasOffer) {
    raw += 35;
    positives.push({ label: "Candidate at offer stage", points: 35 });
  } else if (hasInterview) {
    raw += 20;
    positives.push({ label: "Candidate at interview stage", points: 20 });
  } else if (hasShortlist) {
    raw += 10;
    positives.push({ label: "Candidate at shortlist stage", points: 10 });
  }

  if (inPlay.length >= 2) {
    raw += 5;
    positives.push({ label: `${inPlay.length} candidates in pipeline`, points: 5 });
  }

  // Backup at screening+ (only meaningful when there's a frontrunner)
  if ((hasOffer || hasInterview) && backupCount >= (hasOffer ? 1 : 2)) {
    raw += 10;
    positives.push({ label: "Backup candidate at screening or above", points: 10 });
  }

  if (inPlay.length === 0) {
    raw -= 30;
    negatives.push({
      label: "No candidates in pipeline",
      points: -30,
      action: "Source 3 candidates this week to rebuild the pipeline",
    });
  } else if (inPlay.length === 1 && !hasOffer && !hasInterview) {
    raw -= 10;
    negatives.push({
      label: "Only one candidate, no backups",
      points: -10,
      action: "Add 2 backup candidates at shortlist this week",
    });
  } else if ((hasOffer || hasInterview) && backupCount === 0) {
    // High-stakes solo runner — surface the vulnerability
    raw -= 10;
    negatives.push({
      label: "No backup at shortlist or above",
      points: -10,
      action: "Add a backup candidate to shortlist today to protect the offer",
    });
  }

  // --- Client contact recency ---
  const clientNotes = (input.clientNotes || []).filter((n) => n.client_id === job.client_id);
  const lastClientTouch = clientNotes
    .map((n) => new Date(n.created_at))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const daysSinceClient = lastClientTouch ? daysBetween(today, lastClientTouch) : 999;

  if (daysSinceClient <= 7) {
    raw += 10;
    positives.push({ label: "Client contacted this week", points: 10 });
  } else if (daysSinceClient >= 14) {
    raw -= 15;
    negatives.push({
      label: `No client contact in ${daysSinceClient} days`,
      points: -15,
      action: "Call the client today for an update on the role",
    });
  }

  // --- Role age ---
  const opened = new Date(job.date_opened);
  const weeksOpen = daysBetween(today, opened) / 7;
  if (weeksOpen < 4) {
    raw += 5;
    positives.push({ label: "Role opened recently", points: 5 });
  } else if (weeksOpen > 8) {
    raw -= 10;
    negatives.push({
      label: `Role open ${Math.round(weeksOpen)} weeks`,
      points: -10,
      action: "Refresh the client brief this week to prevent further decline",
    });
  }

  // --- Client status ---
  if (job.clients?.status === "Active") {
    raw += 5;
    positives.push({ label: "Client is Active", points: 5 });
  }

  // --- Last candidate rejected by client ---
  const rejected = cjs.filter((cj) => cj.rejection_reason).sort((a, b) =>
    new Date(b.stage_changed_at).getTime() - new Date(a.stage_changed_at).getTime(),
  );
  if (rejected[0]) {
    const lastReject = rejected[0];
    const lastRejectDate = new Date(lastReject.stage_changed_at);
    const lastForwardMove = cjs
      .filter((cj) => activeStages.includes(cj.stage))
      .map((cj) => new Date(cj.stage_changed_at))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (!lastForwardMove || lastForwardMove < lastRejectDate) {
      raw -= 15;
      negatives.push({
        label: "Last candidate rejected by client",
        points: -15,
        action: "Source two replacement candidates and submit by Friday",
      });
    }
  }

  // --- Job status ---
  if (job.status === "On Hold") {
    raw -= 20;
    negatives.push({
      label: "Role on hold",
      points: -20,
      action: "Call the client this week to confirm the role is still live",
    });
  }

  // Cap
  const score = Math.max(5, Math.min(95, Math.round(raw)));

  // Trend
  let trend: "up" | "down" | "flat" = "flat";
  let trendDelta = 0;
  if (typeof previousScore === "number") {
    trendDelta = score - previousScore;
    if (trendDelta >= 3) trend = "up";
    else if (trendDelta <= -3) trend = "down";
  }

  // Band
  const band: "green" | "amber" | "red" = score >= 70 ? "green" : score >= 40 ? "amber" : "red";

  // Top action — every score has one (framing rule #1)
  let topAction = "";
  if (negatives.length > 0) {
    // Pick the worst (most-negative) factor's action
    const worst = [...negatives].sort((a, b) => a.points - b.points)[0];
    topAction = worst.action || "Review pipeline and take one concrete action this week";
  } else if (band === "green") {
    // Find the hidden risk inside a high score (framing rule #2)
    if (backupCount === 0 && (hasOffer || hasInterview)) {
      topAction = "Add a backup candidate to protect this score";
    } else if (daysSinceClient > 5) {
      topAction = "Touch base with the client to lock the placement in";
    } else {
      topAction = "Push to next stage this week — momentum is everything";
    }
  } else {
    topAction = "One action this week could push this higher";
  }

  // Headline (framing rule #4)
  let headline = "";
  if (band === "green") headline = "On track — protect it";
  else if (band === "amber") headline = "Needs attention";
  else headline = "Recoverable";

  return { score, band, trend, trendDelta, positives, negatives, topAction, headline };
}

// Helpers for display
export function bandColorClass(band: "green" | "amber" | "red") {
  return band === "green"
    ? "text-green-400"
    : band === "amber"
    ? "text-yellow-400"
    : "text-red-400";
}

export function trendArrow(trend: "up" | "down" | "flat") {
  return trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
}
