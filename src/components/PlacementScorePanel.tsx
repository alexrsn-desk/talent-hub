import { type PlacementScore, bandColorClass } from "@/lib/placement-score";
import { TrendingUp, TrendingDown, Minus, CheckCircle2, AlertTriangle } from "lucide-react";

export function PlacementScorePanel({ score }: { score: PlacementScore }) {
  const color = bandColorClass(score.band);
  const TrendIcon = score.trend === "up" ? TrendingUp : score.trend === "down" ? TrendingDown : Minus;
  const trendLabel =
    score.trend === "up"
      ? "Rising — pipeline improving"
      : score.trend === "down"
      ? "Falling — pipeline deteriorating"
      : "Stable";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            Placement probability
          </div>
          <div className={`flex items-center gap-2 mt-1 ${color}`}>
            <span className="text-4xl font-semibold tabular-nums">{score.score}%</span>
            <TrendIcon className="h-6 w-6" />
            {score.trendDelta !== 0 && (
              <span className="text-sm text-muted-foreground font-normal">
                {score.trendDelta > 0 ? "+" : ""}
                {score.trendDelta} vs 7d
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{trendLabel}</div>
        </div>
        <div className="text-right max-w-[60%]">
          <div className={`text-sm font-medium ${color}`}>{score.headline}</div>
          <div className="text-xs text-muted-foreground mt-1">{score.topAction}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            What is helping
          </h3>
          {score.positives.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing yet — every action you take from here pushes this higher.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {score.positives.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span>{p.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            What is hurting — and what to do
          </h3>
          {score.negatives.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No drag right now. Keep momentum: {score.topAction.toLowerCase()}.
            </p>
          ) : (
            <ul className="space-y-2">
              {score.negatives.map((n, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div>{n.label}</div>
                    {n.action && (
                      <div className="text-xs text-muted-foreground mt-0.5">→ {n.action}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
