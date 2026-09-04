import { useWeekStats } from "@/hooks/use-week-stats";
import { cn } from "@/lib/utils";

type Stat = { label: string; value: number; tone?: "none" | "good" | "warn" };

/**
 * Horizontal status row for the current week. Pure status: no clicks,
 * no links. Colour appears only when a number genuinely means something.
 */
export function ThisWeekRow() {
  const { data, isLoading } = useWeekStats();

  const cvsSent = data?.cvsSent ?? 0;
  const booked = data?.interviewsBooked ?? 0;
  const takingPlace = data?.interviewsTakingPlace ?? 0;
  const bd = data?.bdTouchpoints ?? 0;

  const stats: Stat[] = [
    { label: "CVs sent", value: cvsSent, tone: cvsSent === 0 ? "warn" : "none" },
    { label: "Interviews booked", value: booked, tone: booked > 0 ? "good" : "none" },
    { label: "Interviews taking place", value: takingPlace },
    { label: "BD touchpoints", value: bd, tone: bd === 0 ? "warn" : "none" },
  ];

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-4 sm:px-6 sm:py-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        This Week
      </div>
      <div className="mt-3 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground truncate">
              {s.label}
            </div>
            <div
              className={cn(
                "mt-1 text-2xl sm:text-3xl font-semibold tabular-nums",
                s.tone === "warn" && "text-destructive",
                s.tone === "good" && "text-emerald-500",
              )}
            >
              {isLoading ? "—" : s.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
