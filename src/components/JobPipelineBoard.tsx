import { useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, User, Building2, Clock, Calendar, Star } from "lucide-react";
import { PriorityFlagButton, PriorityStarIcon } from "@/components/PriorityFlag";
import { CandidateContextMenu } from "@/components/CandidateContextMenu";
import { useCandidateJobs, useCandidates, useCreateCandidateJob, useUpdateCandidateJob, useNotes, type CandidateJob, type Candidate, type Job } from "@/hooks/use-data";
import { NotesSection } from "@/components/NotesSection";
import { CandidateJobLinks } from "@/components/CandidateJobLinks";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";
import { toast } from "sonner";
import { InterviewSlotPicker } from "@/components/InterviewSlotPicker";

const PIPELINE_STAGES = [
  "Longlist",
  "Shortlist",
  "Submitted",
  "Client Review",
  "First Interview",
  "Second Interview",
  "Offer",
  "Placed",
  "Rejected",
] as const;

const stageColors: Record<string, string> = {
  Longlist: "border-t-slate-500",
  Shortlist: "border-t-blue-500",
  Submitted: "border-t-indigo-500",
  "Client Review": "border-t-purple-500",
  "First Interview": "border-t-amber-500",
  "Second Interview": "border-t-orange-500",
  Offer: "border-t-emerald-500",
  Placed: "border-t-green-500",
  Rejected: "border-t-red-500",
};

export function JobPipelineBoard({ job }: { job: Job }) {
  const { data: candidateJobs = [] } = useCandidateJobs(undefined, job.id);
  const { data: allCandidates = [] } = useCandidates();
  const createCandidateJob = useCreateCandidateJob();
  const updateCandidateJob = useUpdateCandidateJob();
  const [addingToStage, setAddingToStage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedCandidateJobForScheduling, setSelectedCandidateJobForScheduling] = useState<CandidateJob | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const linkedCandidateIds = candidateJobs.map(cj => cj.candidate_id);
  const availableCandidates = allCandidates.filter(c => !linkedCandidateIds.includes(c.id));

  const stageMap = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = candidateJobs.filter(cj => cj.stage === stage);
    return acc;
  }, {} as Record<string, CandidateJob[]>);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStage = result.destination.droppableId;
    const candidateJobId = result.draggableId;
    if (result.source.droppableId === newStage) return;
    updateCandidateJob.mutate({ id: candidateJobId, stage: newStage });
  };

  const handleAddCandidate = async (stage: string) => {
    if (!selectedCandidateId) return;
    await createCandidateJob.mutateAsync({
      candidate_id: selectedCandidateId,
      job_id: job.id,
      stage,
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

  const formatSalary = (n: number | null) => n ? `£${(n / 1000).toFixed(0)}k` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {candidateJobs.length} candidate{candidateJobs.length !== 1 ? "s" : ""} in pipeline
        </h3>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 300 }}>
          {PIPELINE_STAGES.map(stage => (
            <div key={stage} className={`flex-shrink-0 w-52 rounded-lg border border-border bg-muted/20 border-t-2 ${stageColors[stage]}`}>
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-medium truncate">{stage}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{stageMap[stage]?.length || 0}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => { setAddingToStage(addingToStage === stage ? null : stage); setSelectedCandidateId(""); }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {addingToStage === stage && (
                <div className="p-2 border-b border-border space-y-2">
                  <Select value={selectedCandidateId} onValueChange={setSelectedCandidateId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {availableCandidates.map(c => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="w-full h-7 text-xs" onClick={() => handleAddCandidate(stage)} disabled={!selectedCandidateId}>
                    Add
                  </Button>
                </div>
              )}

              <Droppable droppableId={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`p-2 space-y-2 min-h-[100px] transition-colors ${snapshot.isDraggingOver ? "bg-primary/5" : ""}`}
                  >
                    {(stageMap[stage] || []).map((cj, idx) => (
                      <Draggable key={cj.id} draggableId={cj.id} index={idx}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => openProfile(cj)}
                            className={`group rounded-md border bg-background p-2.5 cursor-pointer hover:border-primary/40 transition-all text-xs space-y-1.5 ${
                              snapshot.isDragging ? "shadow-lg ring-1 ring-primary/30" : ""
                            } ${cj.candidates?.priority_flag ? "border-yellow-400/50" : "border-border"}`}
                          >
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm leading-tight flex items-center gap-1">
                                {cj.candidates?.priority_flag && <PriorityStarIcon />}
                                {cj.candidates?.name || "Unknown"}
                              </p>
                              <div className="flex items-center gap-0.5">
                                {cj.candidates && <CandidateContextMenu candidate={cj.candidates} onViewProfile={() => openProfile(cj)} triggerClassName="h-6 w-6 opacity-0 group-hover:opacity-100" />}
                              </div>
                            </div>
                            {cj.candidates?.current_employer && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Building2 className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{cj.candidates.current_employer}</span>
                              </div>
                            )}
                            {cj.candidates?.salary_current && (
                              <div className="text-muted-foreground">
                                {formatSalary(cj.candidates.salary_current)}
                              </div>
                            )}
                            {cj.candidates?.availability && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{cj.candidates.availability}</span>
                              </div>
                            )}
                            {/* Interview date / scheduling */}
                            <InterviewDatePicker
                              candidateJob={cj}
                              onOpenSlotPicker={() => {
                                setSelectedCandidateJobForScheduling(cj);
                                setScheduleOpen(true);
                              }}
                            />
                          </div>
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
          {selectedCandidate && (
            <CandidateQuickProfile candidate={selectedCandidate} />
          )}
        </DialogContent>
      </Dialog>

      {/* Interview scheduling dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          {selectedCandidateJobForScheduling && (
            <InterviewSlotPicker
              candidateJobId={selectedCandidateJobForScheduling.id}
              candidateName={selectedCandidateJobForScheduling.candidates?.name || "Candidate"}
              onClose={() => setScheduleOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

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

function InterviewDatePicker({ candidateJob, onOpenSlotPicker }: { candidateJob: CandidateJob; onOpenSlotPicker: () => void }) {
  const updateCandidateJob = useUpdateCandidateJob();
  const [open, setOpen] = useState(false);

  const handleSetDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    updateCandidateJob.mutate(
      { id: candidateJob.id, interview_date: val ? new Date(val).toISOString() : null },
      { onSuccess: () => { toast.success("Interview scheduled"); setOpen(false); } }
    );
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateCandidateJob.mutate(
      { id: candidateJob.id, interview_date: null },
      { onSuccess: () => toast.success("Interview date removed") }
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
