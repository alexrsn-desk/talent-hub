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

    // Sort: red first, then amber, then green. Within same, oldest first.
    const urgencyOrder = { red: 0, amber: 1, green: 2 };
    actions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    return actions;
  }, [signals, candidateJobs, clients, candidates, overdueFollowups, todayInterviews]);
}

// ── Source tag colors ──────────────────────────────────
const sourceColors: Record<string, string> = {
  Signal: "bg-yellow-400/20 text-yellow-400",
  Pipeline: "bg-primary/20 text-primary",
  BD: "bg-sky-400/20 text-sky-400",
  Coach: "bg-violet-400/20 text-violet-400",
  "Call Prep": "bg-emerald-400/20 text-emerald-400",
};

const urgencyColors: Record<string, string> = {
  red: "border-l-destructive",
  amber: "border-l-amber-400",
  green: "border-l-emerald-400",
};

const urgencyDot: Record<string, string> = {
  red: "bg-destructive",
  amber: "bg-amber-400",
  green: "bg-emerald-400",
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
  const [showMore, setShowMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const createTodo = useCreateTodo();

  const visible = aiActions.filter(a => !dismissedIds.has(a.id));
  const displayed = showMore ? visible : visible.slice(0, 10);
  const hasMore = visible.length > 10;

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

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // Keyboard handler for the section
  const handleKeyDown = (e: React.KeyboardEvent, action: AIAction) => {
    if (e.key === "Enter") { e.preventDefault(); toggleExpand(action.id); }
    if (e.key === "Escape") { e.preventDefault(); setExpandedId(null); }
    if (e.key === "t" || e.key === "T") { e.preventDefault(); /* TODO: open touchpoint modal */ }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <Brain className="h-4 w-4 text-primary" /> AI Actions
      </h3>

      {visible.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-3">No actions right now. Your desk looks healthy.</p>
      )}

      <div className="divide-y divide-border">
        {displayed.map(action => (
          <AIActionRow
            key={action.id}
            action={action}
            expanded={expandedId === action.id}
            onToggle={() => toggleExpand(action.id)}
            onDismiss={handleDismiss}
            onAddToList={handleAddToMyList}
            onKeyDown={e => handleKeyDown(e, action)}
          />
        ))}
      </div>

      {hasMore && !showMore && (
        <button onClick={() => setShowMore(true)} className="text-xs text-primary hover:underline">
          {visible.length - 10} more actions →
        </button>
      )}
    </div>
  );
}

// ── AI Action Row (expandable) ─────────────────────────
function AIActionRow({ action, expanded, onToggle, onDismiss, onAddToList, onKeyDown }: {
  action: AIAction;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: (a: AIAction, reason: "done" | "not_relevant") => void;
  onAddToList: (a: AIAction) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const entityPath = action.entityType === "candidate" ? `/candidates` : `/clients`;

  return (
    <div
      className={`transition-all duration-200 ${expanded ? `bg-muted/20 border-l-2 ${urgencyColors[action.urgency]}` : ""}`}
    >
      {/* Collapsed row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={`flex items-center gap-2 px-2 py-2 group cursor-pointer hover:bg-muted/30 transition-colors min-h-[40px] ${expanded ? "bg-muted/10" : ""}`}
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${urgencyDot[action.urgency]}`} />
        <span className="text-sm font-medium shrink-0 max-w-[120px] truncate">{action.contactName}</span>
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">— {action.action}</span>
        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 shrink-0 ${sourceColors[action.source] || ""}`}>
          {action.source}
        </Badge>
        {!expanded && (
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-emerald-400" onClick={e => { e.stopPropagation(); onDismiss(action, "done"); }} title="Done">
              <Check className="h-3 w-3" />
            </Button>
          </div>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Expanded detail */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${expanded ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="px-4 pb-3 pt-1 space-y-2">
          <p className="text-sm text-foreground">{action.reason}</p>
          {action.company && (
            <p className="text-xs text-muted-foreground">Company: {action.company}</p>
          )}
          <p className="text-xs text-muted-foreground">Source: {action.source} · Generated from activity analysis</p>

          <div className="flex flex-wrap gap-2 pt-1">
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
