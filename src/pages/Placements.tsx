import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Search,
  AlertTriangle,
  CheckCircle2,
  Circle,
  PoundSterling,
  Building2,
  UserPlus,
  Briefcase,
  X,
  TrendingUp,
  Activity,
} from "lucide-react";
import { format, differenceInDays, differenceInMonths, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  usePlacements,
  usePlacement,
  usePlacementCheckins,
  useUpdatePlacement,
  useUpdateCheckin,
  useTrackingEvents,
  useCreateTrackingEvent,
  CHECKIN_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  type Placement,
  type PlacementCheckin,
} from "@/hooks/use-placements";
import { useCreateClient, useCreateContact, useClients } from "@/hooks/use-data";
import { Link } from "react-router-dom";

type StatusFilter = "all" | Placement["status"] | "this_month";

function formatDate(d: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d), "d MMM yyyy"); } catch { return d; }
}
function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return `£${Number(n).toLocaleString()}`;
}
function initials(name: string | null) {
  if (!name) return "—";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
}

function StatusBadge({ status }: { status: Placement["status"] }) {
  return (
    <Badge variant="outline" className={`border ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function nextCheckinFor(checkins: PlacementCheckin[]) {
  const open = checkins.filter((c) => !c.completed).sort((a, b) => a.due_date.localeCompare(b.due_date));
  return open[0] ?? null;
}

// ============= LIST =============
function PlacementListRow({ p, onOpen }: { p: Placement; onOpen: () => void }) {
  const { data: checkins = [] } = usePlacementCheckins(p.id);
  const next = nextCheckinFor(checkins);
  const today = new Date();
  let nextLabel = "—";
  let nextColor = "text-muted-foreground";
  if (next) {
    const daysOut = differenceInDays(parseISO(next.due_date), today);
    nextLabel = `${CHECKIN_LABELS[next.checkin_type]} · ${formatDate(next.due_date)}`;
    if (daysOut < 0) nextColor = "text-red-400";
    else if (daysOut <= 7) nextColor = "text-amber-400";
    else nextColor = "text-emerald-400";
  } else if (p.status === "guaranteed" || p.status === "settled") {
    nextLabel = "All check-ins complete";
    nextColor = "text-emerald-400";
  }

  return (
    <tr onClick={onOpen} className="border-b border-border hover:bg-muted/30 cursor-pointer">
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold">
            {initials(p.candidate_name_snapshot)}
          </div>
          <div>
            <div className="font-medium text-foreground">{p.candidate_name_snapshot ?? "—"}</div>
            <div className="text-xs text-muted-foreground truncate">
              {p.job_title_snapshot ?? "—"} <span className="text-muted-foreground/60">at</span> {p.client_name_snapshot ?? "—"}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-sm">{formatDate(p.start_date)}</td>
      <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
      <td className={`px-3 py-3 text-xs ${nextColor}`}>{nextLabel}</td>
      <td className="px-3 py-3 text-sm">{formatMoney(p.fee_amount)}</td>
    </tr>
  );
}

function PlacementListView({ onOpen }: { onOpen: (p: Placement) => void }) {
  const { data: placements = [], isLoading } = usePlacements();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    let list = [...placements];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        [p.candidate_name_snapshot, p.client_name_snapshot, p.job_title_snapshot]
          .filter(Boolean)
          .some((s) => s!.toLowerCase().includes(q))
      );
    }
    if (filter === "this_month") {
      const now = new Date();
      list = list.filter((p) => {
        if (!p.start_date) return false;
        const d = parseISO(p.start_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (filter !== "all") {
      list = list.filter((p) => p.status === filter);
    }
    list.sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
    return list;
  }, [placements, search, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search candidate, client, job…" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pre_start">Pre-start</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="guaranteed">Guaranteed</SelectItem>
            <SelectItem value="settled">Settled</SelectItem>
            <SelectItem value="at_risk">At risk</SelectItem>
            <SelectItem value="this_month">This month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Candidate</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Next check-in</th>
              <th className="px-3 py-2">Fee</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                No placements yet. Move a candidate to <span className="text-foreground">Placed</span> on any job to create one automatically.
              </td></tr>
            ) : (
              filtered.map((p) => <PlacementListRow key={p.id} p={p} onOpen={() => onOpen(p)} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============= CHECK-IN TIMELINE (visual) =============
const TIMELINE_TYPES: PlacementCheckin["checkin_type"][] = ["week_1", "week_4", "week_8", "probation_review", "guarantee_expiry"];
const TIMELINE_LABELS: Record<PlacementCheckin["checkin_type"], string> = {
  week_1: "Week 1",
  week_4: "Week 4",
  week_8: "Week 8",
  probation_review: "Probation",
  guarantee_expiry: "Guarantee end",
  custom: "Check-in",
};

function CheckinTimeline({ checkins, onLog }: { checkins: PlacementCheckin[]; onLog: (c: PlacementCheckin) => void }) {
  const map = new Map(checkins.map((c) => [c.checkin_type, c]));
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="font-medium text-sm mb-4 flex items-center gap-2"><Activity className="h-4 w-4" /> Check-in timeline</h3>
      <div className="flex items-center justify-between gap-2">
        {TIMELINE_TYPES.map((t, i) => {
          const c = map.get(t);
          const done = c?.completed;
          const overdue = c && !done && new Date(c.due_date) < new Date();
          return (
            <div key={t} className="flex-1 flex items-center">
              <button
                type="button"
                disabled={!c}
                onClick={() => c && onLog(c)}
                className="flex flex-col items-center gap-1 disabled:opacity-50"
              >
                <div className={`h-9 w-9 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-colors ${
                  done ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                    : overdue ? "bg-red-500/15 border-red-500 text-red-400"
                    : c ? "bg-card border-border hover:border-primary"
                    : "bg-muted/30 border-muted"
                }`}>
                  {done ? "✓" : i + 1}
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{TIMELINE_LABELS[t]}</span>
                <span className="text-[9px] text-muted-foreground/70">{c ? formatDate(c.due_date) : "—"}</span>
              </button>
              {i < TIMELINE_TYPES.length - 1 && (
                <div className={`flex-1 h-0.5 mb-7 ${done ? "bg-emerald-500/40" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CheckinDialog({ c, onClose, onSave }: { c: PlacementCheckin; onClose: () => void; onSave: (patch: Partial<PlacementCheckin>) => void }) {
  const [notes, setNotes] = useState(c.notes ?? "");
  const [concern, setConcern] = useState(c.concern_flagged);
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg p-5 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{CHECKIN_LABELS[c.checkin_type]}</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-muted-foreground">Due {formatDate(c.due_date)}</p>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How is it going? Any concerns?" rows={4} autoFocus />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={concern} onChange={(e) => setConcern(e.target.checked)} />
          Concern flagged — needs follow-up
        </label>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave({ notes, concern_flagged: concern, completed: true, completed_at: new Date().toISOString() }); onClose(); }}>
            Save check-in
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============= PLACEMENT DETAILS TAB =============
function PlacementDetailsTab({ p, checkins, onSaveCheckin, setField }: {
  p: Placement; checkins: PlacementCheckin[];
  onSaveCheckin: (id: string, patch: Partial<PlacementCheckin>) => void;
  setField: (patch: Partial<Placement>) => void;
}) {
  const [logging, setLogging] = useState<PlacementCheckin | null>(null);
  const today = new Date();

  let invoiceLabel: "Raised" | "Paid" | "Overdue" | "Not raised" = "Not raised";
  let invoiceColor = "text-muted-foreground";
  if (p.invoice_paid) { invoiceLabel = "Paid"; invoiceColor = "text-emerald-400"; }
  else if (p.invoice_raised && p.invoice_due_date && parseISO(p.invoice_due_date) < today) { invoiceLabel = "Overdue"; invoiceColor = "text-red-400"; }
  else if (p.invoice_raised) { invoiceLabel = "Raised"; invoiceColor = "text-blue-400"; }

  return (
    <div className="space-y-4">
      {/* Essentials */}
      <div className="rounded-lg border border-border bg-card p-4 grid md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <Label className="text-xs text-muted-foreground">Candidate</Label>
          <div>
            {p.candidate_id ? (
              <Link to={`/candidates?open=${p.candidate_id}`} className="text-primary hover:underline">{p.candidate_name_snapshot}</Link>
            ) : (p.candidate_name_snapshot ?? "—")}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Client</Label>
          <div>
            {p.client_id ? (
              <Link to={`/clients?open=${p.client_id}`} className="text-primary hover:underline">{p.client_name_snapshot}</Link>
            ) : (p.client_name_snapshot ?? "—")}
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Job title</Label>
          <div>{p.job_title_snapshot ?? "—"}</div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Start date</Label>
          <Input type="date" value={p.start_date ?? ""} onChange={(e) => setField({ start_date: e.target.value || null })} className="h-8" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Salary placed (£)</Label>
          <Input type="number" value={p.salary_placed_at ?? ""} onChange={(e) => setField({ salary_placed_at: e.target.value ? Number(e.target.value) : null })} className="h-8" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Fee (£)</Label>
          <Input type="number" value={p.fee_amount ?? ""} onChange={(e) => setField({ fee_amount: e.target.value ? Number(e.target.value) : null })} className="h-8" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Guarantee (weeks)</Label>
          <Input type="number" value={p.guarantee_weeks} onChange={(e) => setField({ guarantee_weeks: Number(e.target.value || 12) })} className="h-8" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Guarantee expiry</Label>
          <div className="h-8 flex items-center text-muted-foreground">{formatDate(p.guarantee_expiry_date)}</div>
        </div>
        <div className="md:col-span-2 flex items-center justify-between pt-2 border-t border-border/60">
          <div>
            <Label className="text-xs text-muted-foreground">Invoice status</Label>
            <div className={`text-sm font-medium ${invoiceColor}`}>{invoiceLabel}</div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={p.invoice_raised ? "default" : "outline"}
              onClick={() => setField({ invoice_raised: !p.invoice_raised, invoice_raised_at: !p.invoice_raised ? new Date().toISOString() : null })}>
              {p.invoice_raised ? "Raised ✓" : "Mark raised"}
            </Button>
            <Button size="sm" variant={p.invoice_paid ? "default" : "outline"}
              onClick={() => setField({ invoice_paid: !p.invoice_paid, invoice_paid_at: !p.invoice_paid ? new Date().toISOString() : null })}>
              {p.invoice_paid ? "Paid ✓" : "Mark paid"}
            </Button>
          </div>
        </div>
      </div>

      <CheckinTimeline checkins={checkins} onLog={setLogging} />

      {/* Completed check-ins list */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-medium text-sm mb-3">Logged check-ins</h3>
        {checkins.filter((c) => c.completed).length === 0 ? (
          <p className="text-xs text-muted-foreground">No check-ins logged yet. Click a milestone above to log one.</p>
        ) : (
          <div className="space-y-2">
            {checkins.filter((c) => c.completed).map((c) => (
              <div key={c.id} className="text-sm border-l-2 border-emerald-500/40 pl-3 py-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-medium">{CHECKIN_LABELS[c.checkin_type]}</span>
                  <span className="text-xs text-muted-foreground">· {formatDate(c.completed_at?.slice(0, 10) ?? null)}</span>
                  {c.concern_flagged && <Badge variant="outline" className="border-red-500/30 text-red-400 text-[10px]">Concern</Badge>}
                </div>
                {c.notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{c.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {logging && <CheckinDialog c={logging} onClose={() => setLogging(null)} onSave={(patch) => onSaveCheckin(logging.id, patch)} />}
    </div>
  );
}

// ============= CANDIDATE TRACKING TAB =============
function BdPromptCard({
  icon: Icon, title, body, primaryLabel, secondaryLabel = "Not now",
  onPrimary, onSecondary, done, doneLabel,
}: {
  icon: any; title: string; body: React.ReactNode;
  primaryLabel: string; secondaryLabel?: string;
  onPrimary: () => void; onSecondary: () => void;
  done?: boolean; doneLabel?: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${done ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 ${done ? "text-emerald-400" : "text-amber-400"}`} />
        <div className="flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{body}</p>
          {done ? (
            <Badge variant="outline" className="mt-2 border-emerald-500/30 text-emerald-400 text-[10px]">{doneLabel ?? "Done"}</Badge>
          ) : (
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={onPrimary}>{primaryLabel}</Button>
              <Button size="sm" variant="ghost" onClick={onSecondary}>{secondaryLabel}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CandidateTrackingTab({ p, setField }: { p: Placement; setField: (patch: Partial<Placement>) => void }) {
  const { data: events = [] } = useTrackingEvents(p.id);
  const createEvent = useCreateTrackingEvent();
  const createClient = useCreateClient();
  const createContact = useCreateContact();
  const { data: clients = [] } = useClients();
  const [moveForm, setMoveForm] = useState({
    new_company: p.new_company ?? "",
    new_job_title: p.new_job_title ?? "",
    new_manager_name: p.new_manager_name ?? "",
    new_manager_linkedin: p.new_manager_linkedin ?? "",
    move_date: p.move_date ?? new Date().toISOString().slice(0, 10),
    reason_for_leaving: p.reason_for_leaving ?? "",
    still_in_contact: p.still_in_contact ?? true,
  });
  const [trackingNote, setTrackingNote] = useState("");

  const moved = p.still_at_client === false;
  const dismissed = p.bd_prompts_dismissed ?? {};

  const confirmStillAt = async () => {
    setField({ still_at_client: true, last_tracking_checkin_at: new Date().toISOString() });
    await createEvent.mutateAsync({
      placement_id: p.id,
      event_type: "still_confirmed",
      title: `Confirmed still at ${p.client_name_snapshot ?? "client"}`,
      notes: null,
      metadata: {},
      occurred_at: new Date().toISOString(),
    });
    toast.success("Confirmed");
  };

  const markMoved = async () => {
    if (!moveForm.new_company.trim()) { toast.error("Enter new company"); return; }
    setField({
      still_at_client: false,
      new_company: moveForm.new_company.trim(),
      new_job_title: moveForm.new_job_title.trim() || null,
      new_manager_name: moveForm.new_manager_name.trim() || null,
      new_manager_linkedin: moveForm.new_manager_linkedin.trim() || null,
      move_date: moveForm.move_date || null,
      reason_for_leaving: moveForm.reason_for_leaving.trim() || null,
      still_in_contact: moveForm.still_in_contact,
    });
    await createEvent.mutateAsync({
      placement_id: p.id,
      event_type: "moved",
      title: `Moved to ${moveForm.new_company.trim()}`,
      notes: moveForm.reason_for_leaving.trim() || null,
      metadata: { new_job_title: moveForm.new_job_title, new_manager_name: moveForm.new_manager_name },
      occurred_at: new Date(moveForm.move_date || Date.now()).toISOString(),
    });
    toast.success("Move recorded");
  };

  const dismissPrompt = (key: string) => setField({ bd_prompts_dismissed: { ...dismissed, [key]: true } });

  const addCompanyAsLead = async () => {
    if (!p.new_company) return;
    try {
      const existing = clients.find((c) => c.company_name?.toLowerCase() === p.new_company!.toLowerCase());
      let clientId = existing?.id;
      if (!existing) {
        const created = await createClient.mutateAsync({
          company_name: p.new_company,
          contact_name: p.new_manager_name ?? null,
          job_title: null, email: null, phone: null, linkedin_url: null,
          sector: "Tech", status: "Target", heat: "warm",
          last_activity_date: new Date().toISOString().slice(0, 10),
          next_action: `Warm BD via ${p.candidate_name_snapshot} placement`,
          next_action_due_date: null, website: null, location: null, summary: null,
          next_followup_date: null, owner_user_id: p.owner_user_id, incomplete_profile: false,
        } as any);
        clientId = (created as any).id;
      }
      setField({ bd_new_company_client_id: clientId ?? null });
      await createEvent.mutateAsync({
        placement_id: p.id, event_type: "bd_action",
        title: `Added ${p.new_company} to BD Pipeline as Target`,
        notes: null, metadata: { client_id: clientId },
        occurred_at: new Date().toISOString(),
      });
      toast.success("Added to BD pipeline");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add");
    }
  };

  const addManagerAsContact = async () => {
    if (!p.new_manager_name || !p.bd_new_company_client_id) {
      toast.error("Add the new company to BD pipeline first");
      return;
    }
    try {
      const created = await createContact.mutateAsync({
        client_id: p.bd_new_company_client_id,
        name: p.new_manager_name,
        first_name: p.new_manager_name.split(" ")[0] ?? null,
        last_name: p.new_manager_name.split(" ").slice(1).join(" ") || null,
        job_title: null, email: null, phone: null,
        linkedin_url: p.new_manager_linkedin ?? null,
        summary: `New manager of ${p.candidate_name_snapshot} (placed by us)`,
        reengage_date: null, reengage_reason: null,
        incomplete_profile: false, owner_user_id: p.owner_user_id,
      } as any);
      setField({ bd_new_manager_contact_id: (created as any).id });
      await createEvent.mutateAsync({
        placement_id: p.id, event_type: "bd_action",
        title: `Added ${p.new_manager_name} as contact`,
        notes: null, metadata: { contact_id: (created as any).id },
        occurred_at: new Date().toISOString(),
      });
      toast.success("Contact added");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add contact");
    }
  };

  const logOldRoleBd = async () => {
    setField({ bd_old_role_logged_at: new Date().toISOString() });
    await createEvent.mutateAsync({
      placement_id: p.id, event_type: "bd_action",
      title: `Logged BD opportunity: backfill ${p.job_title_snapshot} at ${p.client_name_snapshot}`,
      notes: null, metadata: {}, occurred_at: new Date().toISOString(),
    });
    toast.success("BD opportunity logged");
  };

  const addNote = async () => {
    const t = trackingNote.trim();
    if (!t) return;
    await createEvent.mutateAsync({
      placement_id: p.id, event_type: "note", title: t, notes: null,
      metadata: {}, occurred_at: new Date().toISOString(),
    });
    setTrackingNote("");
    toast.success("Note added");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold text-base">Where are they now?</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          What happens to {p.candidate_name_snapshot?.split(" ")[0] ?? "this candidate"} after the placement is your BD intelligence layer.
        </p>
      </div>

      {/* Current position */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Still at {p.client_name_snapshot ?? "client"}?</h3>
          <div className="flex gap-2">
            <Button size="sm" variant={p.still_at_client === true ? "default" : "outline"} onClick={confirmStillAt}>Yes — confirmed</Button>
            <Button size="sm" variant={p.still_at_client === false ? "default" : "outline"} onClick={() => setField({ still_at_client: false })}>No — moved on</Button>
          </div>
        </div>

        {p.still_at_client === true && (
          <div className="grid md:grid-cols-3 gap-3 pt-2 border-t border-border/60 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Last check-in</Label>
              <div>{p.last_tracking_checkin_at ? formatDate(p.last_tracking_checkin_at.slice(0, 10)) : "—"}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Settled?</Label>
              <Select value={p.settled_status ?? "unknown"} onValueChange={(v) => setField({ settled_status: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Relationship health</Label>
              <Select value={p.relationship_health ?? "warm"} onValueChange={(v) => setField({ relationship_health: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strong">🟢 Strong</SelectItem>
                  <SelectItem value="warm">🟡 Warm</SelectItem>
                  <SelectItem value="cold">🔴 Cold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea rows={2} value={p.tracking_notes ?? ""} onChange={(e) => setField({ tracking_notes: e.target.value })} />
            </div>
          </div>
        )}

        {moved && (
          <div className="grid md:grid-cols-2 gap-3 pt-2 border-t border-border/60">
            <div>
              <Label className="text-xs text-muted-foreground">New company</Label>
              <Input value={moveForm.new_company} onChange={(e) => setMoveForm((f) => ({ ...f, new_company: e.target.value }))} className="h-8" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">New job title</Label>
              <Input value={moveForm.new_job_title} onChange={(e) => setMoveForm((f) => ({ ...f, new_job_title: e.target.value }))} className="h-8" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">New manager name</Label>
              <Input value={moveForm.new_manager_name} onChange={(e) => setMoveForm((f) => ({ ...f, new_manager_name: e.target.value }))} className="h-8" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">New manager LinkedIn</Label>
              <Input value={moveForm.new_manager_linkedin} onChange={(e) => setMoveForm((f) => ({ ...f, new_manager_linkedin: e.target.value }))} className="h-8" placeholder="https://..." />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Move date</Label>
              <Input type="date" value={moveForm.move_date} onChange={(e) => setMoveForm((f) => ({ ...f, move_date: e.target.value }))} className="h-8" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Still in contact</Label>
              <Select value={moveForm.still_in_contact ? "yes" : "no"} onValueChange={(v) => setMoveForm((f) => ({ ...f, still_in_contact: v === "yes" }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs text-muted-foreground">Reason for leaving (optional)</Label>
              <Textarea rows={2} value={moveForm.reason_for_leaving} onChange={(e) => setMoveForm((f) => ({ ...f, reason_for_leaving: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button size="sm" onClick={markMoved}>Save move</Button>
            </div>
          </div>
        )}
      </div>

      {/* BD prompts after a move */}
      {moved && p.new_company && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="font-medium text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-amber-400" /> BD intelligence from this move</h3>

          {!dismissed.company && (
            <BdPromptCard
              icon={Building2}
              title={`${p.candidate_name_snapshot} has moved to ${p.new_company}${p.new_job_title ? ` as ${p.new_job_title}` : ""}.`}
              body={<>This is worth a BD call: they know you, they trust you, and they're now potentially a hiring manager or know who is.<br/>→ Add <span className="text-foreground font-medium">{p.new_company}</span> to BD Pipeline?</>}
              primaryLabel="Yes — add as Target"
              onPrimary={addCompanyAsLead}
              onSecondary={() => dismissPrompt("company")}
              done={!!p.bd_new_company_client_id}
              doneLabel={`Added to BD pipeline ✓`}
            />
          )}

          {p.new_manager_name && !dismissed.manager && (
            <BdPromptCard
              icon={UserPlus}
              title={`${p.candidate_name_snapshot}'s new manager is ${p.new_manager_name} at ${p.new_company}.`}
              body={<>Worth adding as a contact — they may be hiring in future and {p.candidate_name_snapshot?.split(" ")[0]} can make a warm intro.<br/>→ Add <span className="text-foreground font-medium">{p.new_manager_name}</span> as contact?</>}
              primaryLabel="Yes — add"
              onPrimary={addManagerAsContact}
              onSecondary={() => dismissPrompt("manager")}
              done={!!p.bd_new_manager_contact_id}
              doneLabel="Added as contact ✓"
            />
          )}

          {!dismissed.old_role && (
            <BdPromptCard
              icon={Briefcase}
              title={`${p.candidate_name_snapshot} has left ${p.client_name_snapshot}.`}
              body={<>Their <span className="text-foreground font-medium">{p.job_title_snapshot}</span> role may need filling. → Reach out to {p.client_name_snapshot} to see if they need help replacing them?</>}
              primaryLabel="Log as BD opportunity"
              onPrimary={logOldRoleBd}
              onSecondary={() => dismissPrompt("old_role")}
              done={!!p.bd_old_role_logged_at}
              doneLabel="BD opportunity logged ✓"
            />
          )}
        </div>
      )}

      {/* Re-engage reminder */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-medium text-sm mb-2">Re-engage reminder</h3>
        <p className="text-xs text-muted-foreground mb-2">Check in with {p.candidate_name_snapshot?.split(" ")[0] ?? "this candidate"} every:</p>
        <div className="flex gap-2">
          {[3, 6, 12].map((m) => (
            <Button key={m} size="sm" variant={p.reengage_frequency_months === m ? "default" : "outline"}
              onClick={async () => {
                setField({ reengage_frequency_months: m });
                await createEvent.mutateAsync({
                  placement_id: p.id, event_type: "reengage_set",
                  title: `Re-engage cadence set: every ${m} months`,
                  notes: null, metadata: { months: m },
                  occurred_at: new Date().toISOString(),
                });
                toast.success(`Will check in every ${m} months`);
              }}>{m} months</Button>
          ))}
        </div>
      </div>

      {/* Tracking history */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-medium text-sm mb-3">Tracking history</h3>
        <div className="flex gap-2 mb-3">
          <Input value={trackingNote} onChange={(e) => setTrackingNote(e.target.value)} placeholder="Add a tracking note…" className="h-8" />
          <Button size="sm" onClick={addNote} disabled={!trackingNote.trim()}>Add</Button>
        </div>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tracking activity yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((e) => (
              <div key={e.id} className="border-l-2 border-primary/30 pl-3">
                <div className="text-sm font-medium">{e.title}</div>
                <div className="text-[11px] text-muted-foreground">{formatDate(e.occurred_at.slice(0, 10))} · {e.event_type.replace(/_/g, " ")}</div>
                {e.notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{e.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============= DETAIL =============
function PlacementDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: p } = usePlacement(id);
  const { data: checkins = [] } = usePlacementCheckins(id);
  const updatePlacement = useUpdatePlacement();
  const updateCheckin = useUpdateCheckin();
  const createEvent = useCreateTrackingEvent();
  const [tab, setTab] = useState("details");

  if (!p) return <div className="p-6 text-muted-foreground">Loading placement…</div>;

  const setField = (patch: Partial<Placement>) => updatePlacement.mutate({ id: p.id, ...patch });

  const today = new Date();
  const guaranteeIn = p.guarantee_expiry_date ? differenceInDays(parseISO(p.guarantee_expiry_date), today) : null;
  const monthsAt = p.start_date ? differenceInMonths(today, parseISO(p.start_date)) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> All placements</Button>
        <StatusBadge status={p.status} />
        {guaranteeIn != null && guaranteeIn > 0 && guaranteeIn <= 14 && (
          <Badge variant="outline" className="border-amber-500/30 text-amber-400">
            <AlertTriangle className="h-3 w-3 mr-1" /> Guarantee in {guaranteeIn}d
          </Badge>
        )}
        {monthsAt != null && monthsAt >= 12 && p.still_at_client !== false && (
          <Badge variant="outline" className="border-blue-500/30 text-blue-400">
            At client {monthsAt}mo — worth a check-in
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
          {initials(p.candidate_name_snapshot)}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{p.candidate_name_snapshot}</h1>
          <p className="text-muted-foreground">{p.job_title_snapshot} at {p.client_name_snapshot}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="details">Placement details</TabsTrigger>
          <TabsTrigger value="tracking">Candidate tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <PlacementDetailsTab
            p={p}
            checkins={checkins}
            setField={setField}
            onSaveCheckin={async (id, patch) => {
              await updateCheckin.mutateAsync({ id, ...patch });
              const c = checkins.find((x) => x.id === id);
              if (c && patch.completed) {
                await createEvent.mutateAsync({
                  placement_id: p.id, event_type: "check_in",
                  title: `${CHECKIN_LABELS[c.checkin_type]} logged`,
                  notes: patch.notes ?? null, metadata: { concern: patch.concern_flagged ?? false },
                  occurred_at: new Date().toISOString(),
                });
              }
              toast.success("Check-in saved");
            }}
          />
        </TabsContent>

        <TabsContent value="tracking">
          <CandidateTrackingTab p={p} setField={setField} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============= ANALYTICS (simplified) =============
function AnalyticsSummary() {
  const { data: placements = [] } = usePlacements();
  const total = placements.length;
  const totalFees = placements.reduce((s, p) => s + Number(p.fee_amount ?? 0), 0);
  const avgFee = total ? Math.round(totalFees / total) : 0;
  const fellThrough = placements.filter((p) => p.status === "fallen_through").length;
  const settled = placements.filter((p) => p.still_at_client === true && (p.settled_status === "yes" || p.status === "settled" || p.status === "guaranteed")).length;
  const movedOn = placements.filter((p) => p.still_at_client === false).length;

  // avg time to place (offer accepted - created)
  const days = placements
    .filter((p) => p.offer_accepted_date && p.created_at)
    .map((p) => differenceInDays(parseISO(p.offer_accepted_date!), parseISO(p.created_at)));
  const avgDays = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
  const avgWeeks = avgDays != null ? Math.max(0, Math.round(avgDays / 7)) : null;

  const aiCount = placements.filter((p) => (p as any).source === "ai").length;
  const aiPct = total ? Math.round((aiCount / total) * 100) : 0;

  const stats = [
    { label: "Total placements", value: total },
    { label: "Total fees", value: formatMoney(totalFees) },
    { label: "Average fee", value: formatMoney(avgFee) },
    { label: "Avg time to place", value: avgWeeks != null ? `${avgWeeks}w` : "—" },
    { label: "Still placed & settled", value: settled },
    { label: "Moved on tracked", value: movedOn },
    { label: "Fall-throughs", value: fellThrough },
    { label: "AI suggested placements", value: total ? `${aiCount} (${aiPct}%)` : aiCount },
  ];


  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">{s.label}</div>
          <div className="text-2xl font-semibold mt-1">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ============= PAGE =============
export default function PlacementsPage() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Placements</h1>
        <p className="text-sm text-muted-foreground">Every placement deserves its own record — from offer to long-term BD intelligence.</p>
      </div>

      {openId ? (
        <PlacementDetailView id={openId} onBack={() => setOpenId(null)} />
      ) : (
        <>
          <PlacementListView onOpen={(p) => setOpenId(p.id)} />
          <div className="pt-2">
            <h2 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <PoundSterling className="h-4 w-4" /> Summary
            </h2>
            <AnalyticsSummary />
          </div>
        </>
      )}
    </div>
  );
}
