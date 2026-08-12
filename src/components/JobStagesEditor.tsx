import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GripVertical, Trash2, Plus, Lock, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  useJobStages,
  useAddJobStage,
  useRenameJobStage,
  useDeleteJobStage,
  useReorderJobStages,
  type JobStage,
} from "@/hooks/use-job-stages";
import { useCandidateJobs } from "@/hooks/use-data";

export function JobStagesEditor({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const { data: stages = [] } = useJobStages(jobId);
  const { data: candidateJobs = [] } = useCandidateJobs(undefined, jobId);
  const addStage = useAddJobStage(jobId);
  const renameStage = useRenameJobStage(jobId);
  const deleteStage = useDeleteJobStage(jobId);
  const reorder = useReorderJobStages(jobId);

  const [local, setLocal] = useState<JobStage[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [blocked, setBlocked] = useState<{ stage: string; count: number } | null>(null);

  useEffect(() => {
    setLocal(stages);
  }, [stages]);

  const countFor = (name: string) =>
    candidateJobs.filter((cj: any) => cj.stage === name && !cj.withdrawn).length;

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const movable = local.filter((s) => s.stage_order < 999);
    const trailing = local.filter((s) => s.stage_order >= 999);
    const next = [...movable];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    const renumbered = next.map((s, i) => ({ ...s, stage_order: i }));
    setLocal([...renumbered, ...trailing]);
    try {
      await reorder.mutateAsync(renumbered.map((s) => ({ id: s.id, stage_order: s.stage_order })));
    } catch (e: any) {
      toast.error(e.message ?? "Could not reorder stages");
    }
  };

  const handleRename = async (s: JobStage, value: string) => {
    const name = value.trim();
    if (!name || name === s.stage_name) return;
    if (local.some((x) => x.id !== s.id && x.stage_name.toLowerCase() === name.toLowerCase())) {
      toast.error("A stage with that name already exists");
      return;
    }
    try {
      await renameStage.mutateAsync({ id: s.id, stage_name: name, oldName: s.stage_name });
      toast.success("Stage renamed");
    } catch (e: any) {
      toast.error(e.message ?? "Could not rename stage");
    }
  };

  const handleDelete = async (s: JobStage) => {
    const count = countFor(s.stage_name);
    if (count > 0) {
      setBlocked({ stage: s.stage_name, count });
      return;
    }
    try {
      await deleteStage.mutateAsync(s.id);
      toast.success("Stage removed");
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete stage");
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    if (local.some((x) => x.stage_name.toLowerCase() === name.toLowerCase())) {
      toast.error("A stage with that name already exists");
      return;
    }
    const movable = local.filter((s) => s.stage_order < 999);
    try {
      await addStage.mutateAsync({ stage_name: name, stage_order: movable.length });
      setNewName("");
      setAdding(false);
    } catch (e: any) {
      toast.error(e.message ?? "Could not add stage");
    }
  };

  const viewCandidates = (stage: string) => {
    setBlocked(null);
    setOpen(false);
    setTimeout(() => {
      document
        .getElementById(`pipeline-col-${stage}-${jobId}`)
        ?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    }, 150);
  };

  const movable = local.filter((s) => s.stage_order < 999);
  const systemLast = local.filter((s) => s.stage_order >= 999);

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setOpen(true)}>
        <Settings2 className="h-3.5 w-3.5" /> Edit stages
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pipeline stages</DialogTitle>
            <DialogDescription className="text-xs">
              Drag to reorder, click a name to rename. System stages are fixed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="stages">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                    {movable.map((s, index) => (
                      <Draggable key={s.id} draggableId={s.id} index={index} isDragDisabled={s.is_system_stage}>
                        {(dp, snapshot) => (
                          <div
                            ref={dp.innerRef}
                            {...dp.draggableProps}
                            className={`flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 ${
                              snapshot.isDragging ? "shadow-md" : ""
                            }`}
                          >
                            <span
                              {...dp.dragHandleProps}
                              className={s.is_system_stage ? "opacity-20" : "cursor-grab text-muted-foreground"}
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>

                            {s.is_system_stage ? (
                              <span className="flex-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Lock className="h-3 w-3" /> {s.stage_name}
                              </span>
                            ) : (
                              <StageNameInput value={s.stage_name} onCommit={(v) => handleRename(s, v)} />
                            )}

                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {countFor(s.stage_name) || ""}
                            </span>

                            {!s.is_system_stage && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDelete(s)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {systemLast.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5"
              >
                <span className="opacity-20">
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className="flex-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Lock className="h-3 w-3" /> {s.stage_name}
                </span>
              </div>
            ))}
          </div>

          {adding ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={newName}
                placeholder="Stage name"
                className="h-8 text-sm"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") { setAdding(false); setNewName(""); }
                }}
              />
              <Button size="sm" className="h-8" onClick={handleAdd}>Add</Button>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => { setAdding(false); setNewName(""); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Add stage
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!blocked} onOpenChange={(o) => !o && setBlocked(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Stage not empty</DialogTitle>
            <DialogDescription>
              {blocked?.count} candidate{blocked?.count === 1 ? " is" : "s are"} currently at this stage. Move them first.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBlocked(null)}>Close</Button>
            <Button onClick={() => blocked && viewCandidates(blocked.stage)}>View candidates</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StageNameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setDraft(value); (e.target as HTMLInputElement).blur(); }
      }}
      className="h-7 flex-1 border-transparent bg-transparent px-1 text-sm hover:border-border focus-visible:border-border"
    />
  );
}
