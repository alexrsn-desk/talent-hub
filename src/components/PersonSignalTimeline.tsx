import { Bell } from "lucide-react";
import { usePersonSignals, SIGNAL_TYPE_LABELS } from "@/hooks/use-desky-signals";

/**
 * Signals shown inline on a candidate/contact profile timeline.
 * Rendered as lightweight rows so they interleave with notes and activity.
 */
export function PersonSignalTimeline({
  personType,
  personId,
}: {
  personType: "candidate" | "contact";
  personId?: string;
}) {
  const { data: signals = [] } = usePersonSignals(personType, personId);
  if (signals.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {signals.map((s) => (
        <div
          key={s.id}
          className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-2 text-xs"
        >
          <Bell className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-foreground">
              {s.reason_for_recommendation || SIGNAL_TYPE_LABELS[s.signal_type] || s.signal_type}
            </p>
            {s.suggested_action && (
              <p className="text-muted-foreground mt-0.5">{s.suggested_action}</p>
            )}
          </div>
          <span className="shrink-0 text-muted-foreground">
            {new Date(s.detected_at).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  );
}
