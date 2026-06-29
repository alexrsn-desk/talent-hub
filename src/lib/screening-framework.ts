// Single source of truth for the 9-section Screening Framework.
// Keep stable item_keys — they are stored in the DB.

export type SectionId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface FrameworkItem {
  key: string;
  label: string;
  // Optional category — used by aggregation (market intel / company insight / AI usage).
  category?: "market_intel" | "company_insight" | "ai_usage" | "referral";
}

export interface FrameworkSection {
  id: SectionId;
  title: string;
  caption?: string;
  items: FrameworkItem[];
}

export const FRAMEWORK_SECTIONS: FrameworkSection[] = [
  {
    id: 1,
    title: "Who they are",
    items: [
      { key: "current_job_title", label: "Current job title" },
      { key: "current_employer", label: "Current employer" },
      { key: "location_work_pref", label: "Location and work preference" },
      { key: "time_in_role", label: "Time in current role" },
    ],
  },
  {
    id: 2,
    title: "The money",
    items: [
      { key: "salary_current_total", label: "Current salary (total package)" },
      { key: "bonus_equity", label: "Bonus and equity" },
      { key: "salary_expectation", label: "Salary expectation" },
      { key: "salary_flexible", label: "Is expectation flexible?" },
      { key: "notice_period", label: "Notice period" },
      { key: "available_from", label: "Available from date" },
    ],
  },
  {
    id: 3,
    title: "Why they're looking",
    items: [
      { key: "driving_search", label: "What is driving the search?" },
      { key: "missing_currently", label: "What is missing currently?" },
      { key: "activity_level", label: "How active are they?" },
      { key: "other_processes", label: "Other processes ongoing?" },
      { key: "counter_offer_risk", label: "Counter offer risk — what would make them stay?" },
    ],
  },
  {
    id: 4,
    title: "What they want",
    items: [
      { key: "ideal_next_role", label: "Ideal next role description" },
      { key: "company_size_stage", label: "Company size and stage preference" },
      { key: "sector_preferences", label: "Sector preferences" },
      { key: "team_environment", label: "Team environment wanted" },
      { key: "twelve_month_success", label: "12 month success definition" },
      { key: "equity_progression", label: "Equity and progression importance" },
    ],
  },
  {
    id: 5,
    title: "What they won't do",
    items: [
      { key: "company_dealbreakers", label: "Company types — dealbreakers" },
      { key: "working_pattern_dealbreakers", label: "Working pattern dealbreakers" },
      { key: "sectors_avoid", label: "Sectors to move away from" },
      { key: "salary_floor", label: "Salary floor" },
      { key: "withdrawal_triggers", label: "Any other withdrawal triggers" },
    ],
  },
  {
    id: 6,
    title: "Skills and background",
    items: [
      { key: "key_skills", label: "Key skills and technologies" },
      { key: "industries", label: "Industries worked in" },
      { key: "team_sizes", label: "Team sizes led or worked in" },
      { key: "biggest_achievement", label: "Biggest current achievement" },
      { key: "strengths", label: "Genuine strengths" },
      { key: "less_of", label: "What they want to do less of" },
    ],
  },
  {
    id: 7,
    title: "Market feedback",
    caption: "Proprietary market intel — aggregated into Weekly Intel.",
    items: [
      { key: "approach_volume", label: "Volume of approaches received", category: "market_intel" },
      { key: "other_offers_benchmark", label: "What other companies are offering (salary benchmarking)", category: "market_intel" },
      { key: "roles_being_approached", label: "Roles being approached for most", category: "market_intel" },
      { key: "how_long_looking", label: "How long actively looking", category: "market_intel" },
      { key: "offers_turned_down", label: "Offers received and turned down", category: "market_intel" },
      { key: "what_put_off", label: "What put them off those offers", category: "market_intel" },
    ],
  },
  {
    id: 8,
    title: "Current role insights",
    caption: "Company intel — tagged to the employer record.",
    items: [
      { key: "culture_current", label: "Culture at current company", category: "company_insight" },
      { key: "company_performance", label: "Company performance and changes", category: "company_insight" },
      { key: "team_structure", label: "Team structure", category: "company_insight" },
      { key: "others_leaving", label: "Others leaving too?", category: "company_insight" },
      { key: "tools_in_use", label: "Technologies and tools in use", category: "company_insight" },
      { key: "ai_usage_today", label: "How they use AI currently", category: "ai_usage" },
      { key: "ai_tools_used", label: "What AI tools they use day to day", category: "ai_usage" },
      { key: "ai_changing_role", label: "Is AI changing their role?", category: "ai_usage" },
      { key: "ai_view", label: "Their view on AI in their field", category: "ai_usage" },
    ],
  },
  {
    id: 9,
    title: "Referrals",
    items: [
      { key: "others_looking", label: "Anyone else who might be looking?", category: "referral" },
      { key: "strong_network", label: "Strong people in their network?", category: "referral" },
    ],
  },
];

export const ALL_ITEMS = FRAMEWORK_SECTIONS.flatMap((s) =>
  s.items.map((i) => ({ ...i, section: s.id })),
);

export function getItem(key: string) {
  return ALL_ITEMS.find((i) => i.key === key);
}

/** A section is "complete" when at least one item in it has a value. */
export function sectionsCompleteCount(
  items: { item_key: string; value: string | null }[],
): { complete: number; total: number; completedSections: SectionId[]; missingSections: SectionId[] } {
  const bySection = new Map<SectionId, boolean>();
  for (const s of FRAMEWORK_SECTIONS) bySection.set(s.id, false);
  for (const row of items) {
    const it = getItem(row.item_key);
    if (!it) continue;
    if (row.value && row.value.trim().length > 0) bySection.set(it.section, true);
  }
  const completedSections = [...bySection.entries()].filter(([, v]) => v).map(([k]) => k);
  const missingSections = [...bySection.entries()].filter(([, v]) => !v).map(([k]) => k);
  return {
    complete: completedSections.length,
    total: FRAMEWORK_SECTIONS.length,
    completedSections,
    missingSections,
  };
}

export function completenessColor(complete: number) {
  if (complete >= 7) return "text-green-500 border-green-500/40 bg-green-500/10";
  if (complete >= 4) return "text-amber-500 border-amber-500/40 bg-amber-500/10";
  return "text-red-500 border-red-500/40 bg-red-500/10";
}
