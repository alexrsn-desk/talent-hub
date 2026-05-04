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

type Row = {
  label: string;
  value: number;
  valueClass?: string;
  suffix?: string | null;
  onClick?: () => void;
};

function StatRow({ row, isLoading, compact }: { row: Row; isLoading: boolean; compact: boolean }) {
  return (
    <button
      onClick={row.onClick}
      className={cn(
        "w-full flex items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span
        className={cn(
          "text-muted-foreground",
          compact ? "text-[11px]" : "text-xs sm:text-sm",
        )}
      >
        {row.label}
      </span>
      <span
        className={cn(
          "tabular-nums font-semibold flex items-baseline gap-1",
          compact ? "text-sm" : "text-base sm:text-lg",
          row.valueClass ?? "text-foreground",
        )}
      >
        <span>{isLoading ? "—" : row.value}</span>
        {row.suffix && <span className="text-xs">{row.suffix}</span>}
      </span>
    </button>
  );
}

export function WeekStatsBar({ ownerUserId, compact = false }: Props) {
  const navigate = useNavigate();
  const { data, isLoading } = useWeekStats(ownerUserId);

  const overdue = data?.overdue ?? 0;
  const atOffer = data?.atOffer ?? 0;

  const thisWeek: Row[] = [
    {
      label: "CVs sent",
      value: data?.cvsSent ?? 0,
      onClick: () => navigate("/candidates?stage=Submitted"),
    },
    {
      label: "Overdue",
      value: overdue,
      valueClass: overdue >= 1 ? "text-destructive" : "text-foreground",
      suffix: overdue >= 1 ? "🔴" : null,
      onClick: () => navigate("/?focus=overdue"),
    },
  ];

  const pipeline: Row[] = [
    {
      label: "At offer",
      value: atOffer,
      valueClass: atOffer >= 1 ? "text-emerald-400" : "text-foreground",
      onClick: () => navigate("/candidates?stage=Offer"),
    },
    {
      label: "At interview",
      value: data?.interviews ?? 0,
      onClick: () => navigate("/candidates?stage=Interview"),
    },
    {
      label: "Live CVs out",
      value: data?.liveCvsOut ?? 0,
      onClick: () => navigate("/candidates?stage=Submitted,ClientReview"),
    },
  ];

  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}>
      <div
        className={cn(
          "rounded-lg border border-border bg-card",
          compact ? "px-2 py-2" : "px-3 py-3 sm:px-4 sm:py-3.5",
        )}
      >
        <div className="grid grid-cols-2 gap-x-4 sm:gap-x-8">
          <div className="space-y-0.5">
            <div
              className={cn(
                "uppercase tracking-wider text-muted-foreground font-medium px-2 mb-1",
                compact ? "text-[9px]" : "text-[10px] sm:text-[11px]",
              )}
            >
              This Week
            </div>
            {thisWeek.map((r) => (
              <StatRow key={r.label} row={r} isLoading={isLoading} compact={compact} />
            ))}
          </div>
          <div className="space-y-0.5 border-l border-border pl-3 sm:pl-6">
            <div
              className={cn(
                "uppercase tracking-wider text-muted-foreground font-medium px-2 mb-1",
                compact ? "text-[9px]" : "text-[10px] sm:text-[11px]",
              )}
            >
              Pipeline
            </div>
            {pipeline.map((r) => (
              <StatRow key={r.label} row={r} isLoading={isLoading} compact={compact} />
            ))}
          </div>
        </div>
      </div>
      {!compact && data && (
        <p className="text-[11px] text-muted-foreground px-1">{formatRange(data)}</p>
      )}
    </div>
  );
}
