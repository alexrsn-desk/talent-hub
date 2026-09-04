import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useJobs, useCandidateJobs } from "@/hooks/use-data";
import { cn } from "@/lib/utils";

const INTERVIEW_STAGES = ["First Stage", "Second Stage", "Final Stage"];

/**
 * One compact row per live job. Status only — the whole row opens the job,
 * there are no inline action buttons. Sorted by urgency: the emptiest
 * pipelines come first.
 */
export function LiveJobsStatus() {
  const nav = useNavigate();
  const { data: jobs = [] } = useJobs();
  const { data: links = [] } = useCandidateJobs();

  const rows = useMemo(() => {
    const counts = new Map<string, { shortlisted: number; cvsSent: number; interviewing: number }>();
    for (const cj of links as any[]) {
      if (!cj.job_id || cj.withdrawn) continue;
      const c = counts.get(cj.job_id) ?? { shortlisted: 0, cvsSent: 0, interviewing: 0 };
      if (cj.stage === "Shortlist") c.shortlisted++;
      if (cj.stage === "Sent CV") c.cvsSent++;
      if (INTERVIEW_STAGES.includes(cj.stage)) c.interviewing++;
      counts.set(cj.job_id, c);
    }

    return jobs
      .filter((j: any) => j.status === "Active")
      .map((j: any) => {
        const c = counts.get(j.id) ?? { shortlisted: 0, cvsSent: 0, interviewing: 0 };
        // Urgency: nothing live is the most urgent, then no CVs out, then no shortlist.
        const urgency =
          (c.interviewing === 0 ? 4 : 0) + (c.cvsSent === 0 ? 2 : 0) + (c.shortlisted === 0 ? 1 : 0);
        return { job: j, ...c, urgency };
      })
      .sort((a, b) => b.urgency - a.urgency || a.job.title.localeCompare(b.job.title));
  }, [jobs, links]);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2 sm:px-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Live Jobs
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-6">No live jobs on the desk.</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_56px_56px_64px] gap-2 border-b border-border px-4 pb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground sm:px-6">
            <span>Job · Client</span>
            <span className="text-right">Short</span>
            <span className="text-right">CVs</span>
            <span className="text-right">Interview</span>
          </div>
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <button
                key={r.job.id}
                onClick={() => nav(`/jobs?jobId=${r.job.id}`)}
                className="grid w-full grid-cols-[1fr_56px_56px_64px] items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/40 sm:px-6"
              >
                <span className="min-w-0 truncate text-[13px]">
                  <span className="font-medium">{r.job.title}</span>
                  {r.job.clients?.company_name && (
                    <span className="text-muted-foreground"> · {r.job.clients.company_name}</span>
                  )}
                </span>
                <span className="text-right text-[13px] tabular-nums text-muted-foreground">
                  {r.shortlisted || "—"}
                </span>
                <span
                  className={cn(
                    "text-right text-[13px] tabular-nums",
                    r.cvsSent === 0 ? "text-destructive" : "font-medium",
                  )}
                >
                  {r.cvsSent || "0"}
                </span>
                <span className="text-right text-[13px] tabular-nums text-muted-foreground">
                  {r.interviewing || "—"}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
