import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GitBranch, X, Zap, UserCircle2 } from "lucide-react";
import { useCandidateEnrollments, useRemoveEnrollment } from "@/hooks/use-sequences";
import { AddToSequencePanel } from "@/components/AddToSequencePanel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  candidateId: string;
  candidateName: string;
}

const statusTone: Record<string, string> = {
  active: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  completed: "bg-muted text-muted-foreground border-border",
  replied: "bg-green-500/15 text-green-400 border-green-500/30",
};

export function ActiveSequencesSection({ candidateId, candidateName }: Props) {
  const { data: enrollments = [], isLoading } = useCandidateEnrollments(candidateId);
  const removeEnrollment = useRemoveEnrollment();

  const handleRemove = async (id: string, name: string) => {
    try {
      await removeEnrollment.mutateAsync(id);
      toast.success(`Removed from ${name}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove");
    }
  };

  if (isLoading) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/30 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" /> Active Sequences
        </h3>
        {enrollments.length > 0 && (
          <AddToSequencePanel
            candidateId={candidateId}
            candidateName={candidateName}
            align="end"
            trigger={
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                <GitBranch className="h-3 w-3" /> Add another
              </Button>
            }
          />
        )}
      </div>

      {enrollments.length === 0 ? (
        <div className="flex items-center justify-between gap-2 py-1">
          <p className="text-sm text-muted-foreground">Not in any sequences yet</p>
          <AddToSequencePanel
            candidateId={candidateId}
            candidateName={candidateName}
            align="end"
            trigger={
              <Button variant="outline" size="sm" className="gap-1.5">
                <GitBranch className="h-3.5 w-3.5" /> Add to Sequence
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          {enrollments.map((e) => {
            const isAuto = e.sequences?.type === "auto";
            const tone = statusTone[e.status] ?? statusTone.active;
            const total = e.total_steps ?? 0;
            const nextDue = e.start_date ? new Date(e.start_date) : null;
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
                    {nextDue && e.status === "active" && (
                      <> · started {nextDue.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>
                    )}
                  </p>
                </div>
                <TooltipProvider delayDuration={500}>
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
                    <TooltipContent side="top" className="text-xs">Remove from sequence</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
