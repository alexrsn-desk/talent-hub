import { CircleDollarSign, AlertTriangle, Calendar, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOffersSummary } from "@/hooks/use-offers";
import { Link } from "react-router-dom";

export function OffersDashboardSection() {
  const s = useOffersSummary();
  if (s.active === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4" /> Offers ({s.active})
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
        <Stat label="Awaiting" value={s.awaitingAcceptance} />
        <Stat label="In notice" value={s.inNotice} />
        <Stat label="Starting this week" value={s.startingThisWeek} />
        <Stat label="High risk" value={s.highRisk} tone={s.highRisk ? "danger" : undefined} />
        <Stat label="Total active" value={s.active} />
      </div>

      {s.highRisk > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5" />
          <span>
            <strong className="text-red-400">{s.highRisk} high-risk offer{s.highRisk === 1 ? "" : "s"}</strong> need active management today. Open the Jobs section to review.
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {s.rows.slice(0, 5).map((o: any) => (
          <Link
            key={o.id}
            to={`/jobs/${o.job_id}`}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-2 text-xs hover:border-primary/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">
                {o.candidate_name_snapshot || o.candidates?.name}{" "}
                <span className="text-muted-foreground">— {o.job_title_snapshot || o.jobs?.title}</span>
              </p>
              <p className="text-muted-foreground truncate">
                {o.client_name_snapshot || o.jobs?.clients?.company_name}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {o.salary_offered && (
                <Badge variant="outline" className="text-[10px]">£{Math.round(o.salary_offered / 1000)}k</Badge>
              )}
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  o.overall_risk === "high"
                    ? "border-red-500/40 text-red-400"
                    : o.overall_risk === "medium"
                    ? "border-amber-500/40 text-amber-400"
                    : o.overall_risk === "low"
                    ? "border-emerald-500/40 text-emerald-400"
                    : ""
                }`}
              >
                {(o.status || "").replace(/_/g, " ")}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-md border border-border px-2 py-1.5">
      <p className={`text-lg font-semibold ${tone === "danger" && value > 0 ? "text-red-400" : ""}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  );
}
