import { type PlacementScore, bandColorClass, trendArrow } from "@/lib/placement-score";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export function PlacementScoreBadge({
  score,
  showAction = true,
  size = "sm",
}: {
  score: PlacementScore;
  showAction?: boolean;
  size?: "sm" | "lg";
}) {
  const color = bandColorClass(score.band);
  const TrendIcon = score.trend === "up" ? TrendingUp : score.trend === "down" ? TrendingDown : Minus;
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className={`flex items-center gap-1 font-semibold tabular-nums ${color} ${size === "lg" ? "text-2xl" : "text-sm"}`}>
        <span>{score.score}%</span>
        <TrendIcon className={size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5"} />
        {size === "lg" && score.trendDelta !== 0 && (
          <span className="text-xs text-muted-foreground font-normal">
            {score.trendDelta > 0 ? "+" : ""}
            {score.trendDelta} vs 7d ago
          </span>
        )}
      </div>
      {showAction && (
        <div className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
          <span className="font-medium text-foreground/80">{score.headline}.</span>{" "}
          {score.topAction}
        </div>
      )}
    </div>
  );
}
