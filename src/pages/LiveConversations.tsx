import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Mail, MessageCircle, Globe, FileText, Smartphone, Users, ExternalLink, Briefcase, Plus, MessageSquare } from "lucide-react";
import { useLiveConversations, type LiveCandidateRow, type LiveContactRow } from "@/hooks/use-live-conversations";
import { LogTouchpointModal } from "@/components/LogTouchpointModal";

const activityIcon: Record<string, typeof FileText> = {
  Note: FileText,
  Call: Phone,
  Email: Mail,
  "Text Message": Smartphone,
  WhatsApp: MessageCircle,
  Meeting: Users,
  "LinkedIn Message": Globe,
  "Follow-up": MessageSquare,
};

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function followUpClasses(date: string | null): { label: string; color: string } {
  if (!date) return { label: "No follow-up set", color: "text-muted-foreground" };
  const today = new Date().toISOString().split("T")[0];
  const in1 = new Date(); in1.setDate(in1.getDate() + 1);
  const in1s = in1.toISOString().split("T")[0];
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const in7s = in7.toISOString().split("T")[0];
  const d = new Date(date);
  const label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (date < today) return { label: `Overdue · ${label}`, color: "text-red-400" };
  if (date <= in1s) return { label, color: "text-amber-400" };
  if (date <= in7s) return { label, color: "text-emerald-400" };
  return { label, color: "text-muted-foreground" };
}

type TouchpointTarget = { entityType: "candidate" | "client"; id: string; name: string } | null;

