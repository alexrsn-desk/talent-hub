import { useState } from "react";
import { Link2, Plus, Trash2, Calendar, Users, Mail, Phone, MessageCircle, Globe, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  useSequences,
  useSequenceSteps,
  useSequenceEnrollments,
  useSequenceTemplates,
  useCreateSequenceFromTemplate,
  useDeleteSequence,
  useEnrollCandidate,
  type SequenceTemplate,
  type Sequence,
} from "@/hooks/use-sequences";
import { useCandidates, useJobs } from "@/hooks/use-data";

const channelIcon: Record<string, typeof Mail> = {
  Email: Mail,
  Call: Phone,
  LinkedIn: Globe,
  WhatsApp: MessageCircle,
  Note: FileText,
};

export default function SequencesPage() {
  const { data: sequences = [] } = useSequences();
  const { data: templates = [] } = useSequenceTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const selected = sequences.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-teal-400" />
          <h1 className="text-lg font-semibold">Sequences</h1>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New sequence
        </Button>
      </div>

      <Tabs defaultValue="my-sequences">
        <TabsList>
          <TabsTrigger value="my-sequences">My Sequences ({sequences.length})</TabsTrigger>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="my-sequences" className="space-y-3">
          {sequences.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
              <Link2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No sequences yet.</p>
              <Button size="sm" variant="link" onClick={() => setCreateOpen(true)}>
                Create your first sequence
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
              <SequenceList
                sequences={sequences}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              {selected ? (
                <SequenceDetail sequence={selected} />
              ) : (
                <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  Select a sequence to view its steps and enrollments.
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <CreateSequenceDialog open={createOpen} onOpenChange={setCreateOpen} templates={templates} />
    </div>
  );
}

function SequenceList({
  sequences,
  selectedId,
  onSelect,
}: {
  sequences: Sequence[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const del = useDeleteSequence();
  return (
    <div className="space-y-1.5">
      {sequences.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`group w-full text-left rounded-md border px-3 py-2 transition-colors ${
            selectedId === s.id
              ? "border-teal-500/50 bg-teal-500/5"
              : "border-border bg-card hover:bg-muted/50"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{s.name}</p>
              {s.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">{s.description}</p>
              )}
            </div>
            <Trash2
              className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0 mt-0.5"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete "${s.name}"? This will remove all enrollments.`)) {
                  del.mutate(s.id, { onSuccess: () => toast.success("Sequence deleted") });
                }
              }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

function SequenceDetail({ sequence }: { sequence: Sequence }) {
  const { data: steps = [] } = useSequenceSteps(sequence.id);
  const { data: enrollments = [] } = useSequenceEnrollments(sequence.id);
  const [enrollOpen, setEnrollOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Steps ({steps.length})</h2>
          <Badge variant="outline" className="text-xs">{sequence.type}</Badge>
        </div>
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No steps defined.</p>
        ) : (
          <div className="space-y-2">
            {steps.map((s) => {
              const Icon = channelIcon[s.channel] ?? Mail;
              return (
                <div key={s.id} className="flex items-start gap-3 rounded-md border border-border bg-background px-3 py-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500/10 text-teal-400 shrink-0">
                    <span className="text-xs font-semibold">{s.step_number}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{s.channel}</span>
                      <span className="text-muted-foreground">
                        · Day {s.day_offset === 0 ? "0 (start)" : `+${s.day_offset}`}
                      </span>
                    </div>
                    {s.message_prompt && (
                      <p className="text-sm mt-1 text-foreground">{s.message_prompt}</p>
                    )}
                    {s.note && (
                      <p className="text-xs mt-1 text-muted-foreground italic">— {s.note}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> Enrollments ({enrollments.length})
          </h2>
          <Button size="sm" variant="outline" onClick={() => setEnrollOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Enroll candidate
          </Button>
        </div>
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one enrolled yet.</p>
        ) : (
          <div className="space-y-1.5">
            {enrollments.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium truncate">{e.candidates?.name ?? "Unknown"}</span>
                  {e.jobs?.title && (
                    <span className="text-xs text-muted-foreground truncate">· {e.jobs.title}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(e.start_date).toLocaleDateString("en-GB")}
                  </span>
                  <Badge variant={e.status === "active" ? "default" : "secondary"} className="text-[10px]">
                    Step {e.current_step} · {e.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} sequenceId={sequence.id} />
    </div>
  );
}

function TemplateCard({ template }: { template: SequenceTemplate }) {
  const create = useCreateSequenceFromTemplate();
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold">{template.name}</h3>
          <Badge variant="outline" className="text-[10px] mt-1">{template.category}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{template.steps.length} steps</span>
      </div>
      {template.description && (
        <p className="text-xs text-muted-foreground mb-3">{template.description}</p>
      )}
      <div className="space-y-1 mb-3">
        {template.steps.slice(0, 3).map((s) => (
          <div key={s.step_number} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">D+{s.day_offset}</span>
            <span>{s.channel}</span>
            <span className="truncate">— {s.message_prompt}</span>
          </div>
        ))}
        {template.steps.length > 3 && (
          <p className="text-xs text-muted-foreground italic">+ {template.steps.length - 3} more steps</p>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() =>
          create.mutate(
            { name: template.name, description: template.description ?? undefined, template },
            { onSuccess: () => toast.success(`Sequence "${template.name}" created`) }
          )
        }
      >
        Use this template
      </Button>
    </div>
  );
}

function CreateSequenceDialog({
  open,
  onOpenChange,
  templates,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: SequenceTemplate[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<string>("blank");
  const create = useCreateSequenceFromTemplate();

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const template = templateId === "blank" ? null : templates.find((t) => t.id === templateId) ?? null;
    create.mutate(
      { name: name.trim(), description: description.trim() || undefined, template },
      {
        onSuccess: () => {
          toast.success("Sequence created");
          setName("");
          setDescription("");
          setTemplateId("blank");
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New sequence</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DevOps Campaign" />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">Start from</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blank">Blank — define steps yourself</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.steps.length} steps)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnrollDialog({
  open,
  onOpenChange,
  sequenceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sequenceId: string;
}) {
  const { data: candidates = [] } = useCandidates();
  const { data: jobs = [] } = useJobs();
  const [candidateId, setCandidateId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("none");
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const enroll = useEnrollCandidate();

  const handleEnroll = () => {
    if (!candidateId) {
      toast.error("Pick a candidate");
      return;
    }
    enroll.mutate(
      { sequence_id: sequenceId, candidate_id: candidateId, job_id: jobId === "none" ? null : jobId, start_date: startDate },
      {
        onSuccess: () => {
          toast.success("Candidate enrolled");
          setCandidateId("");
          setJobId("none");
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Candidate</Label>
            <Select value={candidateId} onValueChange={setCandidateId}>
              <SelectTrigger><SelectValue placeholder="Select a candidate" /></SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Linked job (optional)</Label>
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {jobs.filter((j) => j.status === "Open").map((j) => (
                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleEnroll} disabled={enroll.isPending}>Enroll</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
