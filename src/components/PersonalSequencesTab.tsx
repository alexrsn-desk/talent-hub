import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CheckCircle2,
  SkipForward,
  Pause,
  ExternalLink,
  Mail,
  Phone,
  Globe,
  MessageCircle,
  FileText,
  Sparkles,
  Plus,
  Trash2,
  Users,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  useSequenceTemplates,
  useCreateSequenceFromTemplate,
  usePersonalSequenceStepsDue,
  useLogStepDone,
  useSkipStep,
  usePauseEnrollment,
  useTemplatePerformance,
  type PersonalStepDue,
} from "@/hooks/use-sequences";

const PERSONAL_TEMPLATE_NAMES = [
  "Warm Senior Contact",
  "BD Nurture",
  "Warm Candidate Re-engagement",
  "Post-Placement Client Nurture",
  "Lapsed Client Reconnect",
  "Post-Event Follow Up",
];

const channelIcon: Record<string, typeof Mail> = {
  Email: Mail,
  Phone: Phone,
  Call: Phone,
  LinkedIn: Globe,
  WhatsApp: MessageCircle,
  Note: FileText,
};

type Bucket = "overdue" | "today" | "thisWeek" | "upcoming";

function bucketFor(dueDate: string): Bucket {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 7) return "thisWeek";
  return "upcoming";
}

