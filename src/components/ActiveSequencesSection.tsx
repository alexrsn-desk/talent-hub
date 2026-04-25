import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GitBranch, X, Zap, UserCircle2, Pause, Play, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import {
  useCandidateEnrollments,
  useEntityEnrollments,
  useRemoveEnrollment,
  usePauseEnrollment,
  useResumeEnrollment,
  type EntityType,
} from "@/hooks/use-sequences";
import { AddToSequencePanel } from "@/components/AddToSequencePanel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  /** Legacy candidate-only props (kept for back-compat). */
  candidateId?: string;
  candidateName?: string;
  /** Preferred entity-aware props. */
  entityType?: EntityType;
  entityId?: string;
  entityName?: string;
}

const statusTone: Record<string, string> = {
  active: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  completed: "bg-muted text-muted-foreground border-border",
  replied: "bg-green-500/15 text-green-400 border-green-500/30",
};

function formatDueDays(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { text: "due today", tone: "text-amber-400" };
  if (diff < 0) return { text: `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`, tone: "text-red-400" };
  return { text: `due in ${diff} day${diff === 1 ? "" : "s"}`, tone: "text-muted-foreground" };
}

export function ActiveSequencesSection(props: Props) {
  const resolvedType: EntityType = props.entityType ?? "candidate";
  const resolvedId = props.entityId ?? props.candidateId ?? "";
  const resolvedName = props.entityName ?? props.candidateName ?? "";

  // Use the entity-aware query when entityType/entityId provided, otherwise fall back to candidate-only
  const entityQuery = useEntityEnrollments(
    props.entityType ? resolvedType : null,
    props.entityType ? resolvedId : null
  );
  const candidateQuery = useCandidateEnrollments(
    !props.entityType ? props.candidateId ?? null : null
  );
  const enrollments = props.entityType ? (entityQuery.data ?? []) : (candidateQuery.data ?? []);
  const isLoading = props.entityType ? entityQuery.isLoading : candidateQuery.isLoading;

  const removeEnrollment = useRemoveEnrollment();
  const pauseEnrollment = usePauseEnrollment();
  const resumeEnrollment = useResumeEnrollment();

  const handleRemove = async (id: string, name: string) => {
    try {
      await removeEnrollment.mutateAsync(id);
      toast.success(`Removed from ${name}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove");
    }
  };
  const handlePause = async (id: string, name: string) => {
    try { await pauseEnrollment.mutateAsync(id); toast.success(`Paused ${name}`); }
    catch (e: any) { toast.error(e?.message ?? "Failed to pause"); }
  };
  const handleResume = async (id: string, name: string) => {
    try { await resumeEnrollment.mutateAsync(id); toast.success(`Resumed ${name}`); }
    catch (e: any) { toast.error(e?.message ?? "Failed to resume"); }
  };

  if (isLoading) return null;

  // Spec: "If not in any sequence: Show nothing — clean profile"
  if (enrollments.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/30 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" /> Active Sequences
        </h3>
        <AddToSequencePanel
          entityType={resolvedType}
          entityId={resolvedId}
          entityName={resolvedName}
          align="end"
          trigger={
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
              <GitBranch className="h-3 w-3" /> Add another
            </Button>
          }
        />
      </div>

      <div className="space-y-1.5">
        {enrollments.map((e) => {
          const isAuto = e.sequences?.type === "auto";
          const tone = statusTone[e.status] ?? statusTone.active;
          const total = e.total_steps ?? 0;
          const isPaused = e.status === "paused";
          const due = formatDueDays(e.start_date);
          return (
            <div
              key={e.id}
              className={cn(
                "flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm",
                isAuto
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-teal-500/20 bg-teal-500/5"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {isAuto ? (
                    <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <UserCircle2 className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                  )}
                  <span className="font-medium truncate">{e.sequences?.name ?? "Sequence"}</span>
                  <Badge variant="outline" className={cn("text-[10px] capitalize", isAuto ? "border-amber-500/40 text-amber-400" : "border-teal-500/40 text-teal-400")}>
                    {isAuto ? "Auto" : "Personal"}
                  </Badge>
                  <Badge variant="outline" className={cn("text-[10px] capitalize", tone)}>
                    {e.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Step {e.current_step}{total ? ` of ${total}` : ""}
                  {due && e.status === "active" && (
                    <> · <span className={due.tone}>{due.text}</span></>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <TooltipProvider delayDuration={500}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link to="/sequences" aria-label="View sequence">
                        <button className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">View in Sequences</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => isPaused
                          ? handleResume(e.id, e.sequences?.name ?? "sequence")
                          : handlePause(e.id, e.sequences?.name ?? "sequence")}
                        className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={isPaused ? "Resume sequence" : "Pause sequence"}
                      >
                        {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">{isPaused ? "Resume" : "Pause"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleRemove(e.id, e.sequences?.name ?? "sequence")}
                        className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Remove from sequence"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Remove</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
