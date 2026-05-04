import { useNavigate } from "react-router-dom";
import { useWeekStats, type WeekStats } from "@/hooks/use-week-stats";
import { cn } from "@/lib/utils";

type Props = {
  ownerUserId?: string;
  /** Compact variant for inside manager consultant cards */
  compact?: boolean;
};

function formatRange(s: WeekStats) {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const friday = new Date(s.weekStart + "T00:00:00");
  friday.setDate(friday.getDate() + 4);
  const fIso = friday.toISOString().slice(0, 10);
  return `Week of ${fmt(s.weekStart)} — ${fmt(fIso)}`;
}

function overdueColor(n: number) {
  if (n === 0) return "text-muted-foreground";
  if (n <= 2) return "text-yellow-400";
  return "text-destructive";
}
function offerColor(n: number) {
  return n > 0 ? "text-emerald-400" : "text-muted-foreground";
}
function placementsColor(n: number) {
  return n > 0 ? "text-emerald-400" : "text-muted-foreground";
}

export function WeekStatsBar({ ownerUserId, compact = false }: Props) {
  const navigate = useNavigate();
  const { data, isLoading } = useWeekStats(ownerUserId);

  const items = [
    {
      label: "Overdue",
      value: data?.overdue ?? 0,
      color: overdueColor(data?.overdue ?? 0),
      dot: (data?.overdue ?? 0) >= 3 ? "🔴" : null,
      onClick: () => navigate("/?focus=overdue"),
    },
    {
      label: "CVs sent",
      value: data?.cvsSent ?? 0,
      color: "text-foreground",
      onClick: () => navigate("/candidates?stage=Submitted"),
    },
    {
      label: "Interviews",
      value: data?.interviews ?? 0,
      color: "text-foreground",
      onClick: () => navigate("/candidates?stage=Interview"),
    },
    {
      label: "At offer",
      value: data?.atOffer ?? 0,
      color: offerColor(data?.atOffer ?? 0),
      onClick: () => navigate("/candidates?stage=Offer"),
    },
    {
      label: "Placements",
      value: data?.placements ?? 0,
      color: placementsColor(data?.placements ?? 0),
      highlight: (data?.placements ?? 0) > 0,
      onClick: () => navigate("/placements"),
    },
  ];

  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}>
      <div
        className={cn(
          "grid grid-cols-5 gap-1.5 sm:gap-3 rounded-lg border border-border bg-card",
          compact ? "px-2 py-2" : "px-3 py-3 sm:px-4 sm:py-3.5",
        )}
      >
        {items.map((it) => (
          <button
            key={it.label}
            onClick={it.onClick}
            className={cn(
              "group text-center rounded-md px-1 py-1 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              it.highlight && "bg-emerald-500/5",
            )}
          >
            <div
              className={cn(
                "uppercase tracking-wider text-muted-foreground font-medium",
                compact ? "text-[9px]" : "text-[10px] sm:text-[11px]",
              )}
            >
              {it.label}
            </div>
            <div
              className={cn(
                "tabular-nums font-semibold leading-tight mt-0.5 flex items-center justify-center gap-1",
                compact ? "text-base" : "text-2xl sm:text-3xl",
                it.color,
              )}
            >
              <span>{isLoading ? "—" : it.value}</span>
              {it.dot && <span className={compact ? "text-[10px]" : "text-xs"}>{it.dot}</span>}
            </div>
          </button>
        ))}
      </div>
      {!compact && data && (
        <p className="text-[11px] text-muted-foreground px-1">{formatRange(data)}</p>
      )}
    </div>
  );
}