function formatDueDate(dueDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)} days ago`;
  if (diff <= 7) return `In ${diff} days`;
  return due.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function entityLink(entity_type: string, entity_id: string): string {
  if (entity_type === "candidate") return `/candidates?open=${entity_id}`;
  if (entity_type === "client") return `/bd-pipeline?open=${entity_id}`;
  if (entity_type === "contact") return `/contacts?open=${entity_id}`;
  return "#";
}

export function PersonalSequencesTab() {
  const { data: steps = [], isLoading } = usePersonalSequenceStepsDue();
  const { data: templates = [] } = useSequenceTemplates();
  const personalTemplates = templates.filter((t) => PERSONAL_TEMPLATE_NAMES.includes(t.name));
  const customBuilderOpen = useState(false);

  const buckets = useMemo(() => {
    const acc = { overdue: [] as PersonalStepDue[], today: [] as PersonalStepDue[], thisWeek: [] as PersonalStepDue[], upcoming: [] as PersonalStepDue[] };
    steps.forEach((s) => acc[bucketFor(s.due_date)].push(s));
    return acc;
  }, [steps]);

  const counts = {
    all: steps.length,
    overdue: buckets.overdue.length,
    today: buckets.today.length,
    thisWeek: buckets.thisWeek.length,
    upcoming: buckets.upcoming.length,
  };

  return (
    <div className="space-y-5">
      {/* Active reminders */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-teal-400" /> Active reminders
          </h2>
          <span className="text-xs text-muted-foreground">Reminders only — nothing sends automatically</span>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1">
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="overdue">
              Overdue {counts.overdue > 0 && <span className="ml-1 text-red-400">({counts.overdue})</span>}
            </TabsTrigger>
            <TabsTrigger value="today">
              Due today {counts.today > 0 && <span className="ml-1 text-amber-400">({counts.today})</span>}
            </TabsTrigger>
            <TabsTrigger value="thisWeek">Due this week ({counts.thisWeek})</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming ({counts.upcoming})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-3">
            <ReminderList steps={steps} loading={isLoading} />
          </TabsContent>
          <TabsContent value="overdue" className="mt-3">
            <ReminderList steps={buckets.overdue} loading={isLoading} />
          </TabsContent>
          <TabsContent value="today" className="mt-3">
            <ReminderList steps={buckets.today} loading={isLoading} />
          </TabsContent>
          <TabsContent value="thisWeek" className="mt-3">
            <ReminderList steps={buckets.thisWeek} loading={isLoading} />
          </TabsContent>
          <TabsContent value="upcoming" className="mt-3">
            <ReminderList steps={buckets.upcoming} loading={isLoading} />
          </TabsContent>
        </Tabs>
      </section>

      {/* Templates */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Pre-built templates</h2>
          <CustomSequenceBuilder />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {personalTemplates.map((t) => (
            <PersonalTemplateCard key={t.id} template={t} />
          ))}
        </div>
      </section>

      {/* Performance */}
      <PerformanceSection />
    </div>
  );
}

function ReminderList({ steps, loading }: { steps: PersonalStepDue[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>;
  if (steps.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Nothing due here. Add a person to a personal sequence from their profile.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <ReminderRow key={s.log_id} step={s} />
      ))}
    </div>
  );
}

function ReminderRow({ step }: { step: PersonalStepDue }) {
  const bucket = bucketFor(step.due_date);
  const dueColour =
    bucket === "overdue" ? "text-red-400" :
    bucket === "today" ? "text-amber-400" :
    bucket === "thisWeek" ? "text-emerald-400" :
    "text-muted-foreground";
  const Icon = channelIcon[step.channel] ?? Mail;
  const logDone = useLogStepDone();
  const skipStep = useSkipStep();
  const pauseEnrollment = usePauseEnrollment();

  const handleDone = async () => {
    try {
      await logDone.mutateAsync({
        log_id: step.log_id,
        enrollment_id: step.enrollment_id,
        entity_type: step.entity_type,
        entity_id: step.entity_id,
        step_number: step.step_number,
        sequence_name: step.sequence_name,
        channel: step.channel,
      });
      toast.success("Step logged ✓");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to log step");
    }
  };

  const handleSkip = async () => {
    try {
      await skipStep.mutateAsync({ log_id: step.log_id, enrollment_id: step.enrollment_id });
      toast.success("Step skipped");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to skip");
    }
  };

  const handlePause = async () => {
    try {
      await pauseEnrollment.mutateAsync(step.enrollment_id);
      toast.success("Sequence paused");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to pause");
    }
  };

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="h-2 w-2 rounded-full bg-teal-400 shrink-0" aria-hidden />
            <span className="font-medium text-sm truncate">{step.entity_name}</span>
            {step.company && <span className="text-xs text-muted-foreground">· {step.company}</span>}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="font-medium text-teal-400">{step.sequence_name}</span>
            <span>· Step {step.step_number}{step.total_steps ? ` of ${step.total_steps}` : ""}</span>
            <span className="inline-flex items-center gap-1">
              <Icon className="h-3 w-3" /> {step.channel}
            </span>
            <span className={cn("font-medium", dueColour)}>· {formatDueDate(step.due_date)}</span>
          </div>
          {step.message_prompt && (
            <p className="mt-1.5 text-xs text-foreground/80 italic">"{step.message_prompt}"</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <DraftWithAIButton step={step} />
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleDone} disabled={logDone.isPending}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Done
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={handleSkip} disabled={skipStep.isPending}>
            <SkipForward className="h-3.5 w-3.5" /> Skip
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={handlePause} disabled={pauseEnrollment.isPending}>
            <Pause className="h-3.5 w-3.5" /> Pause
          </Button>
          <Link to={entityLink(step.entity_type, step.entity_id)}>
            <Button size="sm" variant="ghost" className="h-8 gap-1">
              <ExternalLink className="h-3.5 w-3.5" /> View
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function DraftWithAIButton({ step }: { step: PersonalStepDue }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");

  const generate = async () => {
    setLoading(true);
    setDraft("");
    try {
      const { data, error } = await supabase.functions.invoke("draft-sequence-message", {
        body: {
          channel: step.channel,
          message_prompt: step.message_prompt,
          sequence_name: step.sequence_name,
          step_number: step.step_number,
          entity_type: step.entity_type,
          entity_id: step.entity_id,
          entity_name: step.entity_name,
          company: step.company,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDraft(data?.message ?? "");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to draft");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !draft && !loading) generate();
        if (!o) setDraft("");
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1">
          <Sparkles className="h-3.5 w-3.5 text-teal-400" /> Draft with AI
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px]" align="end">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested message</p>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={generate} disabled={loading}>
              <Sparkles className={cn("h-3 w-3 mr-1", loading && "animate-pulse")} /> Regenerate
            </Button>
          </div>
          <Textarea
            value={loading ? "Drafting…" : draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="text-sm"
            readOnly={loading}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(draft);
                toast.success("Copied — paste into your channel and send yourself");
              }}
              disabled={!draft}
            >
              Copy
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Draft only. Edit and send yourself — nothing sends from Desky.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PersonalTemplateCard({ template }: { template: any }) {
  const create = useCreateSequenceFromTemplate();
  const totalDays = (template.steps as any[]).reduce((m: number, s: any) => Math.max(m, s.day_offset ?? 0), 0);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{template.name}</h3>
          {template.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {template.steps.length} steps · {totalDays}d
        </span>
      </div>
      <div className="space-y-1 mb-3">
        {(template.steps as any[]).map((s: any) => {
          const Icon = channelIcon[s.channel] ?? Mail;
          return (
            <div key={s.step_number} className="flex items-start gap-2 text-xs">
              <span className="font-mono text-muted-foreground shrink-0 w-12">D+{s.day_offset}</span>
              <Icon className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-foreground/80 truncate">{s.message_prompt}</span>
            </div>
          );
        })}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() =>
          create.mutate(
            { name: template.name, description: template.description ?? undefined, template },
            { onSuccess: () => toast.success(`"${template.name}" added to your sequences`) }
          )
        }
      >
        Use this template
      </Button>
    </div>
  );
}

function CustomSequenceBuilder() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<Array<{ day_offset: number; channel: string; message_prompt: string; note: string }>>([
    { day_offset: 1, channel: "Email", message_prompt: "", note: "" },
  ]);
  const create = useCreateSequenceFromTemplate();

  const addStep = () =>
    setSteps((s) => [...s, { day_offset: (s[s.length - 1]?.day_offset ?? 0) + 7, channel: "Email", message_prompt: "", note: "" }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<(typeof steps)[number]>) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Name is required");
    if (steps.some((s) => !s.message_prompt.trim())) return toast.error("Every step needs a message prompt");
    try {
      await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        template: {
          id: "custom",
          name: name.trim(),
          description: description.trim() || null,
          category: "personal",
          steps: steps.map((s, i) => ({
            step_number: i + 1,
            day_offset: s.day_offset,
            channel: s.channel,
            message_prompt: s.message_prompt,
            note: s.note || undefined,
          })),
        } as any,
      });
      toast.success("Custom sequence saved");
      setOpen(false);
      setName("");
      setDescription("");
      setSteps([{ day_offset: 1, channel: "Email", message_prompt: "", note: "" }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Custom sequence
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create custom personal sequence</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CTO BD Nurture" />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Steps</p>
            {steps.map((s, i) => (
              <div key={i} className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Step {i + 1}</span>
                  {steps.length > 1 && (
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => removeStep(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Day (from start)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={s.day_offset}
                      onChange={(e) => updateStep(i, { day_offset: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Channel</Label>
                    <Select value={s.channel} onValueChange={(v) => updateStep(i, { channel: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Email">Email</SelectItem>
                        <SelectItem value="Phone">Phone</SelectItem>
                        <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                        <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-[11px]">Message prompt (talking point)</Label>
                  <Textarea
                    rows={2}
                    value={s.message_prompt}
                    onChange={(e) => updateStep(i, { message_prompt: e.target.value })}
                    placeholder="What's the angle for this step?"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Private note (optional)</Label>
                  <Input value={s.note} onChange={(e) => updateStep(i, { note: e.target.value })} />
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={addStep}>
              <Plus className="h-3.5 w-3.5" /> Add step
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={create.isPending}>Save sequence</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PerformanceSection() {
  const { data: perf = [], isLoading } = useTemplatePerformance();
  const personalPerf = perf.filter((p) => PERSONAL_TEMPLATE_NAMES.includes(p.template_name));
  if (isLoading) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-teal-400" />
        <h2 className="text-sm font-semibold">Sequence performance</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {personalPerf.map((p) => (
          <div key={p.template_name} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold truncate">{p.template_name}</h3>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {p.enrolled} active
              </Badge>
            </div>
            {p.per_step.length === 0 ? (
              <p className="text-xs text-muted-foreground">Not used yet.</p>
            ) : (
              <div className="space-y-1.5">
                {p.per_step.map((s) => {
                  const total = s.done + s.pending + s.skipped;
                  const pct = total > 0 ? Math.round((s.done / total) * 100) : 0;
                  return (
                    <div key={s.step_number} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground w-10">Step {s.step_number}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-teal-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-muted-foreground tabular-nums w-20 text-right">
                        {s.done}/{total} done
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
