import { useAllUsageStats, useUserPlan, useTrialStatus } from "@/hooks/use-usage";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Crown, Loader2, AlertTriangle } from "lucide-react";

export function MyPlanSection() {
  const { data: plan, isLoading: planLoading } = useUserPlan();
  const stats = useAllUsageStats();
  const trial = useTrialStatus();

  if (planLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isTrialActive = plan?.status === "trial" && plan.trial_ends_at && new Date(plan.trial_ends_at) > new Date();
  const isPro = plan?.plan_type === "pro" || isTrialActive;
  const planLabel = isTrialActive ? "Free Trial" : plan?.plan_type === "pro" ? "Pro" : "Solo";
  const priceLabel = isTrialActive ? "Free" : plan?.plan_type === "pro" ? "£129" : "£79";

  const resetDate = new Date();
  resetDate.setMonth(resetDate.getMonth() + 1, 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">My Plan</h2>
      </div>

      {/* Trial banner */}
      {trial.showBanner && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>Your free trial ends in {trial.daysLeft} day{trial.daysLeft !== 1 ? "s" : ""}. Choose a plan to keep access.</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">Solo £79/month</Button>
            <Button size="sm">Pro £129/month</Button>
          </div>
        </div>
      )}

      {/* Plan header */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              My Plan: <span className="text-primary">{planLabel}</span> — {priceLabel}/month
            </p>
            <p className="text-xs text-muted-foreground">
              Next reset: {resetDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          {!isPro && (
            <Button size="sm">Upgrade to Pro</Button>
          )}
        </div>
      </div>

      {/* Usage table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Feature</th>
              <th className="text-center px-3 py-2 font-medium">Used</th>
              <th className="text-center px-3 py-2 font-medium">Limit</th>
              <th className="text-center px-3 py-2 font-medium">Remaining</th>
              <th className="px-3 py-2 font-medium w-32"></th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const barColor =
                s.pct >= 90
                  ? "bg-destructive"
                  : s.pct >= 60
                  ? "bg-amber-500"
                  : "bg-emerald-500";

              return (
                <tr key={s.feature} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{s.label}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{s.used}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">
                    {s.limit === -1 ? "∞" : s.limit}
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground">
                    {s.remaining === -1 ? "∞" : s.remaining}
                  </td>
                  <td className="px-3 py-2">
                    {s.limit > 0 && (
                      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(100, s.pct)}%` }}
                        />
                      </div>
                    )}
                    {s.limit === -1 && (
                      <span className="text-xs text-muted-foreground">Unlimited</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isPro && (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground mb-2">Upgrade to Pro for unlimited access to all AI features.</p>
          <Button>Upgrade to Pro</Button>
        </div>
      )}
    </div>
  );
}
