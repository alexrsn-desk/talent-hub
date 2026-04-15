import { useState } from "react";
import { Lightbulb, AlertTriangle, ArrowRight, X, Loader2, ThumbsUp, ThumbsDown, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CallSignal, useUpdateSignalStatus, useFeedbackSignal } from "@/hooks/use-signals";
import { toast } from "sonner";

const signalColors: Record<string, string> = {
  "Hiring Signal": "text-yellow-400",
  "Candidate Signal": "text-violet-400",
  "Referral Opportunity": "text-emerald-400",
  "BD Lead": "text-sky-400",
  "Missing Follow-up": "text-amber-400",
  "Missing Next Action": "text-amber-400",
  "Missing Interview Date": "text-amber-400",
  "Salary Mismatch": "text-amber-400",
  "Missing Commitment": "text-amber-400",
};

const signalBg: Record<string, string> = {
  "Hiring Signal": "bg-yellow-400/10 border-yellow-400/30",
  "Candidate Signal": "bg-violet-400/10 border-violet-400/30",
  "Referral Opportunity": "bg-emerald-400/10 border-emerald-400/30",
  "BD Lead": "bg-sky-400/10 border-sky-400/30",
};

const missingActionBg = "bg-amber-400/10 border-amber-400/30";

function SignalCard({
  signal,
  updateStatus,
  feedbackSignal,
  onDismiss,
  expanded,
  onToggle,
}: {
  signal: CallSignal;
  updateStatus: ReturnType<typeof useUpdateSignalStatus>;
  feedbackSignal: ReturnType<typeof useFeedbackSignal>;
  onDismiss: (id: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isMissingAction = signal.signal_category === "missing_action";

  const handleThumbsDown = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onDismiss(signal.id);
    feedbackSignal.mutate({ id: signal.id, rating: "thumbs_down" });
    toast("Got it, we'll improve", { duration: 2000 });
  };

  const handleThumbsUp = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    feedbackSignal.mutate({ id: signal.id, rating: "thumbs_up" });
  };

  const isActioned = signal.status !== "unactioned";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); onToggle(); }
    if (e.key === "Escape") { e.preventDefault(); onToggle(); }
  };

  const borderColor = isMissingAction ? "border-l-amber-400" : "border-l-yellow-400";

  return (
    <div className={`transition-all duration-200 ${expanded ? `bg-muted/20 border-l-2 ${borderColor}` : ""}`}>
      {/* Collapsed row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className={`flex items-center gap-2 px-2 py-2 group cursor-pointer hover:bg-muted/30 transition-colors min-h-[40px] ${isActioned ? "opacity-50" : ""}`}
      >
        {isMissingAction ? (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        ) : (
          <Lightbulb className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
        )}
        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${signalColors[signal.signal_type] || ""}`}>
          {signal.signal_type}
        </Badge>
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {signal.suggested_action}
        </span>
        {!expanded && signal.status === "unactioned" && (
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-emerald-400" onClick={e => { e.stopPropagation(); handleThumbsUp(); }} title="Helpful">
              <ThumbsUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-emerald-400" onClick={e => { e.stopPropagation(); updateStatus.mutate({ id: signal.id, status: "actioned" }); toast.success("Actioned"); }} title="Mark actioned">
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        )}
        {signal.feedback_rating === "thumbs_up" && (
          <span className="text-[10px] text-emerald-400 shrink-0">✓</span>
        )}
        {isActioned && !signal.feedback_rating && (
          <span className="text-[10px] text-muted-foreground uppercase shrink-0">{signal.status}</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Expanded detail */}
      <div className={`overflow-hidden transition-all duration-200 ease-in-out ${expanded ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-4 pb-3 pt-1 space-y-2">
          {signal.trigger_phrase && (
            <p className="text-xs text-muted-foreground italic">"{signal.trigger_phrase}"</p>
          )}
          <p className="text-sm text-foreground">{signal.explanation}</p>
          <p className="text-xs text-muted-foreground">Suggested: {signal.suggested_action}</p>
          {signal.suggested_date && (
            <p className="text-xs text-muted-foreground">Suggested date: {new Date(signal.suggested_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
          )}

          {signal.status === "unactioned" && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-400 hover:text-emerald-300" onClick={e => { e.stopPropagation(); handleThumbsUp(); }}>
                <ThumbsUp className="h-3 w-3" /> Helpful
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive/80" onClick={e => { e.stopPropagation(); handleThumbsDown(); }}>
                <ThumbsDown className="h-3 w-3" /> Not Useful
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={e => { e.stopPropagation(); updateStatus.mutate({ id: signal.id, status: "actioned" }); toast.success("Actioned"); }}>
                <ArrowRight className="h-3 w-3" /> Mark Actioned
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={e => { e.stopPropagation(); updateStatus.mutate({ id: signal.id, status: "dismissed" }); toast("Dismissed"); }}>
                <X className="h-3 w-3" /> Dismiss
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SignalBox({ signals, loading }: { signals: CallSignal[]; loading?: boolean }) {
  const updateStatus = useUpdateSignalStatus();
  const feedbackSignal = useFeedbackSignal();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visible = signals.filter(
    (s) => s.status !== "dismissed" && s.feedback_rating !== "thumbs_down" && !dismissedIds.has(s.id)
  );

  const opportunities = visible.filter((s) => s.signal_category !== "missing_action");
  const missingActions = visible.filter((s) => s.signal_category === "missing_action");

  if (loading) {
    return (
      <div className="border border-yellow-400/30 bg-yellow-400/5 rounded-lg p-4 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
        <span className="text-sm text-yellow-400">Analysing for signals…</span>
      </div>
    );
  }

  if (visible.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  return (
    <div className="space-y-3">
      {/* Missing Actions — shown first, more urgent */}
      {missingActions.length > 0 && (
        <div className="border border-amber-400/30 bg-amber-400/5 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-medium text-amber-400">
              Actions You May Have Missed ({missingActions.filter(s => s.status === "unactioned").length})
            </h3>
          </div>
          <div className="divide-y divide-border">
            {missingActions.map((signal) => (
              <SignalCard key={signal.id} signal={signal} updateStatus={updateStatus} feedbackSignal={feedbackSignal} onDismiss={handleDismiss} />
            ))}
          </div>
        </div>
      )}

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <div className="border border-yellow-400/30 bg-yellow-400/5 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-400" />
            <h3 className="text-sm font-medium text-yellow-400">
              Signals Detected ({opportunities.filter(s => s.status === "unactioned").length} unactioned)
            </h3>
          </div>
          <div className="divide-y divide-border">
            {opportunities.map((signal) => (
              <SignalCard key={signal.id} signal={signal} updateStatus={updateStatus} feedbackSignal={feedbackSignal} onDismiss={handleDismiss} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SignalBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 bg-yellow-400/20 text-yellow-400 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
      <Lightbulb className="h-2.5 w-2.5" />
      {count}
    </span>
  );
}
