import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, AlertTriangle, CheckCircle2, Circle, Calendar, PoundSterling } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import {
  usePlacements,
  usePlacement,
  usePlacementCheckins,
  useUpdatePlacement,
  useUpdateCheckin,
  CHECKIN_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  type Placement,
  type PlacementCheckin,
} from "@/hooks/use-placements";

type StatusFilter = "all" | Placement["status"] | "this_month";

function formatDate(d: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d), "d MMM yyyy"); } catch { return d; }
}
function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return `£${Number(n).toLocaleString()}`;
}

function StatusBadge({ status }: { status: Placement["status"] }) {
  return (
    <Badge variant="outline" className={`border ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function PlacementListRow({ p, onOpen }: { p: Placement; onOpen: () => void }) {
  const today = new Date();
  const startsIn = p.start_date ? differenceInDays(parseISO(p.start_date), today) : null;
  const guaranteeIn = p.guarantee_expiry_date ? differenceInDays(parseISO(p.guarantee_expiry_date), today) : null;

  let nextAction = "—";
  let nextColor = "text-muted-foreground";
  if (p.status === "pre_start" && startsIn != null) {
    nextAction = startsIn <= 7 ? `Starts in ${startsIn}d` : `Starts ${formatDate(p.start_date)}`;
    nextColor = startsIn <= 7 ? "text-amber-400" : "text-muted-foreground";
  } else if (p.status === "active" && guaranteeIn != null) {
    nextAction = guaranteeIn <= 14 ? `Guarantee in ${guaranteeIn}d` : `Active`;
    nextColor = guaranteeIn <= 14 ? "text-amber-400" : "text-emerald-400";
  } else if (p.status === "at_risk") {
    nextAction = "Concern flagged";
    nextColor = "text-red-400";
  } else if (p.status === "guaranteed") {
    nextAction = "Closed successfully";
    nextColor = "text-blue-400";
  }

  let invoiceLabel = p.invoice_paid ? "Paid" : p.invoice_raised ? "Raised" : "Not raised";
  let invoiceColor = "text-muted-foreground";
  if (p.invoice_paid) invoiceColor = "text-emerald-400";
  else if (!p.invoice_raised && p.invoice_date && new Date(p.invoice_date) < today) invoiceColor = "text-red-400";
  else if (p.invoice_raised && p.invoice_due_date && new Date(p.invoice_due_date) < today && !p.invoice_paid) {
    invoiceLabel = "Overdue";
    invoiceColor = "text-red-400";
  }

  return (
    <tr onClick={onOpen} className="border-b border-border hover:bg-muted/30 cursor-pointer">
      <td className="px-3 py-3">
        <div className="font-medium text-foreground">{p.candidate_name_snapshot ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{p.job_title_snapshot ?? "—"}</div>
      </td>
      <td className="px-3 py-3 text-sm text-muted-foreground">{p.client_name_snapshot ?? "—"}</td>
      <td className="px-3 py-3 text-sm">{formatDate(p.start_date)}</td>
      <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
      <td className={`px-3 py-3 text-sm ${nextColor}`}>{nextAction}</td>
      <td className="px-3 py-3 text-sm">{formatMoney(p.fee_amount)}</td>
      <td className={`px-3 py-3 text-sm ${invoiceColor}`}>{invoiceLabel}</td>
    </tr>
  );
}

function PlacementListView({ onOpen }: { onOpen: (p: Placement) => void }) {
  const { data: placements = [], isLoading } = usePlacements();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<"start" | "next" | "fee" | "client">("start");

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
    list.sort((a, b) => {
      if (sort === "fee") return (b.fee_amount ?? 0) - (a.fee_amount ?? 0);
      if (sort === "client") return (a.client_name_snapshot ?? "").localeCompare(b.client_name_snapshot ?? "");
      if (sort === "next") return (a.guarantee_expiry_date ?? "9999").localeCompare(b.guarantee_expiry_date ?? "9999");
      return (b.start_date ?? "").localeCompare(a.start_date ?? "");
    });
    return list;
  }, [placements, search, filter, sort]);

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
            <SelectItem value="at_risk">At risk</SelectItem>
            <SelectItem value="this_month">This month</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as any)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="start">Sort: Start date</SelectItem>
            <SelectItem value="next">Sort: Next action</SelectItem>
            <SelectItem value="fee">Sort: Fee amount</SelectItem>
            <SelectItem value="client">Sort: Client</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Candidate / Role</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Next action</th>
              <th className="px-3 py-2">Fee</th>
              <th className="px-3 py-2">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
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

function TimelineRow({ label, date, done, danger }: { label: string; date: string | null; done?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/60 last:border-0">
      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className={`h-4 w-4 ${danger ? "text-red-400" : "text-muted-foreground"}`} />}
      <div className="flex-1 text-sm">{label}</div>
      <div className="text-xs text-muted-foreground">{formatDate(date)}</div>
    </div>
  );
}

function CheckinCard({ c, onSave }: { c: PlacementCheckin; onSave: (patch: Partial<PlacementCheckin>) => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(c.notes ?? "");
  const [concern, setConcern] = useState(c.concern_flagged);
  const overdue = !c.completed && new Date(c.due_date) < new Date();

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {c.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className={`h-4 w-4 ${overdue ? "text-amber-400" : "text-muted-foreground"}`} />}
          <span className="font-medium text-sm">{CHECKIN_LABELS[c.checkin_type]}</span>
          <span className="text-xs text-muted-foreground">· due {formatDate(c.due_date)}</span>
          {c.concern_flagged && <Badge variant="outline" className="border-red-500/30 text-red-400">Concern flagged</Badge>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>{open ? "Close" : c.completed ? "View" : "Log"}</Button>
      </div>
      {open && (
        <div className="space-y-2 pt-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed? Any concerns?" rows={3} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={concern} onChange={(e) => setConcern(e.target.checked)} />
            Concern flagged — needs follow-up
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { onSave({ notes, concern_flagged: concern, completed: true, completed_at: new Date().toISOString() }); setOpen(false); }}>
              Mark complete
            </Button>
            {c.completed && (
              <Button size="sm" variant="outline" onClick={() => { onSave({ notes, concern_flagged: concern }); setOpen(false); }}>
                Save changes
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlacementDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: p } = usePlacement(id);
  const { data: checkins = [] } = usePlacementCheckins(id);
  const updatePlacement = useUpdatePlacement();
  const updateCheckin = useUpdateCheckin();
  const [tab, setTab] = useState("overview");

  if (!p) return <div className="p-6 text-muted-foreground">Loading placement…</div>;

  const setField = (patch: Partial<Placement>) => updatePlacement.mutate({ id: p.id, ...patch });

  const today = new Date();
  const guaranteeIn = p.guarantee_expiry_date ? differenceInDays(parseISO(p.guarantee_expiry_date), today) : null;

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
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{p.candidate_name_snapshot}</h1>
        <p className="text-muted-foreground">{p.job_title_snapshot} at {p.client_name_snapshot}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="checkins">Check-ins ({checkins.filter(c => !c.completed).length})</TabsTrigger>
          <TabsTrigger value="status">Status & risk</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h3 className="font-medium text-sm flex items-center gap-2"><Calendar className="h-4 w-4" /> Key dates</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Offer accepted</Label>
                  <Input type="date" value={p.offer_accepted_date ?? ""} onChange={(e) => setField({ offer_accepted_date: e.target.value || null })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Start date *</Label>
                  <Input type="date" value={p.start_date ?? ""} onChange={(e) => setField({ start_date: e.target.value || null })} />
                </div>
              </div>
              <div className="text-sm space-y-1 pt-2">
                <TimelineRow label="Offer accepted" date={p.offer_accepted_date} done={!!p.offer_accepted_date} />
                <TimelineRow label="Start date" date={p.start_date} done={!!p.start_date && parseISO(p.start_date) <= today} />
                <TimelineRow label="Week 1 check-in" date={checkins.find(c=>c.checkin_type==="week_1")?.due_date ?? null} done={checkins.find(c=>c.checkin_type==="week_1")?.completed} />
                <TimelineRow label="Week 4 check-in" date={checkins.find(c=>c.checkin_type==="week_4")?.due_date ?? null} done={checkins.find(c=>c.checkin_type==="week_4")?.completed} />
                <TimelineRow label="Week 8 check-in" date={checkins.find(c=>c.checkin_type==="week_8")?.due_date ?? null} done={checkins.find(c=>c.checkin_type==="week_8")?.completed} />
                <TimelineRow label="Probation review" date={checkins.find(c=>c.checkin_type==="probation_review")?.due_date ?? null} done={checkins.find(c=>c.checkin_type==="probation_review")?.completed} />
                <TimelineRow label="Guarantee expiry" date={p.guarantee_expiry_date} danger={guaranteeIn!=null && guaranteeIn<=14 && guaranteeIn>0} />
                <TimelineRow label="Invoice due" date={p.invoice_due_date} done={p.invoice_paid} danger={!p.invoice_paid && !!p.invoice_due_date && parseISO(p.invoice_due_date) < today} />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h3 className="font-medium text-sm flex items-center gap-2"><PoundSterling className="h-4 w-4" /> Financial details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Salary placed at (£)</Label>
                  <Input type="number" value={p.salary_placed_at ?? ""} onChange={(e) => setField({ salary_placed_at: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Fee type</Label>
                  <Select value={p.fee_type} onValueChange={(v) => setField({ fee_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Percentage">Percentage</SelectItem>
                      <SelectItem value="Fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {p.fee_type === "Percentage" && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Fee %</Label>
                    <Input type="number" step="0.1" value={p.fee_percentage ?? ""} onChange={(e) => setField({ fee_percentage: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Fee amount (£)</Label>
                  <Input type="number" value={p.fee_amount ?? ""} onChange={(e) => setField({ fee_amount: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Invoice date</Label>
                  <Input type="date" value={p.invoice_date ?? ""} onChange={(e) => setField({ invoice_date: e.target.value || null })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Payment terms (days)</Label>
                  <Select value={String(p.payment_terms_days)} onValueChange={(v) => setField({ payment_terms_days: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Guarantee (weeks)</Label>
                  <Input type="number" value={p.guarantee_weeks} onChange={(e) => setField({ guarantee_weeks: Number(e.target.value || 12) })} />
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2 pt-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={p.invoice_raised} onChange={(e) => setField({ invoice_raised: e.target.checked, invoice_raised_at: e.target.checked ? new Date().toISOString() : null })} />
                    Invoice raised
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={p.invoice_paid} onChange={(e) => setField({ invoice_paid: e.target.checked, invoice_paid_at: e.target.checked ? new Date().toISOString() : null })} />
                    Invoice paid
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={p.notes ?? ""} onChange={(e) => setField({ notes: e.target.value })} rows={3} placeholder="Anything worth remembering about this placement…" />
          </div>
        </TabsContent>

        <TabsContent value="checkins" className="space-y-3">
          {checkins.length === 0 ? (
            <p className="text-sm text-muted-foreground">Set a start date to generate the check-in schedule.</p>
          ) : checkins.map((c) => (
            <CheckinCard key={c.id} c={c} onSave={(patch) => updateCheckin.mutate({ id: c.id, ...patch })} />
          ))}
        </TabsContent>

        <TabsContent value="status" className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Every placement is recoverable until proven otherwise. Mark "at risk" early so the coach can help you act on it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={p.status === "active" ? "default" : "outline"} onClick={() => setField({ status: "active" })}>Active</Button>
              <Button size="sm" variant={p.status === "at_risk" ? "default" : "outline"} onClick={() => setField({ status: "at_risk" })}>Mark at risk</Button>
              <Button size="sm" variant={p.status === "guaranteed" ? "default" : "outline"} onClick={() => setField({ status: "guaranteed" })}>Mark guaranteed</Button>
              <Button size="sm" variant={p.status === "fallen_through" ? "default" : "outline"} onClick={() => setField({ status: "fallen_through", fall_through_at: new Date().toISOString() })}>Fallen through</Button>
            </div>
            {p.status === "fallen_through" && (
              <div>
                <Label className="text-xs text-muted-foreground">Fall-through reason</Label>
                <Textarea value={p.fall_through_reason ?? ""} onChange={(e) => setField({ fall_through_reason: e.target.value })} rows={3} />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AnalyticsView() {
  const { data: placements = [] } = usePlacements();
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const thisYear = placements.filter((p) => p.start_date && parseISO(p.start_date) >= yearStart);
  const totalFees = thisYear.reduce((s, p) => s + Number(p.fee_amount ?? 0), 0);
  const avgFee = thisYear.length ? totalFees / thisYear.length : 0;
  const fellThrough = placements.filter((p) => p.status === "fallen_through").length;
  const fallRate = placements.length ? Math.round((fellThrough / placements.length) * 100) : 0;

  const sourceBreakdown: Record<string, number> = {};
  thisYear.forEach((p) => { const k = p.source ?? "manual"; sourceBreakdown[k] = (sourceBreakdown[k] ?? 0) + 1; });
  const totalSrc = Object.values(sourceBreakdown).reduce((a, b) => a + b, 0) || 1;

  const clientCount: Record<string, number> = {};
  placements.forEach((p) => { const k = p.client_name_snapshot ?? "—"; clientCount[k] = (clientCount[k] ?? 0) + 1; });
  const topClient = Object.entries(clientCount).sort((a, b) => b[1] - a[1])[0];

  const stats = [
    { label: "Placements this year", value: thisYear.length },
    { label: "Total fees this year", value: formatMoney(totalFees) },
    { label: "Average fee", value: formatMoney(Math.round(avgFee)) },
    { label: "Fall-through rate", value: `${fallRate}%` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-2xl font-semibold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-medium text-sm mb-3">Placement source</h3>
          {Object.entries(sourceBreakdown).length === 0 ? (
            <p className="text-sm text-muted-foreground">No placements yet this year.</p>
          ) : Object.entries(sourceBreakdown).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm py-1">
              <span className="capitalize">{k.replace(/_/g, " ")}</span>
              <span className="text-muted-foreground">{Math.round((v / totalSrc) * 100)}%</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-medium text-sm mb-3">Most placed client</h3>
          <p className="text-lg">{topClient ? `${topClient[0]} (${topClient[1]})` : "—"}</p>
        </div>
      </div>
    </div>
  );
}

export default function PlacementsPage() {
  const [view, setView] = useState<"list" | "detail" | "analytics">("list");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Placements</h1>
          <p className="text-sm text-muted-foreground">Every placement deserves its own record — from offer to guarantee.</p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1 text-sm">
          <button onClick={() => setView("list")} className={`px-3 py-1 rounded-md ${view==="list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>List</button>
          <button onClick={() => setView("analytics")} className={`px-3 py-1 rounded-md ${view==="analytics" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Analytics</button>
        </div>
      </div>

      {view === "list" && !openId && <PlacementListView onOpen={(p) => { setOpenId(p.id); setView("detail"); }} />}
      {view === "detail" && openId && <PlacementDetailView id={openId} onBack={() => { setOpenId(null); setView("list"); }} />}
      {view === "analytics" && <AnalyticsView />}
    </div>
  );
}
