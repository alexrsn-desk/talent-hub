import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, Check, Flag, CalendarIcon, Trash2, GripVertical, ChevronDown, Phone, Mail, FileText, ExternalLink, X, Lightbulb, AlertTriangle, BarChart3, Brain, PhoneCall, RotateCcw, Link2, Repeat, SkipForward, Sparkles, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTodos, useCreateTodo, useUpdateTodo, useDeleteTodo, type TodoTask } from "@/hooks/use-todos";
import { useAllUnactionedSignals, useUpdateSignalStatus, useFeedbackSignal, type CallSignal } from "@/hooks/use-signals";
import { useCandidateJobs, useClients, useTodayFollowUps, useOverdueFollowUps, useTodayInterviews, useCandidates } from "@/hooks/use-data";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────
type AIActionSource = "Signal" | "Pipeline" | "BD" | "Coach" | "Call Prep" | "Sequence";

type AIAction = {
  id: string;
  contactName: string;
  company: string;
  action: string;
  reason: string;
  urgency: "red" | "amber" | "green" | "sequence";
  source: AIActionSource;
  entityType: "candidate" | "client";
  entityId: string;
  signalId?: string;
  // Sequence-only fields (populated when source === "Sequence")
  sequenceName?: string;
  sequenceStep?: number;
  sequenceChannel?: string;
  sequencePrompt?: string;
};

type GroupMode = "priority" | "type" | "sequence";

// ── Helpers ────────────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function daysAgo(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function isToday(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  d.setHours(23, 59, 59);
  return d < new Date();
}

