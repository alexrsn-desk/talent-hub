import { useState } from "react";
import { Lightbulb, AlertTriangle, ArrowRight, X, Loader2, ThumbsUp, ThumbsDown, CalendarPlus, ListPlus, Clock } from "lucide-react";
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
}: {
  signal: CallSignal;
  updateStatus: ReturnType<typeof useUpdateSignalStatus>;
  feedbackSignal: ReturnType<typeof useFeedbackSignal>;
  onDismiss: (id: string) => void;
}) {
  const isMissingAction = signal.signal_category === "missing_action";

  const handleThumbsDown = () => {
    onDismiss(signal.id);
    feedbackSignal.mutate({ id: signal.id, rating: "thumbs_down" });
    toast("Got it, we'll improve", { duration: 2000 });
  };

  const handleThumbsUp = () => {
    feedbackSignal.mutate({ id: signal.id, rating: "thumbs_up" });
  };

  return (
    <div
      className={`rounded-md border p-3 space-y-2 ${
        signal.status === "unactioned"
          ? isMissingAction
            ? missingActionBg
            : signalBg[signal.signal_type] || "bg-muted/30 border-border"
          : "bg-muted/20 border-border opacity-60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className={`text-[10px] ${signalColors[signal.signal_type] || ""}`}>
          {signal.signal_type}
        </Badge>
        <div className="flex items-center gap-1">
          {signal.feedback_rating === "thumbs_up" ? (
            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
              <ThumbsUp className="h-3 w-3" /> Helpful
            </span>
          ) : signal.status === "unactioned" ? (
            <>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-emerald-400" onClick={handleThumbsUp} title="Helpful signal">
                <ThumbsUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={handleThumbsDown} title="Not useful">
                <ThumbsDown className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground uppercase">{signal.status}</span>
          )}
        </div>
      </div>
      <p className="text-xs italic text-muted-foreground">"{signal.trigger_phrase}"</p>
      <p className="text-sm">{signal.explanation}</p>
      <p className="text-xs text-primary">{signal.suggested_action}</p>
      {signal.status === "unactioned" && (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {/* Missing action quick buttons */}
          {isMissingAction && signal.signal_type === "Missing Follow-up" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => {
                updateStatus.mutate({ id: signal.id, status: "actioned" });
                toast.success(`Follow-up set${signal.suggested_date ? ` for ${signal.suggested_date}` : ""}`);
              }}
            >
              <CalendarPlus className="h-3 w-3" /> Set follow-up{signal.suggested_date ? ` for ${signal.suggested_date}` : ""}
            </Button>
          )}
          {isMissingAction && (signal.signal_type === "Missing Next Action" || signal.signal_type === "Missing Commitment") && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => {
                updateStatus.mutate({ id: signal.id, status: "actioned" });
                toast.success("Added to next actions");
              }}
            >
              <ListPlus className="h-3 w-3" /> Add to next actions
            </Button>
          )}
          {isMissingAction && signal.signal_type === "Missing Interview Date" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => {
                updateStatus.mutate({ id: signal.id, status: "actioned" });
                toast.success("Interview date logged");
              }}
            >
              <Clock className="h-3 w-3" /> Log interview date
            </Button>
          )}

          {/* Opportunity action buttons */}
          {!isMissingAction && (signal.signal_type === "BD Lead" || signal.signal_type === "Hiring Signal") && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => {
                updateStatus.mutate({ id: signal.id, status: "actioned" });
                toast.success("Added to BD Pipeline");
              }}
            >
              <ArrowRight className="h-3 w-3" /> Add to BD Pipeline
            </Button>
          )}
          {!isMissingAction && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => {
                updateStatus.mutate({ id: signal.id, status: "actioned" });
                toast.success("Added to Actions");
              }}
            >
              <ArrowRight className="h-3 w-3" /> Add to Actions
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] gap-1 text-muted-foreground"
            onClick={() => {
              updateStatus.mutate({ id: signal.id, status: "dismissed" });
              toast("Signal dismissed");
            }}
          >
            <X className="h-3 w-3" /> Dismiss
          </Button>
        </div>
      )}
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
          <div className="space-y-2">
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
          <div className="space-y-2">
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
