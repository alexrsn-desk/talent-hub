import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowUpDown, ExternalLink, Search, Filter, TrendingUp, Plus, Phone, Link2, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type Kind = "candidate" | "contact";
type Row = {
  id: string;
  kind: Kind;
  name: string;
  company: string | null;
  title: string | null;
  linkedin_url: string | null;
  source: string | null;
  bd_message_variant: string | null;
  bd_date_first_contacted: string | null;
  bd_status: string | null;
  bd_last_touch_date: string | null;
  bd_next_followup_date: string | null;
  bd_trigger_notes: string | null;
  bd_conversation_notes: string | null;
  bd_outcome: string | null;
};

type TouchpointStats = {
  count: number;
  lastMedium: string | null;
  lastAt: string | null;
};

const MEDIUMS = ["Phone", "LinkedIn", "Email", "Other"] as const;
type Medium = typeof MEDIUMS[number];

const STATUS_OPTIONS = [
  "Not contacted",
  "Contacted - no reply",
  "Replied - staying in touch",
  "Replied - not interested",
  "In conversation",
  "Became a lead",
  "Placed/Won",
  "Dead",
];

const CANDIDATE_COLS =
  "id,name,current_employer,job_title,linkedin_url,source,bd_message_variant,bd_date_first_contacted,bd_status,bd_last_touch_date,bd_next_followup_date,bd_trigger_notes,bd_conversation_notes,bd_outcome";

function useBDRows() {
  return useQuery({
    queryKey: ["bd-tracker-rows"],
    queryFn: async (): Promise<Row[]> => {
      const [cands, cons] = await Promise.all([
        supabase.from("candidates").select(CANDIDATE_COLS).order("bd_last_touch_date", { ascending: false, nullsFirst: false }),
        supabase.from("contacts").select("id,name,job_title,linkedin_url,source,bd_message_variant,bd_date_first_contacted,bd_status,bd_last_touch_date,bd_next_followup_date,bd_trigger_notes,bd_conversation_notes,bd_outcome,client_id,clients:client_id(company_name)"),
      ]);
      if (cands.error) throw cands.error;
      if (cons.error) throw cons.error;

      const rows: Row[] = [];
      for (const c of (cands.data ?? []) as any[]) {
        // Only include rows that have any BD tracking field populated
        if (!hasBD(c)) continue;
        rows.push({
          id: c.id, kind: "candidate",
          name: c.name, company: c.current_employer, title: c.job_title,
          linkedin_url: c.linkedin_url, source: c.source,
          bd_message_variant: c.bd_message_variant,
          bd_date_first_contacted: c.bd_date_first_contacted,
          bd_status: c.bd_status,
          bd_last_touch_date: c.bd_last_touch_date,
          bd_next_followup_date: c.bd_next_followup_date,
          bd_trigger_notes: c.bd_trigger_notes,
          bd_conversation_notes: c.bd_conversation_notes,
          bd_outcome: c.bd_outcome,
        });
      }
      for (const c of (cons.data ?? []) as any[]) {
        if (!hasBD(c)) continue;
        rows.push({
          id: c.id, kind: "contact",
          name: c.name, company: c.clients?.company_name ?? null, title: c.job_title,
          linkedin_url: c.linkedin_url, source: c.source,
          bd_message_variant: c.bd_message_variant,
          bd_date_first_contacted: c.bd_date_first_contacted,
          bd_status: c.bd_status,
          bd_last_touch_date: c.bd_last_touch_date,
          bd_next_followup_date: c.bd_next_followup_date,
          bd_trigger_notes: c.bd_trigger_notes,
          bd_conversation_notes: c.bd_conversation_notes,
          bd_outcome: c.bd_outcome,
        });
      }
      return rows;
    },
  });
}

function hasBD(r: any) {
  return !!(
    r.bd_message_variant || r.bd_status || r.bd_date_first_contacted ||
    r.bd_last_touch_date || r.bd_next_followup_date ||
    r.bd_trigger_notes || r.bd_conversation_notes || r.bd_outcome ||
    (r.source && r.source !== "LinkedIn")
  );
}

function useUpdateRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, field, value }: { row: Row; field: keyof Row; value: any }) => {
      const table = row.kind === "candidate" ? "candidates" : "contacts";
      const { error } = await (supabase.from(table) as any).update({ [field]: value || null }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bd-tracker-rows"] }),
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });
}

function useTouchpoints() {
  return useQuery({
    queryKey: ["bd-touchpoints"],
    queryFn: async (): Promise<{ candidate: Map<string, TouchpointStats>; contact: Map<string, TouchpointStats> }> => {
      const { data, error } = await (supabase.from("activity_events") as any)
        .select("candidate_id,contact_id,medium,occurred_at,event_type")
        .eq("event_type", "contacted")
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      const cand = new Map<string, TouchpointStats>();
      const cont = new Map<string, TouchpointStats>();
      for (const e of (data ?? []) as any[]) {
        const map = e.candidate_id ? cand : e.contact_id ? cont : null;
        const key = e.candidate_id ?? e.contact_id;
        if (!map || !key) continue;
        const prev = map.get(key) ?? { count: 0, lastMedium: null, lastAt: null };
        // First iteration for this key is the most recent (data is desc)
        if (prev.count === 0) {
          prev.lastMedium = e.medium ?? null;
          prev.lastAt = e.occurred_at ?? null;
        }
        prev.count += 1;
        map.set(key, prev);
      }
      return { candidate: cand, contact: cont };
    },
  });
}

function useLogTouchpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, medium, occurred_at }: { row: Row; medium: Medium; occurred_at?: string }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const owner_user_id = userRes.user?.id;
      if (!owner_user_id) throw new Error("Not authenticated");
      const when = occurred_at ? new Date(occurred_at).toISOString() : new Date().toISOString();
      const payload: any = {
        owner_user_id,
        event_type: "contacted",
        source: "manual",
        medium,
        occurred_at: when,
      };
      if (row.kind === "candidate") payload.candidate_id = row.id;
      else payload.contact_id = row.id;

      const { error } = await (supabase.from("activity_events") as any).insert(payload);
      if (error) throw error;

      // Also bump bd_last_touch_date for quick sorting
      const table = row.kind === "candidate" ? "candidates" : "contacts";
      await (supabase.from(table) as any)
        .update({ bd_last_touch_date: when.slice(0, 10) })
        .eq("id", row.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bd-touchpoints"] });
      qc.invalidateQueries({ queryKey: ["bd-tracker-rows"] });
      toast.success("Touchpoint logged");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to log touchpoint"),
  });
}

function daysSince(d: string | null) {
  if (!d) return null;
  try { return differenceInCalendarDays(new Date(), parseISO(d)); } catch { return null; }
}

function isOverdue(d: string | null) {
  if (!d) return false;
  try { return differenceInCalendarDays(new Date(), parseISO(d)) >= 0; } catch { return false; }
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d), "d MMM yy"); } catch { return d; }
}

/* ---------- editable cells ---------- */