export default function LiveConversations() {
  const [timeframe, setTimeframe] = useState<number>(30);
  const [show, setShow] = useState<"all" | "candidates" | "contacts">("all");
  const [hasFollowUp, setHasFollowUp] = useState<"all" | "yes" | "no">("all");
  const [sort, setSort] = useState<"followup" | "recent" | "oldest" | "company">("followup");
  const [tp, setTp] = useState<TouchpointTarget>(null);
  const navigate = useNavigate();

  const { data, isLoading } = useLiveConversations(timeframe);

  const candidates = useMemo(() => {
    if (!data) return [];
    let rows = [...data.candidates];
    if (hasFollowUp === "yes") rows = rows.filter((r) => !!r.next_follow_up);
    if (hasFollowUp === "no") rows = rows.filter((r) => !r.next_follow_up);
    return sortRows(rows, sort);
  }, [data, hasFollowUp, sort]);

  const clients = useMemo(() => {
    if (!data) return [];
    let rows = [...data.clients];
    if (hasFollowUp === "yes") rows = rows.filter((r) => !!r.next_follow_up);
    if (hasFollowUp === "no") rows = rows.filter((r) => !r.next_follow_up);
    return sortRows(rows, sort);
  }, [data, hasFollowUp, sort]);

  const showCandidates = show !== "contacts";
  const showContacts = show !== "candidates";
  const totalShown = (showCandidates ? candidates.length : 0) + (showContacts ? clients.length : 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Live Conversations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          People you're actively in dialogue with — recent touchpoints, follow-ups, and BD signals.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Select value={show} onValueChange={(v: any) => setShow(v)}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="candidates">Candidates only</SelectItem>
            <SelectItem value="contacts">Contacts only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(timeframe)} onValueChange={(v) => setTimeframe(Number(v))}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={hasFollowUp} onValueChange={(v: any) => setHasFollowUp(v)}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Follow-up: All</SelectItem>
            <SelectItem value="yes">Has follow-up</SelectItem>
            <SelectItem value="no">No follow-up</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v: any) => setSort(v)}>
          <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="followup">Sort: Follow-up date</SelectItem>
            <SelectItem value="recent">Most recently contacted</SelectItem>
            <SelectItem value="oldest">Longest since contact</SelectItem>
            <SelectItem value="company">By company name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : totalShown === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No recent conversations. Log a touchpoint on any candidate or contact to see them here.
        </div>
      ) : (
        <>
          {showCandidates && (
            <section className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Candidates</h2>
                <span className="text-xs text-muted-foreground">({candidates.length})</span>
              </div>
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active candidate conversations.</p>
              ) : (
                <div className="space-y-2">
                  {candidates.map((r) => (
                    <CandidateRow key={r.id} row={r} onLog={() => setTp({ entityType: "candidate", id: r.id, name: r.name })} onView={() => navigate(`/candidates?id=${r.id}`)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {showContacts && (
            <section className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Clients and Contacts</h2>
                <span className="text-xs text-muted-foreground">({clients.length})</span>
              </div>
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active client/contact conversations.</p>
              ) : (
                <div className="space-y-2">
                  {clients.map((r) => (
                    <ClientRow key={r.id} row={r} onLog={() => setTp({ entityType: "client", id: r.id, name: r.contact_name || r.company_name })} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {tp && (
        <LogTouchpointModal
          open={!!tp}
          onOpenChange={(o) => { if (!o) setTp(null); }}
          entityType={tp.entityType}
          entityId={tp.id}
          entityName={tp.name}
        />
      )}
    </div>
  );
}

function sortRows<T extends LiveCandidateRow | LiveContactRow>(rows: T[], sort: string): T[] {
  const arr = [...rows];
  if (sort === "followup") {
    const today = new Date().toISOString().split("T")[0];
    arr.sort((a, b) => {
      const ad = a.next_follow_up, bd = b.next_follow_up;
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      const ao = ad < today, bo = bd < today;
      if (ao && !bo) return -1;
      if (!ao && bo) return 1;
      return ad.localeCompare(bd);
    });
  } else if (sort === "recent") {
    arr.sort((a, b) => (b.last_touchpoint?.date || "").localeCompare(a.last_touchpoint?.date || ""));
  } else if (sort === "oldest") {
    arr.sort((a, b) => (a.last_touchpoint?.date || "").localeCompare(b.last_touchpoint?.date || ""));
  } else if (sort === "company") {
    arr.sort((a, b) => {
      const an = a.kind === "candidate" ? (a.current_employer || "") : a.company_name;
      const bn = b.kind === "candidate" ? (b.current_employer || "") : b.company_name;
      return an.localeCompare(bn);
    });
  }
  return arr;
}

function TouchpointLine({ tp }: { tp: { type: string; date: string; content: string } | null }) {
  if (!tp) return <p className="text-xs text-muted-foreground">No recent touchpoint logged</p>;
  const Icon = activityIcon[tp.type] || FileText;
  return (
    <div className="text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        <span>{tp.type} {relativeDate(tp.date)}</span>
      </div>
      <p className="mt-0.5 line-clamp-1 text-foreground/80">{tp.content}</p>
    </div>
  );
}

function CandidateRow({ row, onLog, onView }: { row: LiveCandidateRow; onLog: () => void; onView: () => void }) {
  const fu = followUpClasses(row.next_follow_up);
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex items-start gap-3">
      <div className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
        {initials(row.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{row.name}</span>
          {row.job_title && <span className="text-xs text-muted-foreground">· {row.job_title}</span>}
          {row.current_employer && <span className="text-xs text-muted-foreground">@ {row.current_employer}</span>}
          <Badge variant="outline" className="text-[10px] py-0">{row.status}</Badge>
        </div>
        <div className="mt-1">
          <TouchpointLine tp={row.last_touchpoint} />
        </div>
        <div className={`text-xs mt-1 ${fu.color}`}>Next: {fu.label}</div>
      </div>
      <div className="flex flex-col sm:flex-row gap-1 shrink-0">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onLog}><Plus className="h-3 w-3 mr-1" />Log</Button>
        {row.phone && (
          <Button asChild size="sm" variant="outline" className="h-8 text-xs">
            <a href={`tel:${row.phone}`}><Phone className="h-3 w-3 mr-1" />Call</a>
          </Button>
        )}
        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
          <Link to={`/jobs?candidate=${row.id}`}><Briefcase className="h-3 w-3 mr-1" />Add to job</Link>
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onView}><ExternalLink className="h-3 w-3 mr-1" />View</Button>
      </div>
    </div>
  );
}

function ClientRow({ row, onLog }: { row: LiveContactRow; onLog: () => void }) {
  const fu = followUpClasses(row.next_follow_up);
  const heatColor = row.heat === "hot" ? "text-red-400" : row.heat === "warm" ? "text-amber-400" : row.heat === "cold" ? "text-blue-400" : "text-muted-foreground";
  const heatIcon = row.heat === "hot" ? "🔥" : row.heat === "warm" ? "🌤" : row.heat === "cold" ? "❄️" : "";
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex items-start gap-3">
      <div className="h-9 w-9 rounded-md bg-secondary text-foreground flex items-center justify-center text-xs font-semibold shrink-0">
        {initials(row.contact_name || row.company_name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{row.contact_name || row.company_name}</span>
          {row.contact_name && <span className="text-xs text-muted-foreground">@ {row.company_name}</span>}
          {row.job_title && <span className="text-xs text-muted-foreground">· {row.job_title}</span>}
          {row.bd_stage && <Badge variant="outline" className="text-[10px] py-0">{row.bd_stage}</Badge>}
          {heatIcon && <span className={`text-xs ${heatColor}`}>{heatIcon}</span>}
        </div>
        <div className="mt-1">
          <TouchpointLine tp={row.last_touchpoint} />
        </div>
        <div className={`text-xs mt-1 ${fu.color}`}>Next: {fu.label}</div>
      </div>
      <div className="flex flex-col sm:flex-row gap-1 shrink-0">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onLog}><Plus className="h-3 w-3 mr-1" />Log</Button>
        {row.phone && (
          <Button asChild size="sm" variant="outline" className="h-8 text-xs">
            <a href={`tel:${row.phone}`}><Phone className="h-3 w-3 mr-1" />Call</a>
          </Button>
        )}
        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
          <Link to={`/bd-pipeline?client=${row.id}`}>BD card</Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
          <Link to={`/clients?id=${row.id}`}><ExternalLink className="h-3 w-3 mr-1" />View</Link>
        </Button>
      </div>
    </div>
  );
}
