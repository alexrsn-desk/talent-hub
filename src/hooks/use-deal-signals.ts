import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Deal-risk & conversation signals.
 *
 * These are the signals that no workflow owns: a deal already in motion that
 * may slip (backup cover, offers gone quiet, long notice, counter-offer risk,
 * silence on a client with a live role), campaign replies waiting to be
 * actioned, and facts pulled verbatim out of call notes.
 *
 * Anything that Job Launch, Compare & Submit, Reactivation Campaign or
 * Who Do I Pitch already surfaces deliberately does NOT live here.
 */

export type DealSignalTone = "amber" | "green" | "red" | "yellow";

export type DealSignal = {
  id: string;
  title: string;
  sub?: string;
  signal?: string;
  action: string;
  href?: string;
  urgency: number;
  tone: DealSignalTone;
  logEntityType?: "candidate" | "client";
  logEntityId?: string;
  logEntityName?: string;
  kind?: "risk" | "conversation" | "grouped" | "opportunity";
  /** Label for the primary deep-link button, e.g. "Launch search". */
  ctaLabel?: string;
  sourceQuote?: string;
  sourceLabel?: string;
  /** When present, this row is a rolled-up pattern; items live in `children`. */
  children?: DealSignal[];
  groupCount?: number;
};

export type DealSignalThresholds = {
  offerColdDays: number;
  clientSilenceDays: number;
};

export const DEFAULT_THRESHOLDS: DealSignalThresholds = {
  offerColdDays: 4,
  clientSilenceDays: 14,
};

export type DealSignalsData = {
  items: DealSignal[];
};

const BACKUP_STAGES = new Set(["Shortlist"]);
const LATE_STAGES = new Set(["First Stage", "Second Stage", "Offer"]);

const daysSince = (iso?: string | null) =>
  !iso ? 9999 : Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

function parseNoticeWeeks(text?: string | null): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/immediate|none|^0\b/.test(t)) return 0;
  const w = t.match(/(\d+)\s*week/); if (w) return parseInt(w[1], 10);
  const m = t.match(/(\d+)\s*month/); if (m) return parseInt(m[1], 10) * 4;
  return null;
}

function snoozeKey(id: string) { return `desky.bw.snooze.${id}`; }
function isSnoozed(id: string): boolean {
  try {
    const v = localStorage.getItem(snoozeKey(id));
    if (!v) return false;
    const until = parseInt(v, 10);
    if (Number.isNaN(until)) return false;
    if (until > Date.now()) return true;
    localStorage.removeItem(snoozeKey(id));
  } catch {}
  return false;
}

function doneKey(id: string) { return `desky.bw.done.${id}`; }
function isDone(id: string): boolean {
  try {
    const v = localStorage.getItem(doneKey(id));
    if (!v) return false;
    const until = parseInt(v, 10);
    if (until > Date.now()) return true;
    localStorage.removeItem(doneKey(id));
  } catch {}
  return false;
}

const stripHidden = (arr: DealSignal[]) =>
  arr.filter((it) => !isSnoozed(it.id) && !isDone(it.id));

type GroupSpec = {
  idPrefix: string;
  key: string;
  title: (n: number) => string;
  action: (n: number) => string;
  signal?: string;
  tone: DealSignalTone;
  href?: string;
};

const GROUP_SPECS: GroupSpec[] = [
  {
    idPrefix: "cp-backup-",
    key: "group-cp-backup",
    tone: "amber", href: "/jobs",
    title: (n) => `Ensure all ${n} late-stage candidates have a backup on the shortlist`,
    action: (n) => `Add one backup for each of the ${n} finals`,
    signal: "Finals fall through ~30% of the time — a shortlist backup keeps each deal alive.",
  },
  {
    idPrefix: "cp-offercold-",
    key: "group-cp-offercold",
    tone: "amber", href: "/jobs",
    title: (n) => `Check in on ${n} offers that have gone quiet`,
    action: () => `Call each one today — not email`,
    signal: "Silence on an offer usually means something's happening — a quick call closes the gap.",
  },
  {
    idPrefix: "cp-notice-",
    key: "group-cp-notice",
    tone: "amber", href: "/jobs",
    title: (n) => `Prep counter-offer coverage for ${n} long-notice candidates`,
    action: () => `Schedule 2-week check-ins + send counter-offer prep notes`,
    signal: "Long notice periods are when counter-offers land — stay close.",
  },
];

