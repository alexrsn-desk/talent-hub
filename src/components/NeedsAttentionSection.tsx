import { AlertTriangle, ArrowRight, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useJobs } from "@/hooks/use-data";
import { usePlacementScores } from "@/hooks/use-placement-scores";

export function NeedsAttentionSection() {
  const navigate = useNavigate();
  const { data: jobs = [] } = useJobs();
  const scores = usePlacementScores();

  const flagged = jobs
    .filter((j) => j.status === "Open")
    .map((j) => ({ job: j, score: scores.get(j.id) }))
    .filter((x) => x.score && (x.score.score < 40 || x.score.trendDelta <= -10))
    .sort((a, b) => (a.score!.score - b.score!.score));

  if (flagged.length === 0) return null;

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h2 className="text-sm font-medium">
          Needs attention — recoverable ({flagged.length})
        </h2>
      </div>
      <div className="space-y-2">
        {flagged.slice(0, 5).map(({ job, score }) => (
          <button
            key={job.id}
            onClick={() => navigate(`/jobs?jobId=${job.id}`)}
            className="w-full text-left flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 hover:bg-muted/30 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {(job.clients as any)?.company_name || "—"} · {job.title}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                One action: {score!.topAction}
              </div>
            </div>
            <div className="flex items-center gap-1 text-red-400 font-semibold tabular-nums text-sm flex-shrink-0">
              {score!.score}%
              {score!.trend === "down" && <TrendingDown className="h-3.5 w-3.5" />}
            </div>
          </button>
        ))}
      </div>
      {flagged.length > 5 && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 gap-1"
          onClick={() => navigate("/jobs")}
        >
          View all jobs <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
