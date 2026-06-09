import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Building2, Clock, Calendar, Sparkles, Hand, FastForward, ClipboardList, ChevronDown } from "lucide-react";
import { PriorityStarIcon } from "@/components/PriorityFlag";
import { CandidateContextMenu } from "@/components/CandidateContextMenu";
import { useCandidateJobs, useCandidates, useCreateCandidateJob, useUpdateCandidateJob, type CandidateJob, type Candidate, type Job } from "@/hooks/use-data";
import { NotesSection } from "@/components/NotesSection";
import { ScreeningNotesPanel } from "@/components/ScreeningNotesPanel";
import { useScreeningNote } from "@/hooks/use-screening-notes";
import { toast } from "sonner";
import { InterviewSlotPicker } from "@/components/InterviewSlotPicker";
import { InterviewDetailsPanel } from "@/components/InterviewDetailsPanel";
import { OfferManagementPanel } from "@/components/OfferManagementPanel";
import { useOfferByCandidateJob } from "@/hooks/use-offers";
import { logActivity } from "@/lib/activity-log";
import { OfferBackupSignal } from "@/components/OfferBackupSignal";
import { AddCandidateToStageDropdown } from "@/components/AddCandidateToStageDropdown";

// ============================================================================
// Stage definitions — reflects real recruitment workflow
// ============================================================================

const PIPELINE_STAGES = [
  "AI Suggested",
  "Longlist",
  "Contact",
  "Screening",
  "Shortlist",
  "Submitted",
  "Client Review",
  "First Interview",
  "Second Interview",
  "Offer",
  "Placed",
  "Rejected",
] as const;

type Stage = (typeof PIPELINE_STAGES)[number];

// Top-border accent on each column header
const stageBorder: Record<string, string> = {
  "AI Suggested": "border-t-blue-500",
  Longlist: "border-t-slate-500",
  Contact: "border-t-amber-500",
  Screening: "border-t-amber-500",
  Shortlist: "border-t-emerald-500",
  Submitted: "border-t-primary",
  "Client Review": "border-t-primary",
  "First Interview": "border-t-primary",
  "Second Interview": "border-t-primary",
  Offer: "border-t-primary",
  Placed: "border-t-primary",
  Rejected: "border-t-red-500",
};

// Card accent (left edge) — same colour family as the column
const stageCardAccent: Record<string, string> = {
  "AI Suggested": "border-l-blue-500/60",
  Longlist: "border-l-slate-500/60",
  Contact: "border-l-amber-500/60",
  Screening: "border-l-amber-500/60",
  Shortlist: "border-l-emerald-500/60",
  Submitted: "border-l-primary/60",
  "Client Review": "border-l-primary/60",
  "First Interview": "border-l-primary/60",
  "Second Interview": "border-l-primary/60",
  Offer: "border-l-primary/60",
  Placed: "border-l-primary/60",
  Rejected: "border-l-red-500/60",
};

// Stage restriction rules — required predecessor stages
function canMoveTo(targetStage: string, currentStage: string): { ok: boolean; message?: string } {
  // Cannot enter Submitted unless coming from Shortlist (or later)
  if (targetStage === "Submitted") {
    const validPrior = ["Shortlist", "Submitted", "Client Review", "First Interview", "Second Interview", "Offer", "Placed"];
    if (!validPrior.includes(currentStage)) {
      return { ok: false, message: "This candidate needs to reach Shortlist before being submitted to a client." };
    }
  }
  // Cannot enter Offer unless at an Interview stage (or later)
  if (targetStage === "Offer") {
    const validPrior = ["First Interview", "Second Interview", "Offer", "Placed"];
    if (!validPrior.includes(currentStage)) {
      return { ok: false, message: "This candidate needs to reach an Interview stage before an offer can be made." };
    }
  }
  return { ok: true };
}

const REJECTION_REASONS = [
  "Client rejected",
  "Candidate withdrew",
  "Not suitable",
  "Role cancelled",
] as const;