// ── AI Actions Builder ─────────────────────────────────
function useAIActions(): AIAction[] {
  const { data: signals = [] } = useAllUnactionedSignals();
  const { data: candidateJobs = [] } = useCandidateJobs();
  const { data: clients = [] } = useClients();
  const { data: candidates = [] } = useCandidates();
  const { data: overdueFollowups = [] } = useOverdueFollowUps();
  const { data: todayInterviews = [] } = useTodayInterviews();

  return useMemo(() => {
    const actions: AIAction[] = [];

    // 1. From signals
    for (const s of signals) {
      const sig = s as CallSignal;
      const isMissing = sig.signal_category === "missing_action";
      actions.push({
        id: `signal-${sig.id}`,
        contactName: sig.trigger_phrase?.slice(0, 40) || "Contact",
        company: "",
        action: sig.suggested_action,
        reason: sig.explanation,
        urgency: isMissing ? "amber" : "green",
        source: isMissing ? "Signal" : "Signal",
        entityType: "candidate",
        entityId: sig.note_id,
        signalId: sig.id,
      });
    }

    // 2. Offer stage with no recent activity (2+ days)
    for (const cj of candidateJobs) {
      if ((cj.stage === "Offer" || cj.stage === "Awaiting Feedback") && daysAgo(cj.created_at) >= 2) {
        const cand = candidates.find(c => c.id === cj.candidate_id);
        if (!cand) continue;
        actions.push({
          id: `offer-${cj.id}`,
          contactName: cand.name,
          company: cand.current_employer || "",
          action: `Follow up on ${cj.stage.toLowerCase()} — ${daysAgo(cj.created_at)} days with no activity`,
          reason: "Offers go cold quickly. A quick check-in keeps momentum.",
          urgency: "red",
          source: "Pipeline",
          entityType: "candidate",
          entityId: cand.id,
        });
      }
    }

    // 3. Today's interviews — prep reminders
    for (const cj of todayInterviews) {
      const cand = candidates.find(c => c.id === cj.candidate_id);
      if (!cand) continue;
      actions.push({
        id: `interview-${cj.id}`,
        contactName: cand.name,
        company: cand.current_employer || "",
        action: "Interview today — prep and send good luck message",
        reason: "Candidates who feel supported perform better and stay engaged.",
        urgency: "amber",
        source: "Pipeline",
        entityType: "candidate",
        entityId: cand.id,
      });
    }

    // 4. CV submitted 5+ days, no feedback
    for (const cj of candidateJobs) {
      if (cj.stage === "Submitted" && daysAgo(cj.created_at) >= 5) {
        const cand = candidates.find(c => c.id === cj.candidate_id);
        if (!cand) continue;
        actions.push({
          id: `feedback-${cj.id}`,
          contactName: cand.name,
          company: cand.current_employer || "",
          action: `CV submitted ${daysAgo(cj.created_at)} days ago — chase client for feedback`,
          reason: "Candidates lose interest after a week without feedback.",
          urgency: daysAgo(cj.created_at) >= 7 ? "red" : "amber",
          source: "Pipeline",
          entityType: "candidate",
          entityId: cand.id,
        });
      }
    }

    // 5. Screening with no contact in 7+ days
    for (const cj of candidateJobs) {
      if (cj.stage === "Screening" && daysAgo(cj.created_at) >= 7) {
        const cand = candidates.find(c => c.id === cj.candidate_id);
        if (!cand) continue;
        actions.push({
          id: `screening-${cj.id}`,
          contactName: cand.name,
          company: cand.current_employer || "",
          action: `In screening for ${daysAgo(cj.created_at)} days — contact or move forward`,
          reason: "Candidates in limbo disengage. Progress or release them.",
          urgency: "amber",
          source: "Pipeline",
          entityType: "candidate",
          entityId: cand.id,
        });
      }
    }

    // 6. BD — clients with overdue next action
    for (const client of clients) {
      if (client.next_action_due_date && isOverdue(client.next_action_due_date)) {
        actions.push({
          id: `bd-${client.id}`,
          contactName: client.contact_name || client.company_name,
          company: client.company_name,
          action: `Overdue: ${client.next_action || "Follow up"} — was due ${new Date(client.next_action_due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
          reason: "Missed follow-ups damage credibility with clients.",
          urgency: "red",
          source: "BD",
          entityType: "client",
          entityId: client.id,
        });
      }
    }

    // 7. BD — prospects with no contact in 10+ days
    for (const client of clients) {
      if ((client.status === "Target" || client.status === "Contacted") && client.last_activity_date && daysAgo(client.last_activity_date) >= 10) {
        actions.push({
          id: `prospect-${client.id}`,
          contactName: client.contact_name || client.company_name,
          company: client.company_name,
          action: `No contact in ${daysAgo(client.last_activity_date)} days — re-engage`,
          reason: "Prospects go cold without regular touchpoints.",
          urgency: "green",
          source: "BD",
          entityType: "client",
          entityId: client.id,
        });
      }
    }

    // 8. Terms sent with no response in 5+ days
    for (const client of clients) {
      if (client.status === "Terms Sent" && client.last_activity_date && daysAgo(client.last_activity_date) >= 5) {
        actions.push({
          id: `terms-${client.id}`,
          contactName: client.contact_name || client.company_name,
          company: client.company_name,
          action: `Terms sent ${daysAgo(client.last_activity_date)} days ago — follow up`,
          reason: "Terms need a nudge after 5 days or the deal stalls.",
          urgency: "amber",
          source: "BD",
          entityType: "client",
          entityId: client.id,
        });
      }
    }

    // Sort: red first, then amber, then green, then sequence. Within same, oldest first.
    const urgencyOrder: Record<AIAction["urgency"], number> = { red: 0, amber: 1, green: 2, sequence: 3 };
    actions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    return actions;
  }, [signals, candidateJobs, clients, candidates, overdueFollowups, todayInterviews]);
}

// ── Source tag colors ──────────────────────────────────
const sourceColors: Record<AIActionSource, string> = {
  Signal: "bg-yellow-400/20 text-yellow-400",
  Pipeline: "bg-primary/20 text-primary",
  BD: "bg-sky-400/20 text-sky-400",
  Coach: "bg-violet-400/20 text-violet-400",
  "Call Prep": "bg-emerald-400/20 text-emerald-400",
  Sequence: "bg-teal-400/20 text-teal-400",
};

// Group/section labels and colors keyed by source
const sourceGroupMeta: Record<AIActionSource, { label: string; headerClass: string; dotClass: string }> = {
  Sequence: { label: "Sequence Follow-Ups", headerClass: "text-teal-400", dotClass: "bg-teal-400" },
  Pipeline: { label: "Pipeline Alerts", headerClass: "text-amber-400", dotClass: "bg-amber-400" },
  BD: { label: "BD Outreach", headerClass: "text-sky-400", dotClass: "bg-sky-400" },
  Signal: { label: "Call Signals", headerClass: "text-yellow-400", dotClass: "bg-yellow-400" },
  Coach: { label: "Coach Recommendations", headerClass: "text-violet-400", dotClass: "bg-violet-400" },
  "Call Prep": { label: "Call Prep", headerClass: "text-emerald-400", dotClass: "bg-emerald-400" },
};

const urgencyColors: Record<string, string> = {
  red: "border-l-destructive",
  amber: "border-l-amber-400",
  green: "border-l-emerald-400",
  sequence: "border-l-teal-400",
};

const urgencyDot: Record<string, string> = {
  red: "bg-destructive",
  amber: "bg-amber-400",
  green: "bg-emerald-400",
  sequence: "bg-teal-400",
};

// ── My List Segment ────────────────────────────────────
function MyListSegment() {
  const { data: todos = [] } = useTodos();
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [newTask, setNewTask] = useState("");
  const [showDone, setShowDone] = useState(false);

  const active = todos.filter(t => !t.completed);
  const todayStr = new Date().toDateString();
  const doneToday = todos.filter(t => t.completed && t.completed_at && new Date(t.completed_at).toDateString() === todayStr);

  const handleAdd = async () => {
    if (!newTask.trim()) return;
    await createTodo.mutateAsync({ title: newTask.trim() });
    setNewTask("");
  };

  const toggleComplete = (task: TodoTask) => {
    if (task.completed) {
      updateTodo.mutate({ id: task.id, completed: false, completed_at: null });
    } else {
      updateTodo.mutate({ id: task.id, completed: true, completed_at: new Date().toISOString() });
      // Handle recurrence
      if (task.recurrence) {
        const dueDate = new Date();
        if (task.recurrence === "daily") dueDate.setDate(dueDate.getDate() + 1);
        if (task.recurrence === "weekly") dueDate.setDate(dueDate.getDate() + 7);
        if (task.recurrence === "monthly") dueDate.setMonth(dueDate.getMonth() + 1);
        createTodo.mutate({
          title: task.title,
          due_date: dueDate.toISOString().split("T")[0],
          priority: task.priority,
          recurrence: task.recurrence,
        });
        toast.success("Recurring task recreated");
      }
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <FileText className="h-4 w-4 text-primary" /> My List
      </h3>

      {/* Add task */}
      <div className="flex gap-2">
        <Input
          placeholder="Add a task..."
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={handleAdd} disabled={!newTask.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Active tasks */}
      <div className="space-y-1">
        {active.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-3">Nothing on your list. Add a task above.</p>
        )}
        {active.map(task => (
          <TaskRow key={task.id} task={task} onToggle={toggleComplete} onDelete={id => deleteTodo.mutate(id)} onUpdate={updateTodo.mutate} />
        ))}
      </div>

      {/* Done today */}
      {doneToday.length > 0 && (
        <Collapsible open={showDone} onOpenChange={setShowDone}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`h-3 w-3 transition-transform ${showDone ? "" : "-rotate-90"}`} />
              Done today ({doneToday.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1 mt-1 opacity-50">
              {doneToday.map(task => (
                <TaskRow key={task.id} task={task} onToggle={toggleComplete} onDelete={id => deleteTodo.mutate(id)} onUpdate={updateTodo.mutate} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ── Task Row ───────────────────────────────────────────
function TaskRow({ task, onToggle, onDelete, onUpdate }: {
  task: TodoTask;
  onToggle: (t: TodoTask) => void;
  onDelete: (id: string) => void;
  onUpdate: (updates: { id: string } & Partial<TodoTask>) => void;
}) {
  const dueDateColor = task.due_date
    ? isOverdue(task.due_date) ? "text-destructive" : isToday(task.due_date) ? "text-amber-400" : "text-muted-foreground"
    : "";

  return (
    <div className={`flex items-center gap-2 rounded-md px-2 py-1.5 group hover:bg-muted/30 transition-colors ${task.completed ? "line-through text-muted-foreground" : ""}`}>
      <button onClick={() => onToggle(task)} className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${task.completed ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"}`}>
        {task.completed && <Check className="h-3 w-3 text-primary-foreground" />}
      </button>
      <span className="flex-1 text-sm min-w-0 truncate">{task.title}</span>
      {task.recurrence && (
        <RotateCcw className="h-3 w-3 text-muted-foreground shrink-0" />
      )}
      {task.priority === "high" && (
        <Flag className="h-3 w-3 text-destructive shrink-0" />
      )}
      {task.due_date && (
        <span className={`text-[10px] shrink-0 ${dueDateColor}`}>
          {new Date(task.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </span>
      )}
      <div className="hidden group-hover:flex items-center gap-0.5">
        <button
          onClick={() => onUpdate({ id: task.id, priority: task.priority === "high" ? "normal" : "high" })}
          className="p-0.5 rounded hover:bg-muted"
          title="Toggle priority"
        >
          <Flag className={`h-3 w-3 ${task.priority === "high" ? "text-destructive" : "text-muted-foreground"}`} />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-0.5 rounded hover:bg-muted">
          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  );
}

// ── AI Actions Segment ─────────────────────────────────
function AIActionsSegment() {
  const aiActions = useAIActions();
  const updateSignalStatus = useUpdateSignalStatus();
  const feedbackSignal = useFeedbackSignal();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [showMore, setShowMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("priority");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const createTodo = useCreateTodo();

  const visible = aiActions.filter(a => !dismissedIds.has(a.id));
  const sequenceActions = visible.filter(a => a.source === "Sequence" && !skippedIds.has(a.id));
  const skippedSequenceActions = visible.filter(a => a.source === "Sequence" && skippedIds.has(a.id));

  const handleDismiss = (action: AIAction, reason: "done" | "not_relevant") => {
    setDismissedIds(prev => new Set(prev).add(action.id));
    if (action.signalId) {
      if (reason === "done") {
        updateSignalStatus.mutate({ id: action.signalId, status: "actioned" });
      } else {
        feedbackSignal.mutate({ id: action.signalId, rating: "thumbs_down" });
      }
    }
    toast(reason === "done" ? "Marked as done" : "Removed — thanks for the feedback");
  };

  const handleAddToMyList = (action: AIAction) => {
    createTodo.mutate({ title: `${action.contactName}: ${action.action}` });
    toast.success("Added to My List");
  };

  const handleSkipSequence = (action: AIAction) => {
    setSkippedIds(prev => new Set(prev).add(action.id));
    toast("Skipped — will try again tomorrow");
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: AIAction) => {
    if (e.key === "Enter") { e.preventDefault(); toggleExpand(action.id); }
    if (e.key === "Escape") { e.preventDefault(); setExpandedId(null); }
    if (e.key === "t" || e.key === "T") { e.preventDefault(); }
  };

  // ── Sequence Execution Mode ────────────────────────────
  if (groupMode === "sequence") {
    return (
      <SequenceExecutionMode
        actions={sequenceActions}
        skippedActions={skippedSequenceActions}
        focusedIndex={focusedIndex}
        setFocusedIndex={setFocusedIndex}
        onDone={a => handleDismiss(a, "done")}
        onSkip={handleSkipSequence}
        onAddNote={handleAddToMyList}
        onSwitchMode={setGroupMode}
      />
    );
  }

  // ── Build groups for "type" mode ───────────────────────
  const groupedByType: { source: AIActionSource; actions: AIAction[] }[] = [];
  if (groupMode === "type") {
    const order: AIActionSource[] = ["Sequence", "Pipeline", "Signal", "BD", "Coach", "Call Prep"];
    for (const src of order) {
      const items = visible.filter(a => a.source === src);
      if (items.length > 0) groupedByType.push({ source: src, actions: items });
    }
  }

  const displayed = showMore ? visible : visible.slice(0, 10);
  const hasMore = visible.length > 10;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Brain className="h-4 w-4 text-primary" /> AI Actions
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Group by</span>
          <Select value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
            <SelectTrigger className="h-7 text-xs gap-1 w-auto px-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority" className="text-xs">Priority</SelectItem>
              <SelectItem value="type" className="text-xs">Type</SelectItem>
              <SelectItem value="sequence" className="text-xs">
                <span className="flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-teal-400" /> Sequence
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-3">No actions right now. Your desk looks healthy.</p>
      )}

      {/* PRIORITY MODE — flat list */}
      {groupMode === "priority" && (
        <>
          <div className="divide-y divide-border">
            {displayed.map(action => (
              <AIActionRow
                key={action.id}
                action={action}
                expanded={expandedId === action.id}
                onToggle={() => toggleExpand(action.id)}
                onDismiss={handleDismiss}
                onAddToList={handleAddToMyList}
                onSkipSequence={handleSkipSequence}
                onKeyDown={e => handleKeyDown(e, action)}
              />
            ))}
          </div>
          {hasMore && !showMore && (
            <button onClick={() => setShowMore(true)} className="text-xs text-primary hover:underline">
              {visible.length - 10} more actions →
            </button>
          )}
        </>
      )}

      {/* TYPE MODE — grouped */}
      {groupMode === "type" && (
        <div className="space-y-4">
          {groupedByType.map(({ source, actions }) => {
            const meta = sourceGroupMeta[source];
            return (
              <div key={source} className="space-y-1">
                <div className="flex items-center gap-2 px-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
                  <h4 className={`text-[11px] font-semibold uppercase tracking-wider ${meta.headerClass}`}>
                    {meta.label}
                  </h4>
                  <span className="text-[10px] text-muted-foreground">({actions.length})</span>
                </div>
                <div className="divide-y divide-border">
                  {actions.map(action => (
                    <AIActionRow
                      key={action.id}
                      action={action}
                      expanded={expandedId === action.id}
                      onToggle={() => toggleExpand(action.id)}
                      onDismiss={handleDismiss}
                      onAddToList={handleAddToMyList}
                      onSkipSequence={handleSkipSequence}
                      onKeyDown={e => handleKeyDown(e, action)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sequence Execution Mode ────────────────────────────
function SequenceExecutionMode({
  actions, skippedActions, focusedIndex, setFocusedIndex,
  onDone, onSkip, onAddNote, onSwitchMode,
}: {
  actions: AIAction[];
  skippedActions: AIAction[];
  focusedIndex: number;
  setFocusedIndex: (n: number) => void;
  onDone: (a: AIAction) => void;
  onSkip: (a: AIAction) => void;
  onAddNote: (a: AIAction) => void;
  onSwitchMode: (m: GroupMode) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const total = actions.length + skippedActions.length;
  const done = 0; // session-only counter could be added; for now show remaining

  // Group by sequence name for header
  const sequenceCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of actions) {
      const name = a.sequenceName || "Sequence";
      map.set(name, (map.get(name) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [actions]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!containerRef.current) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (actions.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex(Math.min(focusedIndex + 1, actions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(Math.max(focusedIndex - 1, 0));
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        const a = actions[focusedIndex];
        if (a) onDone(a);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        const a = actions[focusedIndex];
        if (a) onSkip(a);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        const a = actions[focusedIndex];
        if (a) onAddNote(a);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, focusedIndex, setFocusedIndex, onDone, onSkip, onAddNote]);

  return (
    <div className="space-y-3" ref={containerRef}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-teal-400" /> Sequence Execution
        </h3>
        <Select value="sequence" onValueChange={(v) => onSwitchMode(v as GroupMode)}>
          <SelectTrigger className="h-7 text-xs gap-1 w-auto px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority" className="text-xs">Priority</SelectItem>
            <SelectItem value="type" className="text-xs">Type</SelectItem>
            <SelectItem value="sequence" className="text-xs">
              <span className="flex items-center gap-1.5">
                <Link2 className="h-3 w-3 text-teal-400" /> Sequence
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {actions.length === 0 && skippedActions.length === 0 && (
        <div className="rounded-md border border-dashed border-teal-400/30 bg-teal-400/5 px-4 py-6 text-center">
          <Link2 className="h-5 w-5 mx-auto text-teal-400/60 mb-2" />
          <p className="text-xs text-muted-foreground">
            No personal sequence reminders today.
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Reminders will appear here once you enrol candidates in a personal sequence.
          </p>
        </div>
      )}

      {actions.length > 0 && (
        <>
          {/* Sequence header */}
          <div className="rounded-md border border-teal-400/20 bg-teal-400/5 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <p className="text-xs font-medium text-teal-400">
                {sequenceCounts.length === 1
                  ? `${sequenceCounts[0][0]} — ${sequenceCounts[0][1]} follow-up${sequenceCounts[0][1] !== 1 ? "s" : ""} today`
                  : `${actions.length} follow-up${actions.length !== 1 ? "s" : ""} across ${sequenceCounts.length} sequences`}
              </p>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Keyboard className="h-3 w-3" /> D done · S skip · N note · ↑↓ nav
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-teal-400 transition-all"
                  style={{ width: `${total > 0 ? ((total - actions.length) / total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {total - actions.length} of {total} done
              </span>
            </div>
          </div>

          {/* Compact rows */}
          <div className="divide-y divide-border">
            {actions.map((action, idx) => (
              <div
                key={action.id}
                onClick={() => setFocusedIndex(idx)}
                className={`flex items-center gap-2 px-2 py-2 cursor-pointer transition-colors border-l-2 ${
                  idx === focusedIndex
                    ? "bg-teal-400/10 border-l-teal-400"
                    : "border-l-transparent hover:bg-muted/30"
                }`}
              >
                <Link2 className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                <span className="text-sm font-medium shrink-0 truncate max-w-[140px]">
                  {action.contactName}
                </span>
                <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                  Step {action.sequenceStep ?? "?"} — {action.sequenceChannel || "Any"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-2 gap-1 text-emerald-400 hover:text-emerald-300"
                  onClick={e => { e.stopPropagation(); onDone(action); }}
                  title="Mark done (D)"
                >
                  <Check className="h-3 w-3" /> Done
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-2 gap-1 text-muted-foreground"
                  onClick={e => { e.stopPropagation(); onSkip(action); }}
                  title="Skip (S)"
                >
                  <SkipForward className="h-3 w-3" /> Skip
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {skippedActions.length > 0 && (
        <div className="text-[10px] text-muted-foreground italic px-2">
          {skippedActions.length} skipped — will try again tomorrow
        </div>
      )}
    </div>
  );
}

// ── AI Action Row (expandable) ─────────────────────────
function AIActionRow({ action, expanded, onToggle, onDismiss, onAddToList, onSkipSequence, onKeyDown }: {
  action: AIAction;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: (a: AIAction, reason: "done" | "not_relevant") => void;
  onAddToList: (a: AIAction) => void;
  onSkipSequence: (a: AIAction) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const entityPath = action.entityType === "candidate" ? `/candidates` : `/clients`;
  const isSequence = action.source === "Sequence";

  return (
    <div
      className={`transition-all duration-200 border-l-2 ${
        isSequence ? "border-l-teal-400/60" : expanded ? urgencyColors[action.urgency] : "border-l-transparent"
      } ${expanded ? "bg-muted/20" : ""}`}
    >
      {/* Collapsed row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={`flex items-start gap-2 px-2 py-2 group cursor-pointer hover:bg-muted/30 transition-colors min-h-[40px] ${expanded ? "bg-muted/10" : ""}`}
      >
        {/* Indicator: chain icon for sequence, dot for everything else */}
        {isSequence ? (
          <Link2 className="h-3.5 w-3.5 text-teal-400 shrink-0 mt-0.5" />
        ) : (
          <span className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${urgencyDot[action.urgency]}`} />
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate max-w-[160px]">{action.contactName}</span>
            {!isSequence && (
              <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">— {action.action}</span>
            )}
          </div>
          {/* Sequence subtitle */}
          {isSequence && action.sequenceName && (
            <p className="text-[11px] text-teal-400/80 truncate mt-0.5">
              {action.sequenceName}
              {action.sequenceStep ? ` — Step ${action.sequenceStep}` : ""}
              {action.sequenceChannel ? ` — ${action.sequenceChannel}` : ""}
            </p>
          )}
          {isSequence && action.sequencePrompt && !expanded && (
            <p className="text-[11px] text-muted-foreground italic truncate mt-0.5">
              "{action.sequencePrompt}"
            </p>
          )}
        </div>

        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 mt-0.5 ${sourceColors[action.source] || ""}`}>
          {action.source}
        </Badge>
        {!expanded && !isSequence && (
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 mt-0.5">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-emerald-400" onClick={e => { e.stopPropagation(); onDismiss(action, "done"); }} title="Done">
              <Check className="h-3 w-3" />
            </Button>
          </div>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Expanded detail */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${expanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="px-4 pb-3 pt-1 space-y-2">
          {isSequence && action.sequencePrompt && (
            <div className="rounded-md bg-teal-400/5 border border-teal-400/20 px-3 py-2">
              <p className="text-[10px] text-teal-400 uppercase tracking-wider font-medium mb-1">Message prompt</p>
              <p className="text-sm text-foreground italic">"{action.sequencePrompt}"</p>
            </div>
          )}
          <p className="text-sm text-foreground">{action.reason}</p>
          {action.company && (
            <p className="text-xs text-muted-foreground">Company: {action.company}</p>
          )}
          <p className="text-xs text-muted-foreground">Source: {action.source} · Generated from activity analysis</p>

          <div className="flex flex-wrap gap-2 pt-1">
            {isSequence ? (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={e => { e.stopPropagation(); window.location.href = entityPath; }}>
                  <Phone className="h-3 w-3" /> Contact Now
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-teal-400 hover:text-teal-300" onClick={e => { e.stopPropagation(); toast("AI draft coming with Outreach module"); }}>
                  <Sparkles className="h-3 w-3" /> Draft Message
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-400 hover:text-emerald-300" onClick={e => { e.stopPropagation(); onDismiss(action, "done"); }}>
                  <Check className="h-3 w-3" /> Log Done
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-muted-foreground" onClick={e => { e.stopPropagation(); onSkipSequence(action); }}>
                  <SkipForward className="h-3 w-3" /> Skip
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={e => { e.stopPropagation(); window.location.href = entityPath; }}>
                  <ExternalLink className="h-3 w-3" /> View Record
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={e => { e.stopPropagation(); onAddToList(action); }}>
                  <Plus className="h-3 w-3" /> Add to My List
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-400 hover:text-emerald-300" onClick={e => { e.stopPropagation(); onDismiss(action, "done"); }}>
                  <Check className="h-3 w-3" /> Done
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive/80" onClick={e => { e.stopPropagation(); onDismiss(action, "not_relevant"); }}>
                  <X className="h-3 w-3" /> Not Relevant
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main TodoList Component ────────────────────────────
export function TodoList() {
  const { data: todos = [] } = useTodos();
  const aiActions = useAIActions();

  const activeTodos = todos.filter(t => !t.completed).length;
  const aiCount = aiActions.length;
  const topUrgent = aiActions.find(a => a.urgency === "red");

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm text-muted-foreground">
          {getGreeting()}. You have{" "}
          <span className="font-medium text-foreground">{aiCount} action{aiCount !== 1 ? "s" : ""}</span> from AI and{" "}
          <span className="font-medium text-foreground">{activeTodos} task{activeTodos !== 1 ? "s" : ""}</span> on your list.
          {topUrgent && (
            <> Your most urgent: <span className="text-destructive font-medium">{topUrgent.contactName} — {topUrgent.action.slice(0, 60)}</span></>
          )}
        </p>
      </div>

      {/* Two segments */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="p-4">
          <MyListSegment />
        </div>
        <div className="p-4">
          <AIActionsSegment />
        </div>
      </div>
    </div>
  );
}
