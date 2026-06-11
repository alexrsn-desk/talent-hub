// Maps signal_type strings to logical categories for filtering and grouping.
// Categories: revenue | pipeline | bd | admin | missing_action

export type SignalCategoryKey = "revenue" | "pipeline" | "bd" | "admin" | "missing_action";

export const CATEGORY_LABELS: Record<SignalCategoryKey, string> = {
  revenue: "Revenue Signals",
  pipeline: "Pipeline Signals",
  bd: "BD Signals",
  admin: "Admin Signals",
  missing_action: "Missing Action Signals",
};

export const CATEGORY_COLORS: Record<SignalCategoryKey, string> = {
  revenue: "text-rose-400",
  pipeline: "text-violet-400",
  bd: "text-sky-400",
  admin: "text-muted-foreground",
  missing_action: "text-amber-400",
};

// Default per-signal toggles (true = on)
export const DEFAULT_ENABLED_SIGNALS: Record<string, boolean> = {
  // Revenue (all on)
  "Counter Offer Risk": true,
  "Offer No Backup": true,
  "Interview Follow Up Missing": true,
  "Deal At Risk": true,
  "Placement At Risk": true,
  // Pipeline (all on)
  "Candidate Not Contacted": true,
  "Job No Active Candidates": true,
  "Submitted No Feedback": true,
  "Offer No Response": true,
  // BD (all on)
  "Hiring Signal": true,
  "BD Lead": true,
  "Candidate Signal": true,
  "Referral Opportunity": true,
  "BD Cold Contact": true,
  "Campaign Reply": true,
  // Admin (all off)
  "Missing Salary": false,
  "Incomplete Profile": false,
  "Missing LinkedIn": false,
  "Missing Notice Period": false,
  // Missing actions (selective)
  "Missing Follow-up": true,
  "Missing Commitment": true,
  "Missing Next Action": false,
  "Missing Interview Date": false,
  "Salary Mismatch": true,
};

export const DEFAULT_ENABLED_CATEGORIES: Record<SignalCategoryKey, boolean> = {
  revenue: true,
  pipeline: true,
  bd: true,
  admin: false,
  missing_action: true,
};

export const SIGNALS_BY_CATEGORY: Record<SignalCategoryKey, string[]> = {
  revenue: [
    "Offer No Backup",
    "Counter Offer Risk",
    "Interview Follow Up Missing",
    "Deal At Risk",
    "Placement At Risk",
  ],
  pipeline: [
    "Candidate Not Contacted",
    "Job No Active Candidates",
    "Submitted No Feedback",
    "Offer No Response",
  ],
  bd: [
    "Hiring Signal",
    "BD Lead",
    "Candidate Signal",
    "Referral Opportunity",
    "BD Cold Contact",
    "Campaign Reply",
  ],
  admin: [
    "Missing Salary",
    "Incomplete Profile",
    "Missing LinkedIn",
    "Missing Notice Period",
  ],
  missing_action: [
    "Missing Follow-up",
    "Missing Commitment",
    "Missing Next Action",
    "Missing Interview Date",
    "Salary Mismatch",
  ],
};

// Reverse map: signal_type -> category
const SIGNAL_TO_CATEGORY: Record<string, SignalCategoryKey> = {};
(Object.keys(SIGNALS_BY_CATEGORY) as SignalCategoryKey[]).forEach((cat) => {
  SIGNALS_BY_CATEGORY[cat].forEach((s) => {
    SIGNAL_TO_CATEGORY[s] = cat;
  });
});

export function getSignalCategory(signalType: string, signalCategory?: string): SignalCategoryKey {
  if (SIGNAL_TO_CATEGORY[signalType]) return SIGNAL_TO_CATEGORY[signalType];
  if (signalCategory === "missing_action") return "missing_action";
  return "bd"; // sensible fallback for unknown opportunity types
}