function groupPatterns(items: DealSignal[]): DealSignal[] {
  const buckets = new Map<string, DealSignal[]>();
  const passthrough: DealSignal[] = [];

  for (const it of items) {
    const matched = GROUP_SPECS.find((g) => it.id.startsWith(g.idPrefix));
    if (!matched) { passthrough.push(it); continue; }
    const arr = buckets.get(matched.key) || [];
    arr.push(it);
    buckets.set(matched.key, arr);
  }

  const grouped: DealSignal[] = [...passthrough];
  for (const [key, arr] of buckets.entries()) {
    if (arr.length < 2) { grouped.push(...arr); continue; }
    const g = GROUP_SPECS.find((s) => s.key === key)!;
    const sorted = arr.slice().sort((a, b) => b.urgency - a.urgency);
    const groupUrgency = Math.max(40, Math.round(sorted[0].urgency * 0.75));
    grouped.push({
      id: g.key,
      title: g.title(arr.length),
      sub: `${arr.length} items · roll-up`,
      signal: g.signal,
      action: g.action(arr.length),
      href: g.href,
      urgency: groupUrgency,
      tone: g.tone,
      kind: "grouped",
      children: sorted,
      groupCount: arr.length,
    });
  }
  grouped.sort((a, b) => b.urgency - a.urgency);
  return grouped;
}

