import { useTrialStatus } from "@/hooks/use-usage";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

export function TrialBanner() {
  const trial = useTrialStatus();
  const [dismissed, setDismissed] = useState(false);

  if (!trial.showBanner || dismissed) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span className="text-muted-foreground">
          Your free trial ends in {trial.daysLeft} day{trial.daysLeft !== 1 ? "s" : ""}. Choose a plan to keep access.
        </span>
        <Button size="sm" variant="outline" className="ml-2 h-7 text-xs">Solo £79/month</Button>
        <Button size="sm" className="h-7 text-xs">Pro £129/month</Button>
      </div>
      <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
