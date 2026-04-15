import { Lock, AlertTriangle, X, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeatureLimit, FeatureType, FEATURE_LABELS } from "@/hooks/use-usage";
import { useState, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface UsageLimitGuardProps {
  featureType: FeatureType;
  children: React.ReactNode;
  /** If true, renders children but disabled when over limit */
  renderDisabled?: boolean;
}

/** Wraps an AI feature — shows inline upgrade prompt when limit reached */
export function UsageLimitGuard({ featureType, children, renderDisabled }: UsageLimitGuardProps) {
  const limit = useFeatureLimit(featureType);

  if (limit.canUse && !limit.showWarning) return <>{children}</>;

  if (limit.canUse && limit.showWarning) {
    return (
      <>
        <UsageWarningBanner featureType={featureType} used={limit.used} total={limit.limit} />
        {children}
      </>
    );
  }

  if (limit.graceGranted && limit.canUse) {
    return (
      <>
        <GraceBanner daysUntilReset={limit.daysUntilReset} featureType={featureType} />
        {children}
      </>
    );
  }

  // Limit reached
  if (renderDisabled) {
    return (
      <>
        <LimitReachedInline featureType={featureType} resetDate={limit.resetDate} daysUntilReset={limit.daysUntilReset} />
        <div className="opacity-50 pointer-events-none">{children}</div>
      </>
    );
  }

  return <LimitReachedInline featureType={featureType} resetDate={limit.resetDate} daysUntilReset={limit.daysUntilReset} />;
}

/** Inline upgrade prompt shown when limit reached */
function LimitReachedInline({ featureType, resetDate, daysUntilReset }: { featureType: FeatureType; resetDate: Date; daysUntilReset: number }) {
  const label = FEATURE_LABELS[featureType];
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
      <Lock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
      <div className="space-y-2">
        <p className="text-sm text-foreground">
          You've used all your <span className="font-medium">{label.toLowerCase()}</span> this month.
        </p>
        <p className="text-xs text-muted-foreground">
          Resets in {daysUntilReset} day{daysUntilReset !== 1 ? "s" : ""} on {resetDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.
          Or unlock unlimited access now.
        </p>
        <Button size="sm" className="mt-1">
          Upgrade to Pro — £129/month
        </Button>
      </div>
    </div>
  );
}

/** 80% warning banner — shows once per day per feature */
function UsageWarningBanner({ featureType, used, total }: { featureType: FeatureType; used: number; total: number }) {
  const [dismissed, setDismissed] = useState(false);
  const label = FEATURE_LABELS[featureType];
  const storageKey = `usage_warning_${featureType}_${new Date().toISOString().split("T")[0]}`;

  useEffect(() => {
    if (sessionStorage.getItem(storageKey)) setDismissed(true);
  }, [storageKey]);

  if (dismissed) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-muted-foreground">
          You've used {used} of {total} {label.toLowerCase()} this month. Running low —{" "}
          <button className="text-primary hover:underline underline-offset-2 font-medium">
            Pro gives you unlimited from £129/month
          </button>
        </span>
      </div>
      <button
        onClick={() => {
          sessionStorage.setItem(storageKey, "1");
          setDismissed(true);
        }}
        className="text-muted-foreground hover:text-foreground ml-2"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Grace period banner */
function GraceBanner({ daysUntilReset, featureType }: { daysUntilReset: number; featureType: FeatureType }) {
  const label = FEATURE_LABELS[featureType];
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 flex items-center gap-2 text-sm mb-3">
      <Gift className="h-4 w-4 text-emerald-500 shrink-0" />
      <span className="text-muted-foreground">
        Your plan resets in {daysUntilReset} day{daysUntilReset !== 1 ? "s" : ""} — we've added a few extra {label.toLowerCase()} to see you through.
      </span>
    </div>
  );
}

/** Lock icon tooltip for buttons when limit is reached */
export function FeatureLockButton({ featureType, children, onClick, disabled, className = "" }: {
  featureType: FeatureType;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const limit = useFeatureLimit(featureType);

  if (limit.canUse) {
    return (
      <Button onClick={onClick} disabled={disabled} className={className}>
        {children}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          disabled
          className={`opacity-50 ${className}`}
          onClick={() => {}}
        >
          <Lock className="h-3.5 w-3.5 mr-1" />
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Monthly limit reached — resets {limit.resetDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} or upgrade to Pro
      </TooltipContent>
    </Tooltip>
  );
}