export function useDealSignals(
  viewUserId?: string | null,
  thresholds: DealSignalThresholds = DEFAULT_THRESHOLDS,
) {
  return useQuery({
    queryKey: ["deal-signals-v1", viewUserId || "me", thresholds],
    staleTime: 30_000,
    queryFn: async (): Promise<DealSignalsData> => {
      const [cjRes, jobsRes, clientsRes, candsRes, notesRes, jobTagsRes, candTagsRes, offersRes, signalsRes] =
        await Promise.all([
          supabase.from("candidate_jobs").select("id,candidate_id,job_id,stage,stage_changed_at,created_at,owner_user_id"),
          supabase.from("jobs").select("id,title,status,client_id,owner_user_id,clients(company_name,contact_name)"),
          supabase.from("clients").select("id,company_name,contact_name,status,last_activity_date,owner_user_id"),
          supabase.from("candidates").select("id,name,job_title,status,notice_period,owner_user_id"),
          supabase.from("notes").select("id,candidate_id,client_id,activity_type,content,created_at").order("created_at", { ascending: false }).limit(1500),
          supabase.from("job_tags").select("job_id,tag_definition_id"),
          supabase.from("candidate_tags").select("candidate_id,tag_definition_id"),
          supabase.from("offers" as any).select("id,candidate_id,job_id,counter_offer_risk,counter_offer_reasons,owner_user_id,status").limit(500),
          supabase.from("call_signals" as any)
            .select("id,note_id,signal_type,trigger_phrase,explanation,suggested_action,priority_score,status,created_at,notes!inner(candidate_id,client_id,owner_user_id)")
            .eq("signal_type", "Campaign Reply").eq("status", "unactioned")
            .order("created_at", { ascending: false }).limit(100),
        ]);

      const filterOwner = (rows: any[] | null) =>
        (rows || []).filter((r: any) => !viewUserId || r.owner_user_id === viewUserId);
      const cjs = filterOwner(cjRes.data as any);
      const jobs = filterOwner(jobsRes.data as any);
      const clients = filterOwner(clientsRes.data as any);
      const candidates = filterOwner(candsRes.data as any);
      const notes = notesRes.data || [];
      const offers = filterOwner(offersRes.data as any);

      const jobById = new Map(jobs.map((j: any) => [j.id, j]));
      const candById = new Map(candidates.map((c: any) => [c.id, c]));
      const clientById = new Map(clients.map((c: any) => [c.id, c]));
      const activeJobIds = new Set(jobs.filter((j: any) => j.status === "Active").map((j: any) => j.id));

      const lastClientNote = new Map<string, any>();
      const lastCandNote = new Map<string, any>();
      for (const n of notes as any[]) {
        if (n.client_id && !lastClientNote.has(n.client_id)) lastClientNote.set(n.client_id, n);
        if (n.candidate_id && !lastCandNote.has(n.candidate_id)) lastCandNote.set(n.candidate_id, n);
      }

      const cjsByJob = new Map<string, any[]>();
      for (const cj of cjs) {
        const arr = cjsByJob.get(cj.job_id) || [];
        arr.push(cj); cjsByJob.set(cj.job_id, arr);
      }

      const tagsByCand = new Map<string, Set<string>>();
      for (const ct of (candTagsRes.data || []) as any[]) {
        const s = tagsByCand.get(ct.candidate_id) || new Set<string>();
        s.add(ct.tag_definition_id); tagsByCand.set(ct.candidate_id, s);
      }
      const tagsByJob = new Map<string, Set<string>>();
      for (const jt of (jobTagsRes.data || []) as any[]) {
        const s = tagsByJob.get(jt.job_id) || new Set<string>();
        s.add(jt.tag_definition_id); tagsByJob.set(jt.job_id, s);
      }

      const findCandidateMatches = (job: any, exclude: Set<string>, limit = 3): string[] => {
        const out: string[] = [];
        const jt = tagsByJob.get(job.id);
        if (jt && jt.size) {
          for (const c of candidates as any[]) {
            if (exclude.has(c.id)) continue;
            if (c.status !== "Active" && c.status !== "Passive") continue;
            const ct = tagsByCand.get(c.id); if (!ct) continue;
            for (const t of jt) { if (ct.has(t)) { out.push(c.name); break; } }
            if (out.length >= limit) return out;
          }
        }
        if (out.length < limit) {
          const tokens = (job.title || "").toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
          for (const c of candidates as any[]) {
            if (exclude.has(c.id) || out.includes(c.name)) continue;
            if (c.status !== "Active" && c.status !== "Passive") continue;
            const jtitle = (c.job_title || "").toLowerCase();
            if (tokens.some((t: string) => jtitle.includes(t))) {
              out.push(c.name);
              if (out.length >= limit) break;
            }
          }
        }
        return out;
      };

      const items: DealSignal[] = [];

      // ── Deals in motion ────────────────────────────────────────────
      for (const cj of cjs) {
        if (!activeJobIds.has(cj.job_id)) continue;
        const job = jobById.get(cj.job_id) as any;
        const cand = candById.get(cj.candidate_id) as any;
        if (!job || !cand) continue;
        const company = job.clients?.company_name || "—";
        const stageDays = daysSince(cj.stage_changed_at || cj.created_at);

        // No backup behind a late-stage candidate
        if (LATE_STAGES.has(cj.stage)) {
          const others = cjsByJob.get(cj.job_id) || [];
          const hasBackup = others.some((o: any) => o.id !== cj.id && BACKUP_STAGES.has(o.stage));
          if (!hasBackup) {
            const exclude = new Set(others.map((o: any) => o.candidate_id));
            const matches = findCandidateMatches(job, exclude, 3);
            items.push({
              id: `cp-backup-${cj.id}`,
              tone: "amber", kind: "risk",
              title: `${cand.name} is at ${cj.stage} for ${job.title} at ${company}`,
              sub: matches.length ? `Candidates who match: ${matches.join(", ")}` : "No backup candidate exists",
              signal: "Finals fall through ~30% of the time. If this drops you start from scratch.",
              action: "Add one backup to shortlist now",
              href: `/jobs`,
              urgency: 250 + stageDays,
              logEntityType: "candidate",
              logEntityId: cand.id,
              logEntityName: cand.name,
            });
          }
        }

        // Offer gone quiet
        if (cj.stage === "Offer" && stageDays >= thresholds.offerColdDays) {
          items.push({
            id: `cp-offercold-${cj.id}`,
            tone: "amber", kind: "risk",
            title: `${cand.name} has had the offer ${stageDays} days`,
            sub: `${job.title} at ${company}`,
            signal: stageDays >= 5 ? "After 5 days counter-offer probability rises sharply" : "Silence on an offer means something is happening",
            action: "Call today — not email. Ask directly what is going on.",
            href: `/jobs`,
            urgency: 400 + stageDays,
            logEntityType: "candidate",
            logEntityId: cand.id,
            logEntityName: cand.name,
          });
        }

        // Long notice period prep
        if (cj.stage === "Offer") {
          const weeks = parseNoticeWeeks(cand.notice_period);
          if (weeks !== null && weeks >= 6) {
            const label = weeks >= 8 ? `${Math.round(weeks / 4)} month` : `${weeks} week`;
            items.push({
              id: `cp-notice-${cj.id}`,
              tone: "amber", kind: "risk",
              title: `${cand.name} has a ${label} notice period`,
              sub: `${job.title} at ${company}`,
              signal: "Counter offer risk is highest during long notice periods",
              action: "Schedule a 2-week-in check-in + send counter-offer prep notes",
              href: `/jobs`,
              urgency: 200 + weeks,
              logEntityType: "candidate",
              logEntityId: cand.id,
              logEntityName: cand.name,
            });
          }
        }

        // Counter-offer risk flagged on the offer record
        if (cj.stage === "Offer" || cj.stage === "Second Stage") {
          const off = offers.find((o: any) => o.candidate_id === cand.id && o.job_id === job.id);
          if (off && (off.counter_offer_risk === "high" || off.counter_offer_risk === "medium")) {
            items.push({
              id: `cp-co-${cj.id}`,
              tone: "red", kind: "risk",
              title: `Counter offer risk detected for ${cand.name} at ${company}`,
              sub: off.counter_offer_reasons ? `Signal: ${String(off.counter_offer_reasons).slice(0, 120)}` : `${job.title}`,
              signal: "This is your most fragile deal",
              action: "Call today — before they speak to their manager",
              href: `/jobs`,
              urgency: 900,
              logEntityType: "candidate",
              logEntityId: cand.id,
              logEntityName: cand.name,
            });
          }
        }
      }

      // ── Client with a live role who has gone quiet ────────────────
      const liveClientIds = new Set<string>();
      for (const j of jobs as any[]) if (j.status === "Active" && j.client_id) liveClientIds.add(j.client_id);
      for (const clientId of liveClientIds) {
        const client = clientById.get(clientId) as any; if (!client) continue;
        const d = daysSince(lastClientNote.get(clientId)?.created_at);
        if (d < thresholds.clientSilenceDays) continue;
        const company = client.company_name || "—";
        items.push({
          id: `cp-livesilence-${clientId}`,
          tone: "amber", kind: "risk",
          title: `${company} has an active role — you haven't spoken in ${d === 9999 ? "weeks" : `${d} days`}`,
          sub: `Silence from a client mid-process is a warning sign`,
          action: `Call ${client.contact_name || "contact"} today — proactive update before they chase you`,
          href: `/clients`,
          urgency: 220 + Math.min(d, 60),
          logEntityType: "client",
          logEntityId: clientId,
          logEntityName: company,
        });
      }

      // ── Campaign replies waiting to be actioned ───────────────────
      const replySignals = (signalsRes.data || []).filter(
        (s: any) => !viewUserId || s.notes?.owner_user_id === viewUserId,
      );
      for (const sig of replySignals as any[]) {
        const candId = sig.notes?.candidate_id;
        const cand = candId ? (candById.get(candId) as any) : null;
        const name = cand?.name || "Candidate";
        const score = sig.priority_score || 5;
        const daysAgo = daysSince(sig.created_at);
        const tone: DealSignalTone = score >= 7 ? "amber" : score >= 4 ? "green" : "yellow";
        items.push({
          id: `reply-${sig.id}`,
          tone, kind: "risk",
          title: `${name} replied to your campaign${daysAgo > 0 ? ` · ${daysAgo}d ago` : " · today"}`,
          sub: sig.trigger_phrase ? `"${String(sig.trigger_phrase).slice(0, 120)}"` : sig.explanation,
          signal: sig.explanation,
          action: sig.suggested_action || `Review ${name}'s reply and assess fit`,
          href: candId ? `/candidates` : undefined,
          urgency: (score >= 7 ? 700 : score >= 4 ? 450 : 200) - daysAgo * 5,
          logEntityType: candId ? "candidate" : undefined,
          logEntityId: candId || undefined,
          logEntityName: name,
        });
      }

      // ── Facts pulled out of call notes ────────────────────────────
      try {
        const sinceIso = new Date(Date.now() - 21 * 86400000).toISOString();
        const { data: convEvents } = await supabase
          .from("activity_events")
          .select("id,candidate_id,event_type,source,occurred_at,payload,owner_user_id")
          .eq("source", "granola")
          .gte("occurred_at", sinceIso)
          .order("occurred_at", { ascending: false })
          .limit(200);
        const events = (convEvents || []).filter((e: any) => !viewUserId || e.owner_user_id === viewUserId);

        const extractText = (p: any): string => {
          if (!p) return "";
          if (typeof p === "string") return p;
          return [p.transcript, p.notes, p.summary, p.text, p.content, p.body]
            .filter((v) => typeof v === "string").join("\n");
        };
        const sentenceOf = (text: string, idx: number): string => {
          const start = Math.max(0, text.lastIndexOf(".", idx - 1) + 1);
          const endDot = text.indexOf(".", idx);
          const end = endDot === -1 ? Math.min(text.length, idx + 180) : endDot + 1;
          return text.slice(start, end).trim().replace(/\s+/g, " ").slice(0, 220);
        };

        const patterns: Array<{
          re: RegExp;
          build: (m: RegExpExecArray, candName: string, quote: string) =>
            Omit<DealSignal, "id" | "urgency" | "tone" | "kind"> | null;
          tag: "bd_lead" | "intel";
        }> = [
          {
            tag: "bd_lead",
            re: /\b(?:interview(?:ing|ed)?|final(?:s)?)\s+(?:with|at)\s+([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})/g,
            build: (m, candName, quote) => ({
              title: `${candName} mentioned interviewing at ${m[1]} — check for BD opportunity`,
              sub: `Potential BD lead: ${m[1]}`,
              signal: `"${quote}"`,
              action: `Add ${m[1]} as a lead + reach out`,
              href: `/clients`,
              sourceLabel: "From call notes",
              sourceQuote: quote,
            }),
          },
          {
            tag: "bd_lead",
            re: /\boffer\s+from\s+([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})/g,
            build: (m, candName, quote) => ({
              title: `${candName} has a competing offer from ${m[1]}`,
              sub: `BD lead + counter-offer risk`,
              signal: `"${quote}"`,
              action: `Add ${m[1]} as a lead + protect the deal`,
              href: `/clients`,
              sourceLabel: "From call notes",
              sourceQuote: quote,
            }),
          },
          {
            tag: "intel",
            re: /\bleaving\s+(?:because|due to|as)\s+([^.!?\n]{8,140})/gi,
            build: (m, candName, quote) => ({
              title: `Market intel from ${candName}: reason for leaving`,
              sub: (m[1] || "").trim().slice(0, 120),
              signal: `"${quote}"`,
              action: "Feed into Weekly Intel",
              href: `/weekly-intel`,
              sourceLabel: "From call notes",
              sourceQuote: quote,
            }),
          },
          {
            tag: "intel",
            re: /\bcounter[-\s]?offer(?:ed|ing)?\b/gi,
            build: (_m, candName, quote) => ({
              title: `${candName} mentioned a counter-offer — market intel`,
              sub: `Competitor retention behaviour`,
              signal: `"${quote}"`,
              action: "Log to Weekly Intel + assess risk",
              href: `/weekly-intel`,
              sourceLabel: "From call notes",
              sourceQuote: quote,
            }),
          },
        ];

        const convEmitted = new Set<string>();
        for (const ev of events as any[]) {
          const text = extractText(ev.payload);
          if (!text || text.length < 20) continue;
          const cand = ev.candidate_id ? (candById.get(ev.candidate_id) as any) : null;
          const candName = cand?.name || "Candidate";
          const daysAgo = daysSince(ev.occurred_at);
          for (const pat of patterns) {
            pat.re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = pat.re.exec(text)) !== null) {
              const dedupeKey = `${ev.candidate_id || ev.id}-${pat.tag}-${(m[1] || m[0]).toLowerCase().slice(0, 40)}`;
              if (convEmitted.has(dedupeKey)) continue;
              convEmitted.add(dedupeKey);
              const quote = sentenceOf(text, m.index);
              const built = pat.build(m, candName, quote);
              if (!built) continue;
              items.push({
                id: `conv-${ev.id}-${pat.tag}-${convEmitted.size}`,
                tone: pat.tag === "bd_lead" ? "green" : "yellow",
                kind: "conversation",
                urgency: (pat.tag === "bd_lead" ? 780 : 620) - daysAgo * 8,
                logEntityType: cand ? "candidate" : undefined,
                logEntityId: cand ? ev.candidate_id : undefined,
                logEntityName: cand ? candName : undefined,
                ...built,
              });
              if (convEmitted.size >= 20) break;
            }
            if (convEmitted.size >= 20) break;
          }
          if (convEmitted.size >= 20) break;
        }
      } catch {
        // Call-note ingestion not yet active — expected, skip quietly.
      }

      const grouped = groupPatterns(stripHidden(items));
      return { items: grouped.slice(0, 40) };
    },
  });
}

export function snoozeItem(id: string, days: 1 | 3 | 7) {
  try {
    localStorage.setItem(`desky.bw.snooze.${id}`, String(Date.now() + days * 86400000));
  } catch {}
}

export function markItemDone(id: string) {
  try {
    localStorage.setItem(`desky.bw.done.${id}`, String(Date.now() + 86400000));
  } catch {}
}

const THRESHOLD_KEY = "desky.bw.thresholds";
export function loadThresholds(): DealSignalThresholds {
  try {
    const raw = localStorage.getItem(THRESHOLD_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch { return DEFAULT_THRESHOLDS; }
}
export function saveThresholds(t: DealSignalThresholds) {
  try { localStorage.setItem(THRESHOLD_KEY, JSON.stringify(t)); } catch {}
}