function TextEditor({ value, onSave, placeholder, multiline }: {
  value: string | null; onSave: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  const [v, setV] = useState(value ?? "");
  return (
    <Popover onOpenChange={(o) => !o && v !== (value ?? "") && onSave(v)}>
      <PopoverTrigger asChild>
        <button className="w-full text-left text-[12px] text-foreground/90 truncate min-h-[24px] px-1 py-0.5 rounded hover:bg-muted">
          {value || <span className="text-muted-foreground/60">{placeholder ?? "—"}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        {multiline ? (
          <Textarea value={v} onChange={(e) => setV(e.target.value)} rows={5} placeholder={placeholder} />
        ) : (
          <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
        )}
      </PopoverContent>
    </Popover>
  );
}

function DateEditor({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  return (
    <Input
      type="date"
      value={value ?? ""}
      onChange={(e) => onSave(e.target.value)}
      className="h-7 text-[12px] px-2 border-transparent hover:border-input bg-transparent"
    />
  );
}

function StatusEditor({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  return (
    <Select value={value ?? ""} onValueChange={onSave}>
      <SelectTrigger className="h-7 text-[12px] border-transparent hover:border-input bg-transparent">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function mediumIcon(m: string | null) {
  const s = (m ?? "").toLowerCase();
  if (s === "phone") return <Phone className="h-3 w-3" />;
  if (s === "linkedin") return <Link2 className="h-3 w-3" />;
  if (s === "email") return <Mail className="h-3 w-3" />;
  if (s) return <MessageSquare className="h-3 w-3" />;
  return null;
}

function LogTouchpoint({ row, onLog }: { row: Row; onLog: (m: Medium, when: string) => void }) {
  const [open, setOpen] = useState(false);
  const [medium, setMedium] = useState<Medium>("LinkedIn");
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] gap-1">
          <Plus className="h-3 w-3" /> Log
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="text-[12px] font-medium">Log touchpoint</div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Medium</label>
          <Select value={medium} onValueChange={(v) => setMedium(v as Medium)}>
            <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MEDIUMS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Date</label>
          <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} className="h-8 text-[12px]" />
        </div>
        <Button size="sm" className="w-full h-8 text-[12px]"
          onClick={() => { onLog(medium, when); setOpen(false); }}>
          Add touchpoint
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- variant summary ---------- */

function VariantSummary({ rows }: { rows: Row[] }) {
  const stats = useMemo(() => {
    const byVariant = new Map<string, { total: number; replied: number; lead: number; won: number }>();
    for (const r of rows) {
      const v = r.bd_message_variant?.trim();
      if (!v) continue;
      const s = byVariant.get(v) ?? { total: 0, replied: 0, lead: 0, won: 0 };
      s.total += 1;
      const status = (r.bd_status ?? "").toLowerCase();
      if (status.includes("replied") || status.includes("conversation") || status.includes("lead") || status.includes("placed")) s.replied += 1;
      if (status.includes("lead") || status.includes("placed")) s.lead += 1;
      if (status.includes("placed") || status.includes("won")) s.won += 1;
      byVariant.set(v, s);
    }
    return Array.from(byVariant.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

  if (stats.length === 0) return null;

  const pct = (n: number, d: number) => d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="text-[13px] font-semibold">Message variant performance</h2>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <TableHead>Variant</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Replied</TableHead>
              <TableHead className="text-right">Reply rate</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Lead rate</TableHead>
              <TableHead className="text-right">Won</TableHead>
              <TableHead className="text-right">Win rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map(([v, s]) => (
              <TableRow key={v} className="text-[12px]">
                <TableCell className="font-medium">{v}</TableCell>
                <TableCell className="text-right">{s.total}</TableCell>
                <TableCell className="text-right">{s.replied}</TableCell>
                <TableCell className="text-right">{pct(s.replied, s.total)}</TableCell>
                <TableCell className="text-right">{s.lead}</TableCell>
                <TableCell className="text-right">{pct(s.lead, s.total)}</TableCell>
                <TableCell className="text-right">{s.won}</TableCell>
                <TableCell className="text-right">{pct(s.won, s.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/* ---------- page ---------- */

type SortKey =
  | "name" | "company" | "source" | "bd_message_variant"
  | "bd_date_first_contacted" | "bd_status" | "bd_last_touch_date"
  | "days_since" | "bd_next_followup_date" | "touchpoints" | "last_medium";

export default function BDContactTracker() {
  const { data: rows = [], isLoading } = useBDRows();
  const { data: tpData } = useTouchpoints();
  const update = useUpdateRow();
  const logTp = useLogTouchpoint();

  const tpFor = (r: Row): TouchpointStats => {
    const map = r.kind === "candidate" ? tpData?.candidate : tpData?.contact;
    return map?.get(r.id) ?? { count: 0, lastMedium: null, lastAt: null };
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [variantFilter, setVariantFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<"all" | "due" | "this_week" | "overdue">("all");
  const [sortKey, setSortKey] = useState<SortKey>("bd_last_touch_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const variants = useMemo(
    () => Array.from(new Set(rows.map((r) => r.bd_message_variant).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date();
    const in7 = new Date(); in7.setDate(today.getDate() + 7);

    let list = rows.filter((r) => {
      if (q) {
        const hay = [r.name, r.company, r.title, r.bd_trigger_notes, r.bd_conversation_notes, r.bd_outcome]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all" && r.bd_status !== statusFilter) return false;
      if (variantFilter !== "all" && r.bd_message_variant !== variantFilter) return false;
      if (dueFilter !== "all") {
        const nf = r.bd_next_followup_date ? parseISO(r.bd_next_followup_date) : null;
        if (!nf) return false;
        if (dueFilter === "overdue" && nf > today) return false;
        if (dueFilter === "due" && nf > today) return false;
        if (dueFilter === "this_week" && (nf < today || nf > in7)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      let va: any; let vb: any;
      if (sortKey === "days_since") {
        va = daysSince(a.bd_last_touch_date) ?? 99999;
        vb = daysSince(b.bd_last_touch_date) ?? 99999;
      } else if (sortKey === "touchpoints") {
        va = tpFor(a).count; vb = tpFor(b).count;
      } else if (sortKey === "last_medium") {
        va = tpFor(a).lastMedium; vb = tpFor(b).lastMedium;
      } else {
        va = (a as any)[sortKey]; vb = (b as any)[sortKey];
      }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    return list;
  }, [rows, search, statusFilter, variantFilter, dueFilter, sortKey, sortDir, tpData]);

  const overdueCount = rows.filter((r) => isOverdue(r.bd_next_followup_date)).length;

  const sortBtn = (key: SortKey, label: string) => (
    <button
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => {
        if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir("desc"); }
      }}
    >
      {label} <ArrowUpDown className="h-3 w-3 opacity-50" />
    </button>
  );

  return (
    <div className="p-6 space-y-5 max-w-[1800px]">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">BD Contact Tracker</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Every candidate and contact with BD tracking. Live, sortable and editable — changes update the underlying record.
        </p>
      </div>

      <VariantSummary rows={rows} />

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, notes…"
            className="pl-8 h-9"
          />
        </div>
        <Select value={dueFilter} onValueChange={(v: any) => setDueFilter(v)}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All follow-ups</SelectItem>
            <SelectItem value="this_week">This week</SelectItem>
            <SelectItem value="due">Due / overdue</SelectItem>
            <SelectItem value="overdue">Overdue only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={variantFilter} onValueChange={setVariantFilter}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Variant" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All variants</SelectItem>
            {variants.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="ml-auto">
          {filtered.length} of {rows.length}
        </Badge>
        {overdueCount > 0 && (
          <Badge className="bg-red-500/15 text-red-500 border-red-500/20 hover:bg-red-500/20">
            {overdueCount} follow-ups due
          </Badge>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                <TableHead className="min-w-[160px]">{sortBtn("name", "Contact")}</TableHead>
                <TableHead className="min-w-[140px]">{sortBtn("company", "Company")}</TableHead>
                <TableHead className="min-w-[140px]">Title / Role</TableHead>
                <TableHead>LinkedIn</TableHead>
                <TableHead className="min-w-[130px]">{sortBtn("source", "Source")}</TableHead>
                <TableHead className="min-w-[150px]">{sortBtn("bd_message_variant", "Variant")}</TableHead>
                <TableHead className="min-w-[130px]">{sortBtn("bd_date_first_contacted", "First contact")}</TableHead>
                <TableHead className="min-w-[180px]">{sortBtn("bd_status", "Status")}</TableHead>
                <TableHead className="min-w-[130px]">{sortBtn("bd_last_touch_date", "Last touch")}</TableHead>
                <TableHead className="min-w-[80px] text-right">{sortBtn("days_since", "Days")}</TableHead>
                <TableHead className="min-w-[90px] text-right">{sortBtn("touchpoints", "Touches")}</TableHead>
                <TableHead className="min-w-[130px]">{sortBtn("last_medium", "Medium")}</TableHead>
                <TableHead className="min-w-[130px]">{sortBtn("bd_next_followup_date", "Next follow-up")}</TableHead>
                <TableHead className="min-w-[100px]">Due?</TableHead>
                <TableHead className="min-w-[200px]">Why Now / Signal</TableHead>
                <TableHead className="min-w-[220px]">Conversation notes</TableHead>
                <TableHead className="min-w-[160px]">Outcome / Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={17} className="text-center py-10 text-muted-foreground text-sm">Loading…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={17} className="text-center py-10 text-muted-foreground text-sm">
                  No BD contacts match your filters. Start populating BD fields on a candidate or contact to see them here.
                </TableCell></TableRow>
              )}
              {filtered.map((r) => {
                const days = daysSince(r.bd_last_touch_date);
                const overdue = isOverdue(r.bd_next_followup_date);
                const tp = tpFor(r);
                return (
                  <TableRow key={`${r.kind}-${r.id}`} className="text-[12px] align-top hover:bg-muted/30">
                    <TableCell>
                      <div className="font-medium text-foreground">{r.name}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{r.kind}</div>
                    </TableCell>
                    <TableCell>{r.company ?? <span className="text-muted-foreground/60">—</span>}</TableCell>
                    <TableCell>{r.title ?? <span className="text-muted-foreground/60">—</span>}</TableCell>
                    <TableCell>
                      {r.linkedin_url ? (
                        <a href={r.linkedin_url.startsWith("http") ? r.linkedin_url : `https://${r.linkedin_url}`}
                           target="_blank" rel="noreferrer"
                           className="inline-flex items-center gap-1 text-primary hover:underline">
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : <span className="text-muted-foreground/60">—</span>}
                    </TableCell>
                    <TableCell>
                      <TextEditor value={r.source} placeholder="Source"
                        onSave={(v) => update.mutate({ row: r, field: "source", value: v })} />
                    </TableCell>
                    <TableCell>
                      <TextEditor value={r.bd_message_variant} placeholder="e.g. A - Candidate-led"
                        onSave={(v) => update.mutate({ row: r, field: "bd_message_variant", value: v })} />
                    </TableCell>
                    <TableCell>
                      <DateEditor value={r.bd_date_first_contacted}
                        onSave={(v) => update.mutate({ row: r, field: "bd_date_first_contacted", value: v })} />
                    </TableCell>
                    <TableCell>
                      <StatusEditor value={r.bd_status}
                        onSave={(v) => update.mutate({ row: r, field: "bd_status", value: v })} />
                    </TableCell>
                    <TableCell>
                      <DateEditor value={r.bd_last_touch_date}
                        onSave={(v) => update.mutate({ row: r, field: "bd_last_touch_date", value: v })} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {days == null ? <span className="text-muted-foreground/60">—</span> :
                        <span className={days > 60 ? "text-amber-500" : ""}>{days}d</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        <span className={tp.count === 0 ? "text-muted-foreground/60" : "text-foreground"}>
                          {tp.count}
                        </span>
                        <LogTouchpoint row={r} onLog={(medium, when) => logTp.mutate({ row: r, medium, occurred_at: when })} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {tp.lastMedium ? (
                        <Badge variant="outline" className="gap-1 text-[11px]">
                          {mediumIcon(tp.lastMedium)}
                          {tp.lastMedium}
                        </Badge>
                      ) : <span className="text-muted-foreground/60">—</span>}
                    </TableCell>
                    <TableCell>
                      <DateEditor value={r.bd_next_followup_date}
                        onSave={(v) => update.mutate({ row: r, field: "bd_next_followup_date", value: v })} />
                    </TableCell>
                    <TableCell>
                      {r.bd_next_followup_date ? (
                        overdue ? (
                          <Badge className="bg-red-500/15 text-red-500 border-red-500/20 hover:bg-red-500/20">DUE</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">{fmtDate(r.bd_next_followup_date)}</Badge>
                        )
                      ) : <span className="text-muted-foreground/60">—</span>}
                    </TableCell>
                    <TableCell>
                      <TextEditor multiline value={r.bd_trigger_notes} placeholder="Trigger / signal"
                        onSave={(v) => update.mutate({ row: r, field: "bd_trigger_notes", value: v })} />
                    </TableCell>
                    <TableCell>
                      <TextEditor multiline value={r.bd_conversation_notes} placeholder="What was said"
                        onSave={(v) => update.mutate({ row: r, field: "bd_conversation_notes", value: v })} />
                    </TableCell>
                    <TableCell>
                      <TextEditor value={r.bd_outcome} placeholder="Outcome / fee"
                        onSave={(v) => update.mutate({ row: r, field: "bd_outcome", value: v })} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
