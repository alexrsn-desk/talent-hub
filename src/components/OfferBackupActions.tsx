import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldX, ShieldAlert, Sparkles, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCandidateJobs, useJobs } from "@/hooks/use-data";
import {
  computeBackupCounts,
  computeBackupStatus,
  isDismissed,
  type OfferBackupStatus,
} from "@/components/OfferBackupSignal";

export function OfferBackupActions() {
  const { data: jobs = [] } = useJobs();
  const { data: allCandidateJobs = [] } = useCandidateJobs();
  const navigate = useNavigate();

  const items = useMemo(() => {
    const openJobIds = new Set(jobs.filter((j) => j.status === "Open").map((j) => j.id));
    const offerCJs = allCandidateJobs.filter(
      (cj) => cj.stage === "Offer" && openJobIds.has(cj.job_id),
    );

    return offerCJs
      .map((cj) => {
        const job = jobs.find((j) => j.id === cj.job_id);
        if (!job) return null;
        const counts = computeBackupCounts(allCandidateJobs, cj.job_id, cj.id);
        const status: OfferBackupStatus = computeBackupStatus(counts);
        if (status === "green") return null;
        if (isDismissed(cj.id, cj.stage_changed_at)) return null;
        return { cj, job, counts, status };
      })
      .filter(Boolean) as Array<{
      cj: (typeof allCandidateJobs)[number];
      job: (typeof jobs)[number];
      counts: ReturnType<typeof computeBackupCounts>;
      status: OfferBackupStatus;
    }>;
  }, [jobs, allCandidateJobs]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldX className="h-4 w-4 text-red-400" />
        <h2 className="text-sm font-medium">Offer-stage backup checks ({items.length})</h2>
      </div>
      <div className="space-y-2">
        {items.map(({ cj, job, counts, status }) => {
          const Icon = status === "red" ? ShieldX : ShieldAlert;
          const tone =
            status === "red"
              ? "border-red-500/50 bg-red-500/10 text-red-300"
              : "border-amber-500/50 bg-amber-500/10 text-amber-300";
          const heading =
            status === "red"
              ? "🚨 No backup"
              : "⚠️ Thin backup";
          const candidateName = cj.candidates?.name || "Candidate";
          const clientName = (job as any).clients?.company_name || "client";
          const goJob = () => navigate(`/jobs?jobId=${job.id}`);

          return (
            <div
              key={cj.id}
              className={`rounded-md border-2 ${tone} px-3 py-2.5 flex items-start gap-3`}
            >
              <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0 text-xs">
                <div className="font-semibold">
                  {heading} — {job.title} at {clientName}
                </div>
                <div className="opacity-90 mt-0.5">
                  {candidateName} is at offer with{" "}
                  {status === "red"
                    ? "no backup"
                    : `${counts.screening} at Screening, 0 on Shortlist`}
                  .
                </div>
                <div className="mt-1 opacity-75">
                  Shortlist {counts.shortlist} · Screening {counts.screening} · Longlist{" "}
                  {counts.longlist}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-1.5 flex-shrink-0">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={goJob}>
                  <Eye className="h-3 w-3" /> View pipeline
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={goJob}>
                  <Sparkles className="h-3 w-3" /> Find backups
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