// ============================================================================
// Main board
// ============================================================================

export function JobPipelineBoard({ job, onJobUpdate }: { job: Job; onJobUpdate?: (u: Partial<Job>) => Promise<void> }) {
  const { data: candidateJobs = [] } = useCandidateJobs(undefined, job.id);
  const { data: allCandidates = [] } = useCandidates();
  const createCandidateJob = useCreateCandidateJob();
  const updateCandidateJob = useUpdateCandidateJob();
  const navigate = useNavigate();

  const [addingToStage, setAddingToStage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedCJForScheduling, setSelectedCJForScheduling] = useState<CandidateJob | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Rejection-reason capture flow
  const [rejectingCJ, setRejectingCJ] = useState<{ cj: CandidateJob; fromStage: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>(REJECTION_REASONS[0]);

  // Interview details capture flow — opens after move to First/Second Interview
  const [interviewPanel, setInterviewPanel] = useState<{ cj: CandidateJob; stage: "First Interview" | "Second Interview" } | null>(null);
  // Offer management flow — opens after move to Offer
  const [offerPanel, setOfferPanel] = useState<{ cj: CandidateJob } | null>(null);
  // Placed prompt — opens after move to Placed
  const [placedPrompt, setPlacedPrompt] = useState<{ cj: CandidateJob } | null>(null);
  const [placedBusy, setPlacedBusy] = useState(false);

  const linkedCandidateIds = candidateJobs.map((cj) => cj.candidate_id);
  const availableCandidates = allCandidates.filter((c) => !linkedCandidateIds.includes(c.id));

  const stageMap = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = candidateJobs.filter((cj) => cj.stage === stage);
    return acc;
  }, {} as Record<string, CandidateJob[]>);

  const performStageMove = (cj: CandidateJob, fromStage: string, toStage: string, opts?: { rejectionReason?: string }) => {
    const isFastTrack =
      toStage === "Shortlist" &&
      ["AI Suggested", "Longlist", "Contact", "Screening"].includes(fromStage) &&
      fromStage !== "Screening";

    updateCandidateJob.mutate(
      {
        id: cj.id,
        stage: toStage,
        ...(opts?.rejectionReason !== undefined ? { rejection_reason: opts.rejectionReason } : {}),
      },
      {
        onSuccess: () => {
          if (isFastTrack) {
            logActivity({
              action_type: "stage_change",
              candidate_id: cj.candidate_id,
              job_id: cj.job_id,
              candidate_job_id: cj.id,
              metadata: {
                stage_from: fromStage,
                stage_to: toStage,
                fast_track: true,
                note: `Moved directly to Shortlist — skipped ${["Contact", "Screening"].filter((s) => s !== fromStage).join(" and ")}`,
              },
            });
            toast.success("Fast-tracked to Shortlist");
          }
          if (toStage === "First Interview" || toStage === "Second Interview") {
            // Small delay so the auto-create trigger has time to insert the interview row
            setTimeout(() => {
              setInterviewPanel({ cj, stage: toStage as "First Interview" | "Second Interview" });
            }, 400);
          }
          if (toStage === "Offer") {
            // Small delay so the auto-create trigger has time to insert the offer row
            setTimeout(() => {
              setOfferPanel({ cj });
            }, 400);
          }
          if (toStage === "Placed") {
            setTimeout(() => setPlacedPrompt({ cj }), 300);
          }
        },
      },
    );
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const fromStage = result.source.droppableId;
    const toStage = result.destination.droppableId;
    if (fromStage === toStage) return;

    const cj = candidateJobs.find((c) => c.id === result.draggableId);
    if (!cj) return;

    const check = canMoveTo(toStage, fromStage);
    if (!check.ok) {
      toast.error(check.message ?? "Invalid stage transition");
      return;
    }

    if (toStage === "Rejected") {
      setRejectingCJ({ cj, fromStage });
      setRejectionReason(REJECTION_REASONS[0]);
      return;
    }

    performStageMove(cj, fromStage, toStage);
  };

  const handleAddCandidate = async (stage: string) => {
    if (!selectedCandidateId) return;
    await createCandidateJob.mutateAsync({
      candidate_id: selectedCandidateId,
      job_id: job.id,
      stage,
      source: "manual",
    });
    setAddingToStage(null);
    setSelectedCandidateId("");
  };

  const openProfile = (cj: CandidateJob) => {
    if (cj.candidates) {
      setSelectedCandidate(cj.candidates);
      setProfileOpen(true);
    }
  };

  const formatSalary = (n: number | null) => (n ? `£${(n / 1000).toFixed(0)}k` : null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          {candidateJobs.length} candidate{candidateJobs.length !== 1 ? "s" : ""} in pipeline
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Drag to progress · Cannot Submit before Shortlist · Cannot Offer before Interview
        </p>
      </div>

      {/* Offer-stage backup signals — one per candidate at Offer */}
      {(stageMap["Offer"] || []).map((cj) => (
        <OfferBackupSignal
          key={`backup-${cj.id}`}
          job={job}
          offerCandidateJob={cj}
          candidateJobs={candidateJobs}
          onViewPipeline={() => {
            // Already inside the pipeline view — scroll board into view
            document.getElementById(`pipeline-board-${job.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onFindBackups={() => {
            document.getElementById(`pipeline-col-AI Suggested-${job.id}`)?.scrollIntoView({
              behavior: "smooth",
              inline: "start",
              block: "nearest",
            });
          }}
        />
      ))}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div id={`pipeline-board-${job.id}`} className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 320 }}>
          {PIPELINE_STAGES.map((stage) => (
            <div
              key={stage}
              id={`pipeline-col-${stage}-${job.id}`}
              className={`flex-shrink-0 w-56 rounded-lg border border-border bg-muted/20 border-t-2 ${stageBorder[stage]}`}
            >
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-medium truncate">{stage}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {stageMap[stage]?.length || 0}
                  </Badge>
                  <AddCandidateToStageDropdown
                    jobId={job.id}
                    stage={stage}
                    candidateJobs={candidateJobs}
                  />
                </div>
              </div>

              <Droppable droppableId={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`p-2 space-y-2 min-h-[120px] transition-colors ${
                      snapshot.isDraggingOver ? "bg-primary/5" : ""
                    }`}
                  >
                    {(stageMap[stage] || []).map((cj, idx) => (
                      <Draggable key={cj.id} draggableId={cj.id} index={idx}>
                        {(dragProvided, dragSnapshot) => (
                          <PipelineCard
                            cj={cj}
                            stage={stage}
                            job={job}
                            dragProvided={dragProvided}
                            dragSnapshot={dragSnapshot}
                            onOpenProfile={() => openProfile(cj)}
                            onOpenSlotPicker={() => {
                              setSelectedCJForScheduling(cj);
                              setScheduleOpen(true);
                            }}
                            onFastTrack={() => {
                              const check = canMoveTo("Shortlist", cj.stage);
                              if (!check.ok) {
                                toast.error(check.message ?? "Cannot fast-track");
                                return;
                              }
                              performStageMove(cj, cj.stage, "Shortlist");
                            }}
                            onOpenOffer={() => setOfferPanel({ cj })}
                            formatSalary={formatSalary}
                          />
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {/* Candidate profile slide-over */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedCandidate && <CandidateQuickProfile candidate={selectedCandidate} />}
        </DialogContent>
      </Dialog>

      {/* Interview scheduling */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          {selectedCJForScheduling && (
            <InterviewSlotPicker
              candidateJobId={selectedCJForScheduling.id}
              candidateName={selectedCJForScheduling.candidates?.name || "Candidate"}
              onClose={() => setScheduleOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Rejection reason capture */}
      <Dialog open={!!rejectingCJ} onOpenChange={(o) => !o && setRejectingCJ(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reason for rejection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {rejectingCJ?.cj.candidates?.name ?? "Candidate"} — moving to Rejected
            </p>
            <Select value={rejectionReason} onValueChange={setRejectionReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingCJ(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!rejectingCJ) return;
                performStageMove(rejectingCJ.cj, rejectingCJ.fromStage, "Rejected", {
                  rejectionReason,
                });
                setRejectingCJ(null);
                toast.success(`Marked rejected — ${rejectionReason}`);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interview details capture — opens after move to First/Second Interview */}
      {interviewPanel && (
        <InterviewDetailsPanel
          open={!!interviewPanel}
          onOpenChange={(o) => !o && setInterviewPanel(null)}
          candidateJobId={interviewPanel.cj.id}
          stage={interviewPanel.stage}
          candidate={interviewPanel.cj.candidates ?? null}
          job={job as any}
        />
      )}

      {/* Offer management — opens after move to Offer */}
      {offerPanel && (
        <OfferManagementPanel
          open={!!offerPanel}
          onOpenChange={(o) => !o && setOfferPanel(null)}
          candidateJobId={offerPanel.cj.id}
          candidate={offerPanel.cj.candidates ?? null}
          job={job as any}
        />
      )}

      {/* Placed prompt — opens after move to Placed */}
      <Dialog open={!!placedPrompt} onOpenChange={(o) => !o && !placedBusy && setPlacedPrompt(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Candidate placed</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-1 text-sm">
            <p>
              <span className="font-medium">{placedPrompt?.cj.candidates?.name ?? "Candidate"}</span>{" "}
              has been placed at{" "}
              <span className="font-medium">{(job.clients as any)?.company_name ?? "this client"}</span>.
            </p>
            <p className="text-muted-foreground text-xs">What would you like to do next?</p>
          </div>
          <div className="grid gap-2 pt-2">
            <Button
              variant="outline"
              disabled={placedBusy}
              onClick={() => { setPlacedPrompt(null); navigate("/placements"); }}
            >
              Create placement record
            </Button>
            <Button
              variant="outline"
              disabled={placedBusy}
              onClick={async () => {
                if (!onJobUpdate) { toast.error("Job update not available here"); return; }
                setPlacedBusy(true);
                try {
                  await onJobUpdate({ status: "Filled" } as any);
                  toast.success("Job marked Filled");
                  setPlacedPrompt(null);
                } finally { setPlacedBusy(false); }
              }}
            >
              Close this job (Filled)
            </Button>
            <Button
              disabled={placedBusy}
              onClick={async () => {
                setPlacedBusy(true);
                try {
                  if (onJobUpdate) await onJobUpdate({ status: "Filled" } as any);
                  toast.success("Job marked Filled");
                  setPlacedPrompt(null);
                  navigate("/placements");
                } finally { setPlacedBusy(false); }
              }}
            >
              Do both
            </Button>
            <Button variant="ghost" disabled={placedBusy} onClick={() => setPlacedPrompt(null)}>
              Not now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Pipeline card — extracted for clarity
// ============================================================================

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function PipelineCard({
  cj,
  stage,
  job,
  dragProvided,
  dragSnapshot,
  onOpenProfile,
  onOpenSlotPicker,
  onFastTrack,
  onOpenOffer,
  formatSalary,
}: {
  cj: CandidateJob;
  stage: string;
  job: Job;
  dragProvided: any;
  dragSnapshot: any;
  onOpenProfile: () => void;
  onOpenSlotPicker: () => void;
  onFastTrack: () => void;
  onOpenOffer?: () => void;
  formatSalary: (n: number | null) => string | null;
}) {
  const days = daysSince(cj.stage_changed_at ?? cj.created_at);
  const isAi = cj.source === "ai";
  const showFastTrack =
    ["AI Suggested", "Longlist", "Contact"].includes(stage); // not from Screening (one stage away)
  const showSourceBadge = stage === "Shortlist";
  const isScreening = stage === "Screening";

  // Auto-open the screening panel when card is in Screening stage
  const [screeningOpen, setScreeningOpen] = useState(isScreening);
  const { data: screeningNote } = useScreeningNote(isScreening || screeningOpen ? cj.id : undefined);
  const { data: offerForCard } = useOfferByCandidateJob(stage === "Offer" ? cj.id : null);

  return (
    <div
      ref={dragProvided.innerRef}
      {...dragProvided.draggableProps}
      {...dragProvided.dragHandleProps}
      onClick={onOpenProfile}
      className={`group rounded-md border-l-2 border bg-background p-2.5 cursor-pointer hover:border-primary/40 transition-all text-xs space-y-1.5 ${
        stageCardAccent[stage] ?? ""
      } ${dragSnapshot.isDragging ? "shadow-lg ring-1 ring-primary/30" : ""} ${
        cj.candidates?.priority_flag ? "border-yellow-400/50" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="font-medium text-sm leading-tight flex items-center gap-1 min-w-0">
          {cj.candidates?.priority_flag && <PriorityStarIcon />}
          <span className="truncate">{cj.candidates?.name || "Unknown"}</span>
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {screeningNote?.completed && (
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-400 text-[10px] h-5 px-1.5 gap-0.5"
              title="Screening notes complete"
            >
              <ClipboardList className="h-2.5 w-2.5" /> Screened
            </Badge>
          )}
          {cj.candidates && (
            <CandidateContextMenu
              candidate={cj.candidates}
              onViewProfile={onOpenProfile}
              triggerClassName="h-6 w-6 opacity-0 group-hover:opacity-100"
            />
          )}
        </div>
      </div>

      {cj.candidates?.current_employer && (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Building2 className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{cj.candidates.current_employer}</span>
        </div>
      )}
      {cj.candidates?.salary_current && (
        <div className="text-muted-foreground">{formatSalary(cj.candidates.salary_current)}</div>
      )}
      {cj.candidates?.availability && (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{cj.candidates.availability}</span>
        </div>
      )}

      {/* Source badge — only shown in Shortlist */}
      {showSourceBadge && (
        <Badge
          variant="outline"
          className={`text-[10px] h-5 px-1.5 gap-1 ${
            isAi ? "border-blue-500/40 text-blue-400" : "border-slate-500/40 text-muted-foreground"
          }`}
        >
          {isAi ? <Sparkles className="h-2.5 w-2.5" /> : <Hand className="h-2.5 w-2.5" />}
          {isAi ? "AI Route" : "Manual"}
        </Badge>
      )}

      {/* Rejection reason — shown on Rejected cards */}
      {stage === "Rejected" && cj.rejection_reason && (
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-red-500/40 text-red-400">
          {cj.rejection_reason}
        </Badge>
      )}

      {/* Offer summary — only on Offer cards */}
      {stage === "Offer" && offerForCard && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpenOffer?.(); }}
          className="w-full text-left rounded-md border border-border bg-muted/30 px-2 py-1.5 space-y-0.5 hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-medium">
              {offerForCard.salary_offered ? `£${Math.round(offerForCard.salary_offered / 1000)}k` : "Offer"}
              <span className="text-muted-foreground"> · {daysSince(offerForCard.verbal_offer_date)}d ago</span>
            </span>
            {offerForCard.overall_risk && (
              <Badge variant="outline" className={`text-[9px] h-4 px-1 ${
                offerForCard.overall_risk === "high" ? "border-red-500/40 text-red-400" :
                offerForCard.overall_risk === "medium" ? "border-amber-500/40 text-amber-400" :
                "border-emerald-500/40 text-emerald-400"
              }`}>
                {offerForCard.overall_risk}
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {(offerForCard.status || "").replace(/_/g, " ")}
          </p>
        </button>
      )}

      {/* Days in current stage */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span
          className={`text-[10px] ${
            days >= 7 ? "text-yellow-400" : "text-muted-foreground"
          }`}
        >
          {days === 0 ? "today" : `${days}d in stage`}
        </span>

        {/* Fast-track to Shortlist button */}
        {showFastTrack && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFastTrack();
            }}
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-emerald-400 transition-colors"
            title="Fast-track to Shortlist"
          >
            <FastForward className="h-2.5 w-2.5" /> Fast-track
          </button>
        )}
      </div>

      {/* Interview date / scheduling */}
      <InterviewDatePicker candidateJob={cj} onOpenSlotPicker={onOpenSlotPicker} />

      {/* Screening notes — auto-open in Screening stage, available on demand otherwise */}
      {cj.candidates && (
        <div onClick={(e) => e.stopPropagation()} className="pt-1">
          <button
            onClick={() => setScreeningOpen((o) => !o)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`h-2.5 w-2.5 transition-transform ${screeningOpen ? "" : "-rotate-90"}`}
            />
            <ClipboardList className="h-2.5 w-2.5" />
            Screening notes
          </button>
          {screeningOpen && (
            <div className="mt-2">
              <ScreeningNotesPanel
                candidateJob={cj}
                candidate={cj.candidates}
                jobId={job.id}
                jobTitle={job.title}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Candidate quick profile (unchanged)
// ============================================================================

function CandidateQuickProfile({ candidate }: { candidate: Candidate }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{candidate.name}</h2>
        <p className="text-sm text-muted-foreground">
          {candidate.job_title || "No title"} {candidate.current_employer ? `at ${candidate.current_employer}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {candidate.email && <div><span className="text-muted-foreground">Email:</span> {candidate.email}</div>}
        {candidate.phone && <div><span className="text-muted-foreground">Phone:</span> {candidate.phone}</div>}
        {candidate.location && <div><span className="text-muted-foreground">Location:</span> {candidate.location}</div>}
        {candidate.salary_current && <div><span className="text-muted-foreground">Salary:</span> £{candidate.salary_current.toLocaleString()}</div>}
        {candidate.availability && <div><span className="text-muted-foreground">Availability:</span> {candidate.availability}</div>}
        {candidate.source && <div><span className="text-muted-foreground">Source:</span> {candidate.source}</div>}
      </div>

      <NotesSection entityType="candidate" entityId={candidate.id} />
    </div>
  );
}

// ============================================================================
// Interview date picker (unchanged behaviour)
// ============================================================================

function InterviewDatePicker({ candidateJob, onOpenSlotPicker }: { candidateJob: CandidateJob; onOpenSlotPicker: () => void }) {
  const updateCandidateJob = useUpdateCandidateJob();
  const [open, setOpen] = useState(false);

  const handleSetDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    updateCandidateJob.mutate(
      { id: candidateJob.id, interview_date: val ? new Date(val).toISOString() : null },
      { onSuccess: () => { toast.success("Interview scheduled"); setOpen(false); } },
    );
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateCandidateJob.mutate(
      { id: candidateJob.id, interview_date: null },
      { onSuccess: () => toast.success("Interview date removed") },
    );
  };

  const interviewDate = candidateJob.interview_date;
  const isPast = interviewDate && new Date(interviewDate) < new Date();

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {interviewDate ? (
        <div className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 ${isPast ? "bg-yellow-500/20 text-yellow-400" : "bg-primary/20 text-primary"}`}>
          <Calendar className="h-2.5 w-2.5" />
          <span>{new Date(interviewDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          <button onClick={handleClear} className="ml-auto hover:text-destructive">×</button>
        </div>
      ) : (
        <div className="flex gap-1">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors">
                <Calendar className="h-2.5 w-2.5" /> Quick Set
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <Input
                type="datetime-local"
                className="text-xs h-8"
                onChange={handleSetDate}
                min={new Date().toISOString().slice(0, 16)}
              />
            </PopoverContent>
          </Popover>
          <span className="text-[10px] text-muted-foreground">·</span>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenSlotPicker(); }}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
          >
            <Clock className="h-2.5 w-2.5" /> Client Pick
          </button>
        </div>
      )}
    </div>
  );
}
