import { useMemo, useState } from "react";
import { Lightbulb, ChevronDown, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallSignal, useUpdateSignalStatus, useFeedbackSignal } from "@/hooks/use-signals";
import { useSignalPreferences } from "@/hooks/use-signal-preferences";
import { getSignalCategory, CATEGORY_LABELS, SignalCategoryKey } from "@/lib/signal-categories";
import { SignalBox } from "@/components/SignalBox";

/**
 * Dashboard signal summary.
 * - Collapsed by default — shows a one-line summary by category.
 * - Click to expand and review individual signals.
 * - Filters by user preferences (categories, signal types, confidence, daily limit).
 * - Deduplicates: signals unactioned for 3+ days move to Archived (toggle to view).
 */
export function SignalSummary({ signals }: { signals: CallSignal[] }) {
  const { data: prefs } = useSignalPreferences();
  const [expanded, setExpanded] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const updateStatus = useUpdateSignalStatus();
  const feedbackSignal = useFeedbackSignal();

  const { mainSignals, archivedSignals, hiddenLowCount, byCategory } = useMemo(() => {
    if (!prefs) return { mainSignals: [], archivedSignals: [], hiddenLowCount: 0, byCategory: {} as Record<SignalCategoryKey, number> };

    // 1. Filter by user preferences (categories + individual signal types)
    let filtered = signals.filter((s) => {
      if (s.status !== "unactioned") return false;
      if (s.feedback_rating === "thumbs_down") return false;

      const cat = getSignalCategory(s.signal_type, s.signal_category);
      if (!prefs.enabled_categories[cat]) return false;

      // Per-signal toggle (default true if unknown signal type)
      if (prefs.enabled_signals[s.signal_type] === false) return false;

      return true;
    });

    // 2. Compute days unactioned from created_at
    const withDays = filtered.map((s) => {
      const days = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000);
      return { ...s, days_unactioned: days };
    });

    // 3. Confidence filter
    const lowHidden = withDays.filter((s) => s.confidence === "low").length;
    const confFiltered = prefs.show_low_confidence
      ? withDays
      : withDays.filter((s) => s.confidence !== "low");

    // 4. Deduplication: 3+ days unactioned → archived
    const archived = confFiltered.filter((s) => (s.days_unactioned || 0) >= 3);
    const main = confFiltered.filter((s) => (s.days_unactioned || 0) < 3);

    // 5. Sort by priority_score desc, then created_at desc
    main.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0)
      || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // 6. Apply daily limit unless showAll
    const limited = showAll ? main : main.slice(0, prefs.daily_limit);

    // 7. Group counts by category
    const cats: Record<string, number> = {};
    limited.forEach((s) => {
      const cat = getSignalCategory(s.signal_type, s.signal_category);
      cats[cat] = (cats[cat] || 0) + 1;
    });

    return {
      mainSignals: limited,
      archivedSignals: archived,
      hiddenLowCount: prefs.show_low_confidence ? 0 : lowHidden,
      byCategory: cats as Record<SignalCategoryKey, number>,
    };
  }, [signals, prefs, showAll]);

  if (!prefs) return null;
  if (mainSignals.length === 0 && archivedSignals.length === 0) return null;

  // Build summary line
  const summaryParts: string[] = [];
  (Object.keys(byCategory) as SignalCategoryKey[]).forEach((cat) => {
    const n = byCategory[cat];
    if (!n) return;
    const label = CATEGORY_LABELS[cat].replace(" Signals", "").toLowerCase();
    summaryParts.push(`${n} ${label} signal${n > 1 ? "s" : ""}`);
  });

  const summaryLine = summaryParts.length > 0
    ? `You have ${summaryParts.join(", ").replace(/, ([^,]*)$/, " and $1")} that need attention today.`
    : "No active signals — your desk is quiet.";

  // Mark "Still unactioned" flag for day 2
  const flaggedSignals = mainSignals.map((s) => ({
    ...s,
    suggested_action: (s.days_unactioned || 0) >= 1
      ? `[Still unactioned] ${s.suggested_action}`
      : s.suggested_action,
  }));

  return (
    <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/5 overflow-hidden">
      {/* Collapsed summary header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-4 hover:bg-yellow-400/10 transition-colors text-left"
      >
        <Lightbulb className="h-4 w-4 text-yellow-400 shrink-0" />
        <span className="text-sm text-foreground flex-1">{summaryLine}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-yellow-400/20 p-3 space-y-3">
          {mainSignals.length > 0 && <SignalBox signals={flaggedSignals} />}

          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="flex gap-2">
              {!showAll && mainSignals.length >= prefs.daily_limit && (
                <Button size="sm" variant="ghost" onClick={() => setShowAll(true)} className="text-xs h-7">
                  Show all signals
                </Button>
              )}
              {hiddenLowCount > 0 && (
                <span className="text-muted-foreground self-center">
                  {hiddenLowCount} low-confidence signal{hiddenLowCount > 1 ? "s" : ""} hidden
                </span>
              )}
            </div>
            {archivedSignals.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)} className="text-xs h-7 gap-1">
                <Archive className="h-3 w-3" />
                {showArchived ? "Hide" : "View"} archived ({archivedSignals.length})
              </Button>
            )}
          </div>

          {showArchived && archivedSignals.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">
                Archived signals — unactioned for 3+ days. Will resurface if the underlying record changes.
              </p>
              <SignalBox signals={archivedSignals} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
