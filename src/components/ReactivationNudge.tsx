import { useNavigate } from "react-router-dom";
import { useBillersWorkflow } from "@/hooks/use-billers-workflow";
import { Sparkles, ArrowRight } from "lucide-react";

/**
 * Surfaces a single-line nudge on the dashboard AI Actions block when
 * multiple dormant relationships need reactivation.
 */
export function ReactivationNudge() {
  const nav = useNavigate();
  const { data } = useBillersWorkflow();
  if (!data) return null;

  const reactivationCount = data.feedTheBeast.filter(
    (i) =>
      i.id.startsWith("ftb-bd") ||
      i.id.startsWith("ftb-warm") ||
      i.id.startsWith("ftb-ref") ||
      i.id.startsWith("ftb-silver")
  ).length;

  if (reactivationCount < 2) return null;

  return (
    <button
      onClick={() => nav("/reactivation")}
      className="w-full text-left rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors p-4 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
        <div>
          <div className="text-sm font-medium">
            You have {reactivationCount} relationships to reactivate
          </div>
          <div className="text-xs text-muted-foreground">
            Guided 10-15 min campaign — AI drafts personalised messages.
          </div>
        </div>
      </div>
      <div className="text-xs font-semibold text-primary inline-flex items-center gap-1">
        Build campaign <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}
