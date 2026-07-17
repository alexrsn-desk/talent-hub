import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BillerTone = "amber" | "green" | "red" | "yellow";

export type PipelineGapMatch = {
  candidateId: string;
  name: string;
  reason: string;
};

export type PipelineGapData = {
  jobId: string;
  jobTitle: string;
  company: string;
  clientId?: string;
  currentCount: number;
  weeksOpen: number;
  daysSinceLastAdd: number;
  sourcingTarget: number;
  escalated: boolean;
  promptShownDays: number;
  readyNow: PipelineGapMatch[];
  silverMedallists: PipelineGapMatch[];
  coldPoolCount: number;
  keyCriteria: string[];
  linkedinSearch: string;
};

export type BillerItem = {
  id: string;
  title: string;
  sub?: string;
  signal?: string;
  action: string;
  href?: string;
  urgency: number;
  tone: BillerTone;
  section: "close" | "feed";
  logEntityType?: "candidate" | "client";
  logEntityId?: string;
  logEntityName?: string;
  bdTarget?: boolean;
  pipelineGap?: PipelineGapData;
  kind?: "derived" | "conversation";
  sourceQuote?: string;
  sourceLabel?: string;
};

export type BillerThresholds = {
  critical: number;       // < this on a live role → red
  warning: number;        // < this → amber
  caution: number;        // < this → yellow
  bdInactivityDays: number;
  offerColdDays: number;
  clientSilenceDays: number;
  placedClientDays: number;
  placedCandidateDays: number;
  warmProspectDays: number;
};

export const DEFAULT_THRESHOLDS: BillerThresholds = {
  critical: 1, // active job with 0 candidates is critical (< 1)
  warning: 2,
  caution: 3,
  bdInactivityDays: 3,
  offerColdDays: 4,
  clientSilenceDays: 7,
  placedClientDays: 60,
  placedCandidateDays: 90,
  warmProspectDays: 42,
};

export type BillersWorkflowData = {
  closeProtect: BillerItem[];
  feedTheBeast: BillerItem[];
  bdSilenceDays: number;
  recentPlacement: { name: string; company: string; daysAgo: number } | null;
  navinMode: boolean;
  totalActiveJobs: number;
  totalActiveDeals: number;
  dailyBdTargets: BillerItem[]; // up to 3
};

const BACKUP_STAGES = new Set(["Screening", "Shortlist"]);
const LATE_STAGES = new Set(["First Interview", "Second Interview", "Offer"]);
const SUBMITTED_STAGES = new Set(["Submitted", "Client Review"]);
const ACTIVE_STAGES = ["Longlist","Contact","Screening","Shortlist","Submitted","Client Review","First Interview","Second Interview","Offer"];
const BD_TYPES = new Set(["Call", "Email", "LinkedIn Message", "Meeting", "Text Message", "WhatsApp"]);

const daysSince = (iso?: string | null) => !iso ? 9999 : Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

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

const stripHidden = (arr: BillerItem[]) =>
  arr.filter((it) => !isSnoozed(it.id) && !isDone(it.id));

export function useBillersWorkflow(viewUserId?: string | null, thresholds: BillerThresholds = DEFAULT_THRESHOLDS) {
  return useQuery({
    queryKey: ["billers-workflow-v3", viewUserId || "me", thresholds],
    staleTime: 30_000,
    queryFn: async (): Promise<BillersWorkflowData> => {
      const [cjRes, jobsRes, clientsRes, candsRes, notesRes, jobTagsRes, candTagsRes, tagDefsRes, poolsRes, poolMembersRes, placementsRes, offersRes, signalsRes] = await Promise.all([
        supabase.from("candidate_jobs").select("id,candidate_id,job_id,stage,stage_changed_at,created_at,owner_user_id"),
        supabase.from("jobs").select("id,title,status,client_id,owner_user_id,date_opened,created_at,location,search_launched_at,clients(company_name,contact_name)"),
        supabase.from("clients").select("id,company_name,contact_name,status,heat,last_activity_date,owner_user_id"),
        supabase.from("candidates").select("id,name,job_title,status,notice_period,owner_user_id"),
        supabase.from("notes").select("id,candidate_id,client_id,activity_type,content,created_at").order("created_at",{ ascending: false }).limit(1500),
        supabase.from("job_tags").select("job_id,tag_definition_id"),
        supabase.from("candidate_tags").select("candidate_id,tag_definition_id"),
        supabase.from("tag_definitions" as any).select("id,label"),
        supabase.from("talent_pools" as any).select("id,name,description,target_size,warning_threshold_days,owner_user_id"),
        supabase.from("candidate_talent_pools" as any).select("candidate_id,pool_id,owner_user_id,added_at"),
        supabase.from("placements" as any).select("id,candidate_id,client_id,job_id,candidate_name_snapshot,client_name_snapshot,job_title_snapshot,offer_accepted_date,start_date,status,owner_user_id"),
        supabase.from("offers" as any).select("id,candidate_id,job_id,counter_offer_risk,counter_offer_reasons,owner_user_id,status").limit(500),
        supabase.from("call_signals" as any).select("id,note_id,signal_type,trigger_phrase,explanation,suggested_action,priority_score,status,created_at,notes!inner(candidate_id,client_id,owner_user_id)").eq("signal_type","Campaign Reply").eq("status","unactioned").order("created_at",{ ascending: false }).limit(100),
      ]);

      const filterOwner = (rows: any[] | null) => (rows || []).filter((r: any) => !viewUserId || r.owner_user_id === viewUserId);
      const cjs = filterOwner(cjRes.data as any);
      const jobs = filterOwner(jobsRes.data as any);
      const clients = filterOwner(clientsRes.data as any);
      const candidates = filterOwner(candsRes.data as any);
      const notes = notesRes.data || [];
      const jobTags = jobTagsRes.data || [];
      const candTags = candTagsRes.data || [];
      const pools = filterOwner(poolsRes.data as any);
      const poolMembers = filterOwner(poolMembersRes.data as any);
      const placements = filterOwner(placementsRes.data as any);
      const offers = filterOwner(offersRes.data as any);
      const tagDefs = (tagDefsRes.data || []) as any[];
      const tagNameById = new Map<string, string>();
      for (const t of tagDefs) tagNameById.set(t.id, (t as any).label);

      const jobById = new Map(jobs.map((j: any) => [j.id, j]));
      const candById = new Map(candidates.map((c: any) => [c.id, c]));
      const clientById = new Map(clients.map((c: any) => [c.id, c]));
      const activeJobIds = new Set(jobs.filter((j: any) => j.status === "Active").map((j: any) => j.id));

      const lastClientNote = new Map<string, any>();
      const lastCandNote = new Map<string, any>();
      for (const n of notes) {
        if (n.client_id && !lastClientNote.has(n.client_id)) lastClientNote.set(n.client_id, n);
        if (n.candidate_id && !lastCandNote.has(n.candidate_id)) lastCandNote.set(n.candidate_id, n);
      }

      const cjsByJob = new Map<string, any[]>();
      for (const cj of cjs) {
        const arr = cjsByJob.get(cj.job_id) || [];
        arr.push(cj); cjsByJob.set(cj.job_id, arr);
      }

      const tagsByCand = new Map<string, Set<string>>();
      for (const ct of candTags as any[]) {
        const s = tagsByCand.get(ct.candidate_id) || new Set();
        s.add(ct.tag_definition_id); tagsByCand.set(ct.candidate_id, s);
      }
      const tagsByJob = new Map<string, Set<string>>();
      for (const jt of jobTags as any[]) {
        const s = tagsByJob.get(jt.job_id) || new Set();
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

      // ============================================================
      // CLOSE & PROTECT
      // ============================================================
      const closeProtect: BillerItem[] = [];

      // TRIGGER 1 — LIVE ROLE PIPELINE THIN/EMPTY (two-step: Send Now → Proactive Sourcing)
      const poolMembersByCand = new Map<string, any[]>();
      for (const m of poolMembers as any[]) {
        const arr = poolMembersByCand.get(m.candidate_id) || [];
        arr.push(m); poolMembersByCand.set(m.candidate_id, arr);
      }
      const poolById = new Map((pools as any[]).map((p) => [p.id, p]));

      const buildReadyNow = (job: any, exclude: Set<string>, limit = 5): PipelineGapMatch[] => {
        const out: PipelineGapMatch[] = [];
        const seen = new Set<string>();
        const jt = tagsByJob.get(job.id);
        const jobTagNames = jt ? Array.from(jt).map((id) => tagNameById.get(id)).filter(Boolean) as string[] : [];
        const tokens = (job.title || "").toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);

        const push = (c: any, reason: string) => {
          if (seen.has(c.id) || exclude.has(c.id)) return;
          if (c.status !== "Active" && c.status !== "Passive") return;
          seen.add(c.id);
          out.push({ candidateId: c.id, name: c.name, reason });
        };

        // 1) Recently spoken (last 30d) matching by tag or title token
        for (const c of candidates as any[]) {
          if (out.length >= limit) break;
          const ln = lastCandNote.get(c.id);
          if (!ln) continue;
          const d = daysSince(ln.created_at);
          if (d > 30) continue;
          const ct = tagsByCand.get(c.id);
          let matchedTag: string | null = null;
          if (jt && ct) for (const t of jt) if (ct.has(t)) { matchedTag = tagNameById.get(t) || null; break; }
          const titleHit = tokens.some((t: string) => (c.job_title || "").toLowerCase().includes(t));
          if (matchedTag) push(c, `Spoken ${d}d ago · ${matchedTag}`);
          else if (titleHit) push(c, `Spoken ${d}d ago · title match`);
        }
        // 2) Tag overlap
        if (jt && jt.size) {
          for (const c of candidates as any[]) {
            if (out.length >= limit) break;
            const ct = tagsByCand.get(c.id); if (!ct) continue;
            const hits: string[] = [];
            for (const t of jt) if (ct.has(t)) { const n = tagNameById.get(t); if (n) hits.push(n); }
            if (hits.length) push(c, `Matches: ${hits.slice(0,3).join(", ")}`);
          }
        }
        // 3) In a talent pool whose tag matches role
        for (const c of candidates as any[]) {
          if (out.length >= limit) break;
          const pm = poolMembersByCand.get(c.id);
          if (!pm || !pm.length) continue;
          const pool = poolById.get(pm[0].pool_id) as any;
          if (!pool) continue;
          const ct = tagsByCand.get(c.id);
          let share = false;
          if (jt && ct) for (const t of jt) if (ct.has(t)) { share = true; break; }
          if (!share) share = tokens.some((t: string) => (c.job_title || "").toLowerCase().includes(t));
          if (share) push(c, `Talent pool: ${pool.name}`);
        }
        // 4) Title-token fallback
        for (const c of candidates as any[]) {
          if (out.length >= limit) break;
          const jtitle = (c.job_title || "").toLowerCase();
          if (tokens.some((t: string) => jtitle.includes(t))) push(c, `Title match: ${c.job_title || "—"}`);
        }
        return out;
      };

      // silver medallists: interviewed at any client in last 6mo, not on this job, still available
      const findSilverForJob = (job: any, exclude: Set<string>, limit = 3): PipelineGapMatch[] => {
        const out: PipelineGapMatch[] = [];
        const seen = new Set<string>();
        const jt = tagsByJob.get(job.id);
        const tokens = (job.title || "").toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
        for (const cj of cjs) {
          if (out.length >= limit) break;
          if (!["First Interview","Second Interview","Offer"].includes(cj.stage)) continue;
          if (daysSince(cj.stage_changed_at || cj.created_at) > 180) continue;
          const cand = candById.get(cj.candidate_id) as any; if (!cand) continue;
          if (exclude.has(cand.id) || seen.has(cand.id)) continue;
          if (cand.status !== "Active" && cand.status !== "Passive") continue;
          const ct = tagsByCand.get(cand.id);
          let share = false;
          if (jt && ct) for (const t of jt) if (ct.has(t)) { share = true; break; }
          if (!share) share = tokens.some((t: string) => (cand.job_title || "").toLowerCase().includes(t));
          if (!share) continue;
          const otherJob = jobById.get(cj.job_id) as any;
          const otherCompany = otherJob?.clients?.company_name || "—";
          const weeks = Math.max(1, Math.round(daysSince(cj.stage_changed_at || cj.created_at) / 7));
          seen.add(cand.id);
          out.push({ candidateId: cand.id, name: cand.name, reason: `Interviewed at ${otherCompany} ${weeks}w ago` });
        }
        return out;
      };

      const coldCountForJob = (job: any): number => {
        const jt = tagsByJob.get(job.id);
        const tokens = (job.title || "").toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
        let n = 0;
        for (const c of candidates as any[]) {
          if (c.status !== "Active" && c.status !== "Passive") continue;
          const ln = lastCandNote.get(c.id);
          const d = daysSince(ln?.created_at);
          if (d < 56) continue;
          const ct = tagsByCand.get(c.id);
          let share = false;
          if (jt && ct) for (const t of jt) if (ct.has(t)) { share = true; break; }
          if (!share) share = tokens.some((t: string) => (c.job_title || "").toLowerCase().includes(t));
          if (share) n++;
        }
        return n;
      };

      const buildLinkedInSearch = (job: any, criteria: string[]): string => {
        const title = `"${(job.title || "").trim()}"`;
        const skills = criteria.slice(0, 4).filter((c) => !!c).map((c) => `"${c}"`);
        const skillsPart = skills.length ? ` AND (${skills.join(" OR ")})` : "";
        const locPart = job.location ? ` AND "${job.location}"` : "";
        return `${title}${skillsPart}${locPart}`;
      };

      for (const job of jobs as any[]) {
        if (job.status !== "Active") continue;
        const active = (cjsByJob.get(job.id) || []).filter((cj: any) => ACTIVE_STAGES.includes(cj.stage));
        const count = active.length;
        if (count >= thresholds.caution) continue;
        const company = job.clients?.company_name || "—";
        const onIds = new Set(active.map((cj: any) => cj.candidate_id));

        const readyNow = buildReadyNow(job, onIds, 5);
        const silver = findSilverForJob(job, onIds, 3);
        const coldPoolCount = coldCountForJob(job);

        const jt = tagsByJob.get(job.id);
        const keyCriteria = jt
          ? Array.from(jt).map((id) => tagNameById.get(id)).filter(Boolean).slice(0, 6) as string[]
          : [];
        const linkedinSearch = buildLinkedInSearch(job, keyCriteria);

        const opened = job.date_opened || job.created_at;
        const weeksOpen = Math.max(0, Math.round(daysSince(opened) / 7));
        // most recent candidate_jobs row created for this job = last "added"
        const lastAdded = (cjsByJob.get(job.id) || [])
          .map((c: any) => c.created_at)
          .sort()
          .reverse()[0];
        const daysSinceLastAdd = daysSince(lastAdded);

        let sourcingTarget = Math.max(1, thresholds.caution - count + 1);
        if (count === 0) sourcingTarget = 3;
        if (weeksOpen >= 2 && sourcingTarget < 3) sourcingTarget += 1;

        // Sourcing prompt tracking (per job)
        const promptKey = `desky.bw.srcPrompt.${job.id}`;
        let promptShownTs = 0;
        try { promptShownTs = parseInt(localStorage.getItem(promptKey) || "0", 10) || 0; } catch {}
        if (!promptShownTs) {
          try { localStorage.setItem(promptKey, String(Date.now())); } catch {}
          promptShownTs = Date.now();
        }
        const promptShownDays = Math.floor((Date.now() - promptShownTs) / 86400000);
        const escalated = promptShownDays >= 3 && daysSinceLastAdd >= 3 && readyNow.length === 0;

        let tone: BillerTone = "yellow";
        let title = "";
        let signal: string | undefined;
        let action = "";
        let urgency = 0;

        if (escalated) {
          tone = "red";
          title = `🚨 ${job.title} at ${company} — no new candidates in ${daysSinceLastAdd}d`;
          signal = `Sourcing prompt has been live for ${promptShownDays}d and pipeline is still thin. This role is at serious risk.`;
          action = "Source for this role before anything else today";
          urgency = 1100;
        } else if (count < thresholds.critical) {
          tone = "red";
          title = `🚨 ${job.title} at ${company} has NO candidates`;
          signal = readyNow.length
            ? `${readyNow.length} ready to send · weeks open: ${weeksOpen}`
            : "Database exhausted — proactive sourcing required";
          action = readyNow.length ? "Send these today" : "Source new candidates today";
          urgency = 1000;
        } else if (count < thresholds.warning) {
          tone = "amber";
          title = `⚠️ ${job.title} at ${company} — only ${count} candidate`;
          signal = readyNow.length ? `${readyNow.length} ready to send` : "One rejection and you have nothing";
          action = readyNow.length ? "Send these today" : "Source 1–2 more this week";
          urgency = 500;
        } else {
          tone = "yellow";
          title = `${job.title} at ${company} — ${count} candidates`;
          signal = readyNow.length ? `${readyNow.length} ready to send as insurance` : "Worth adding one more as insurance";
          action = "Add one more candidate this week";
          urgency = 300;
        }

        const sub = readyNow.length
          ? `Ready to send: ${readyNow.slice(0, 3).map((m) => m.name).join(", ")}`
          : "No ready matches in your database for this role";

        closeProtect.push({
          id: `cp-thin-${job.id}`,
          tone, section: "close",
          title,
          sub,
          signal, action,
          href: `/jobs`,
          urgency,
          logEntityType: "client",
          logEntityId: job.client_id,
          logEntityName: company,
          pipelineGap: {
            jobId: job.id,
            jobTitle: job.title,
            company,
            clientId: job.client_id,
            currentCount: count,
            weeksOpen,
            daysSinceLastAdd,
            sourcingTarget,
            escalated,
            promptShownDays,
            readyNow,
            silverMedallists: silver,
            coldPoolCount,
            keyCriteria,
            linkedinSearch,
          },
        });
      }

      for (const cj of cjs) {
        if (!activeJobIds.has(cj.job_id)) continue;
        const job = jobById.get(cj.job_id) as any;
        const cand = candById.get(cj.candidate_id) as any;
        if (!job || !cand) continue;
        const company = job.clients?.company_name || "—";
        const stageDays = daysSince(cj.stage_changed_at || cj.created_at);

        // TRIGGER 2 — NO BACKUP AT FINAL/OFFER
        if (LATE_STAGES.has(cj.stage)) {
          const others = cjsByJob.get(cj.job_id) || [];
          const hasBackup = others.some((o: any) => o.id !== cj.id && BACKUP_STAGES.has(o.stage));
          if (!hasBackup) {
            const exclude = new Set(others.map((o: any) => o.candidate_id));
            const matches = findCandidateMatches(job, exclude, 3);
            closeProtect.push({
              id: `cp-backup-${cj.id}`,
              tone: "amber", section: "close",
              title: `${cand.name} is at ${cj.stage} for ${job.title} at ${company}`,
              sub: matches.length ? `Silver medallists who match: ${matches.join(", ")}` : "No backup candidate exists",
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

        // TRIGGER 3 — OFFER GOING COLD
        if (cj.stage === "Offer" && stageDays >= thresholds.offerColdDays) {
          closeProtect.push({
            id: `cp-offercold-${cj.id}`,
            tone: "amber", section: "close",
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

        // TRIGGER 4 — NOTICE PERIOD WARMUP
        if (cj.stage === "Offer") {
          const weeks = parseNoticeWeeks(cand.notice_period);
          if (weeks !== null && weeks >= 6) {
            const label = weeks >= 8 ? `${Math.round(weeks/4)} month` : `${weeks} week`;
            closeProtect.push({
              id: `cp-notice-${cj.id}`,
              tone: "amber", section: "close",
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

        // TRIGGER 6 — COUNTER OFFER RISK from offers table
        if (cj.stage === "Offer" || cj.stage === "Second Interview") {
          const off = offers.find((o: any) => o.candidate_id === cand.id && o.job_id === job.id);
          if (off && (off.counter_offer_risk === "high" || off.counter_offer_risk === "medium")) {
            closeProtect.push({
              id: `cp-co-${cj.id}`,
              tone: "red", section: "close",
              title: `⚠️ Counter offer risk detected for ${cand.name} at ${company}`,
              sub: off.counter_offer_reasons ? `Signal: ${off.counter_offer_reasons.slice(0, 120)}` : `${job.title}`,
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

      // TRIGGER 5 — CLIENT GONE QUIET MID-PROCESS
      const submittedByJob = new Map<string, { count: number; lastDays: number }>();
      for (const cj of cjs) {
        if (!SUBMITTED_STAGES.has(cj.stage)) continue;
        if (!activeJobIds.has(cj.job_id)) continue;
        const job = jobById.get(cj.job_id) as any; if (!job) continue;
        const ln = lastClientNote.get(job.client_id);
        const d = daysSince(ln?.created_at);
        if (d < thresholds.clientSilenceDays) continue;
        const cur = submittedByJob.get(cj.job_id) || { count: 0, lastDays: d };
        cur.count += 1; cur.lastDays = Math.max(cur.lastDays, d);
        submittedByJob.set(cj.job_id, cur);
      }
      for (const [jobId, info] of submittedByJob.entries()) {
        const job = jobById.get(jobId) as any; if (!job) continue;
        const company = job.clients?.company_name || "—";
        const contactName = job.clients?.contact_name || "client";
        closeProtect.push({
          id: `cp-quiet-${jobId}`,
          tone: "amber", section: "close",
          title: `${company} has had ${info.count} CV${info.count === 1 ? "" : "s"} for ${info.lastDays} days — no feedback`,
          sub: `${job.title}`,
          signal: "Silence = too busy / not right / lost interest. All three need a call.",
          action: `Call ${contactName} today`,
          href: `/clients`,
          urgency: 350 + info.lastDays,
          logEntityType: "client",
          logEntityId: job.client_id,
          logEntityName: company,
        });
      }

      // TRIGGER 8 — BD CONTACTS WITH LIVE ROLES (silence on live client)
      const liveClientIds = new Set<string>();
      for (const j of jobs as any[]) if (j.status === "Active" && j.client_id) liveClientIds.add(j.client_id);
      for (const clientId of liveClientIds) {
        const client = clientById.get(clientId) as any; if (!client) continue;
        const ln = lastClientNote.get(clientId);
        const d = daysSince(ln?.created_at);
        if (d < 14) continue;
        // Skip if already covered by quiet-CV alert for any of its jobs
        const hasQuiet = jobs.some((j: any) => j.client_id === clientId && submittedByJob.has(j.id));
        if (hasQuiet) continue;
        const company = client.company_name || "—";
        closeProtect.push({
          id: `cp-livesilence-${clientId}`,
          tone: "amber", section: "close",
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

      // ============================================================
      // FEED THE BEAST
      // ============================================================
      const feedTheBeast: BillerItem[] = [];

      // TRIGGER 1 — BD REACTIVATION (past clients)
      const placementsByClient = new Map<string, any[]>();
      for (const p of placements) {
        if (p.status === "fallen_through") continue;
        const arr = placementsByClient.get(p.client_id) || [];
        arr.push(p); placementsByClient.set(p.client_id, arr);
      }
      for (const [clientId, ps] of placementsByClient.entries()) {
        const client = clientById.get(clientId) as any; if (!client) continue;
        if (liveClientIds.has(clientId)) continue; // they're in C&P
        const last = ps.sort((a,b) => (b.offer_accepted_date || "").localeCompare(a.offer_accepted_date || ""))[0];
        const placedDays = daysSince(last.offer_accepted_date || last.start_date);
        if (placedDays < thresholds.placedClientDays + 30) continue; // >= 90d placed + 60d silence ≈ matches spec
        const ln = lastClientNote.get(clientId);
        const contactDays = daysSince(ln?.created_at || client.last_activity_date);
        if (contactDays < thresholds.placedClientDays) continue;
        const months = Math.max(1, Math.floor(placedDays / 30));
        const company = client.company_name || last.client_name_snapshot || "—";
        feedTheBeast.push({
          id: `ftb-bd-${clientId}`,
          tone: "green", section: "feed",
          title: `${company} hired through you ${months} month${months === 1 ? "" : "s"} ago`,
          sub: `${contactDays >= 9000 ? "Not heard from since" : `${contactDays}d since last contact`} — past clients are 5x more likely to hire again`,
          action: `Call ${client.contact_name || "contact"} this week — lead with a candidate or insight, not "checking in"`,
          href: `/clients`,
          urgency: 70 + Math.min(contactDays, 90),
          logEntityType: "client",
          logEntityId: clientId,
          logEntityName: company,
        });
      }

      // TRIGGER 2 — PLACED CANDIDATE REFERRALS
      const placementByCand = new Map<string, any>();
      for (const p of placements) {
        if (p.status === "fallen_through") continue;
        const prev = placementByCand.get(p.candidate_id);
        if (!prev || (p.offer_accepted_date || "") > (prev.offer_accepted_date || "")) {
          placementByCand.set(p.candidate_id, p);
        }
      }
      for (const [candId, p] of placementByCand.entries()) {
        const placedDays = daysSince(p.offer_accepted_date || p.start_date);
        if (placedDays < thresholds.placedCandidateDays) continue;
        const cand = candById.get(candId) as any; if (!cand) continue;
        const ln = lastCandNote.get(candId);
        const contactDays = daysSince(ln?.created_at);
        if (contactDays < 60) continue;
        const months = Math.max(1, Math.floor(placedDays / 30));
        const company = p.client_name_snapshot || (clientById.get(p.client_id) as any)?.company_name || "—";
        feedTheBeast.push({
          id: `ftb-ref-${p.id}`,
          tone: "green", section: "feed",
          title: `${cand.name} has been at ${company} for ${months} month${months === 1 ? "" : "s"}`,
          sub: `Settled, happy, connected to a new network`,
          signal: "Placed candidates are your best referral source",
          action: "Call this week — ask how it's going, ask who's looking",
          href: `/candidates`,
          urgency: 55 + Math.min(contactDays, 60),
          logEntityType: "candidate",
          logEntityId: candId,
          logEntityName: cand.name,
        });
      }

      // TRIGGER 3 — SILVER MEDALLIST RE-ENGAGEMENT
      const placedCandIds = new Set(placements.filter((p: any) => p.status !== "fallen_through").map((p: any) => p.candidate_id));
      const interviewedRecent = new Map<string, { cj: any; job: any }>();
      for (const cj of cjs) {
        if (!["First Interview","Second Interview","Offer"].includes(cj.stage)) continue;
        const moved = daysSince(cj.stage_changed_at || cj.created_at);
        if (moved > 180) continue;
        const cand = candById.get(cj.candidate_id) as any; if (!cand) continue;
        if (placedCandIds.has(cand.id)) continue;
        if (cand.status !== "Active" && cand.status !== "Passive") continue;
        const job = jobById.get(cj.job_id) as any; if (!job) continue;
        const prev = interviewedRecent.get(cand.id);
        if (!prev || moved < daysSince(prev.cj.stage_changed_at || prev.cj.created_at)) {
          interviewedRecent.set(cand.id, { cj, job });
        }
      }
      const activeJobsList = jobs.filter((j: any) => j.status === "Active");
      for (const [candId, { cj, job }] of interviewedRecent.entries()) {
        const cand = candById.get(candId) as any;
        const weeks = Math.max(1, Math.round(daysSince(cj.stage_changed_at || cj.created_at) / 7));
        const company = job.clients?.company_name || "—";
        const onJobIds = new Set(cjs.filter((c: any) => c.candidate_id === candId && ACTIVE_STAGES.includes(c.stage)).map((c: any) => c.job_id));
        const candTagSet = tagsByCand.get(candId) || new Set();
        const matches: string[] = [];
        for (const aj of activeJobsList) {
          if (onJobIds.has(aj.id)) continue;
          const jt = tagsByJob.get(aj.id);
          let share = false;
          if (jt) for (const t of jt) if (candTagSet.has(t)) { share = true; break; }
          if (!share) {
            const ct = (cand.job_title || "").toLowerCase();
            const tok = (aj.title || "").toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
            share = tok.some((t: string) => ct.includes(t));
          }
          if (share) matches.push(`${aj.title} at ${aj.clients?.company_name || "—"}`);
          if (matches.length >= 2) break;
        }
        if (matches.length === 0) continue;
        feedTheBeast.push({
          id: `ftb-silver-${candId}`,
          tone: "green", section: "feed",
          title: `${cand.name} interviewed at ${company} ${weeks} week${weeks === 1 ? "" : "s"} ago — still on the market`,
          sub: `Could match: ${matches.join(" · ")}`,
          signal: "Warm candidate who already knows your process",
          action: "Pitch into a new role today",
          href: `/candidates`,
          urgency: 60 - Math.min(weeks, 20),
          logEntityType: "candidate",
          logEntityId: candId,
          logEntityName: cand.name,
        });
      }

      // TRIGGER 4 — WARM PROSPECTS GONE QUIET
      for (const client of clients as any[]) {
        const status = (client.status || "").toLowerCase();
        if (!status.includes("warm") && !status.includes("prospect")) continue;
        if (liveClientIds.has(client.id)) continue;
        const ln = lastClientNote.get(client.id);
        const d = daysSince(ln?.created_at || client.last_activity_date);
        if (d < thresholds.warmProspectDays) continue;
        const weeks = Math.max(1, Math.round(d / 7));
        const company = client.company_name || "—";
        feedTheBeast.push({
          id: `ftb-warm-${client.id}`,
          tone: "green", section: "feed",
          title: `${client.contact_name || company} at ${company} showed hiring interest ${weeks} week${weeks === 1 ? "" : "s"} ago`,
          sub: ln?.content ? `Last note: ${(ln.content || "").slice(0, 100)}` : "Relationships go cold fast",
          action: "Call this week — lead with something useful, not a check-in",
          href: `/clients`,
          urgency: 45 + Math.min(d, 60),
          logEntityType: "client",
          logEntityId: client.id,
          logEntityName: company,
        });
      }

      // TRIGGER 5 — TALENT POOL HEALTH
      for (const pool of pools as any[]) {
        const members = (poolMembers as any[]).filter((m) => m.pool_id === pool.id);
        const target = pool.target_size || 5;
        const warnDays = pool.warning_threshold_days || 28;
        let cold = 0;
        for (const m of members) {
          const c = candById.get(m.candidate_id) as any; if (!c) continue;
          const ln = lastCandNote.get(m.candidate_id);
          const d = daysSince(ln?.created_at || m.added_at);
          if (d >= warnDays * 1.5) cold += 1;
        }
        const thin = members.length < target;
        if (!thin && cold < 3) continue;
        feedTheBeast.push({
          id: `ftb-pool-${pool.id}`,
          tone: "green", section: "feed",
          title: `${pool.name} pool is running thin`,
          sub: `${members.length} candidate${members.length === 1 ? "" : "s"} · target ${target}${cold ? ` · ${cold} gone cold` : ""}`,
          signal: "A thin bench means slow fills when roles come in",
          action: "Add 2–3 candidates this week + re-engage cold ones",
          href: `/candidates`,
          urgency: 35 + (target - members.length) * 5 + cold * 3,
        });
      }
      // TRIGGER 6 — CAMPAIGN REPLIES (Re-engage subsection)
      const replySignals = (signalsRes.data || []).filter((s: any) => !viewUserId || s.notes?.owner_user_id === viewUserId);
      for (const sig of replySignals as any[]) {
        const candId = sig.notes?.candidate_id;
        const cand = candId ? (candById.get(candId) as any) : null;
        const name = cand?.name || "Candidate";
        const score = sig.priority_score || 5;
        const daysAgo = daysSince(sig.created_at);
        const tone: BillerTone = score >= 7 ? "amber" : score >= 4 ? "green" : "yellow";
        const urgency = score >= 7 ? 90 - daysAgo : score >= 4 ? 50 - daysAgo : 10;
        feedTheBeast.push({
          id: `ftb-reply-${sig.id}`,
          tone, section: "feed",
          title: `📨 ${name} replied to your campaign${daysAgo > 0 ? ` · ${daysAgo}d ago` : " · today"}`,
          sub: sig.trigger_phrase ? `"${(sig.trigger_phrase || "").slice(0, 120)}"` : sig.explanation,
          signal: sig.explanation,
          action: sig.suggested_action || `Review ${name}'s reply and assess fit`,
          href: candId ? `/candidates` : undefined,
          urgency,
          logEntityType: candId ? "candidate" : undefined,
          logEntityId: candId || undefined,
          logEntityName: name,
        });
      }

      // TRIGGER 7 — STRONG ACTIVE CANDIDATE, NO LIVE ROLE MATCH (Pitch speculatively)
      const candsOnActivePipelines = new Set<string>();
      for (const cj of cjs) {
        if (ACTIVE_STAGES.includes(cj.stage)) candsOnActivePipelines.add(cj.candidate_id);
      }
      for (const c of candidates as any[]) {
        if (!c.priority_flag) continue;
        if (c.do_not_contact || c.status === "Do Not Contact") continue;
        if (candsOnActivePipelines.has(c.id)) continue;
        if (placedCandIds.has(c.id)) continue;
        // rough match count against active jobs (tag-based or title-token-based)
        const candTagSet = tagsByCand.get(c.id) || new Set();
        let matchCount = 0;
        const ct = (c.job_title || "").toLowerCase();
        for (const aj of activeJobsList) {
          const jt = tagsByJob.get(aj.id);
          let share = false;
          if (jt) for (const t of jt) if (candTagSet.has(t)) { share = true; break; }
          if (!share) {
            const tok = (aj.title || "").toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
            share = tok.some((t: string) => ct.includes(t));
          }
          if (share) matchCount += 1;
        }
        feedTheBeast.push({
          id: `ftb-pitch-${c.id}`,
          tone: "green", section: "feed",
          title: `${c.name} is a strong candidate with no current role to submit to`,
          sub: matchCount > 0
            ? `${matchCount} potential match${matchCount === 1 ? "" : "es"} found — worth pitching speculatively`
            : `No live match in your DB — worth pitching speculatively into the market`,
          signal: "Strong active candidate, no current pipeline",
          action: "Find opportunities →",
          href: `/candidates/${c.id}/pitch`,
          urgency: 55 + Math.min(matchCount * 3, 20),
          logEntityType: "candidate",
          logEntityId: c.id,
          logEntityName: c.name,
        });
      }

      // TRIGGER 8 — JOB CREATED BUT SEARCH NOT LAUNCHED
      for (const aj of activeJobsList) {
        if ((aj as any).search_launched_at) continue;
        const createdDays = daysSince(aj.created_at);
        if (createdDays > 21) continue; // stale jobs handled elsewhere
        const pipelineCount = (cjs as any[]).filter((cj) => cj.job_id === aj.id).length;
        const clientName = (aj as any).clients?.company_name || "—";
        feedTheBeast.push({
          id: `ftb-launch-${aj.id}`,
          tone: pipelineCount === 0 ? "amber" : "green",
          section: "feed",
          title: `${aj.title} — search not launched yet`,
          sub: pipelineCount === 0
            ? `Pipeline empty at ${clientName}. Run the 10-min launch workflow to generate warm messages, post, campaign, and client confirmation.`
            : `Added ${createdDays}d ago at ${clientName}. Launch the search to send warm messages and create your campaign.`,
          signal: "New job awaiting launch",
          action: "Launch search →",
          href: `/jobs/${aj.id}/launch`,
          urgency: pipelineCount === 0 ? 75 : 50,
          logEntityType: "client",
          logEntityId: aj.client_id,
          logEntityName: clientName,
        });
      }

      // ============================================================
      // DERIVED SIGNAL — recently-spoken candidate + strong live-role match
      // Only fires when the connection is confidently supported.
      // ============================================================
      const RECENT_SPOKEN_DAYS = 14;
      const derivedEmitted = new Set<string>();
      const candidateAlreadyOn = new Map<string, Set<string>>();
      for (const cj of cjs as any[]) {
        const s = candidateAlreadyOn.get(cj.candidate_id) || new Set<string>();
        s.add(cj.job_id); candidateAlreadyOn.set(cj.candidate_id, s);
      }
      for (const c of candidates as any[]) {
        if (derivedEmitted.size >= 12) break;
        if (c.status !== "Active" && c.status !== "Passive") continue;
        const ln = lastCandNote.get(c.id);
        if (!ln) continue;
        const d = daysSince(ln.created_at);
        if (d > RECENT_SPOKEN_DAYS) continue;
        const candTagSet = tagsByCand.get(c.id);
        const ct = (c.job_title || "").toLowerCase();
        const onJobs = candidateAlreadyOn.get(c.id) || new Set<string>();
        for (const aj of activeJobsList) {
          if (derivedEmitted.size >= 12) break;
          if (onJobs.has(aj.id)) continue;
          const jt = tagsByJob.get(aj.id);
          const tokens = (aj.title || "").toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
          let tagHits = 0;
          const hitNames: string[] = [];
          if (jt && candTagSet) {
            for (const t of jt) if (candTagSet.has(t)) {
              tagHits += 1;
              const n = tagNameById.get(t); if (n) hitNames.push(n);
            }
          }
          const titleHit = tokens.length > 0 && tokens.some((t: string) => ct.includes(t));
          // Confidence gate: 2+ tag overlaps OR (1 tag + title token). No weaker fallback.
          const strong = tagHits >= 2 || (tagHits >= 1 && titleHit);
          if (!strong) continue;
          const key = `${c.id}-${aj.id}`;
          if (derivedEmitted.has(key)) continue;
          derivedEmitted.add(key);
          const company = aj.clients?.company_name || "—";
          const reasonBits = [`spoken ${d}d ago`];
          if (hitNames.length) reasonBits.push(hitNames.slice(0, 2).join(" + "));
          if (titleHit) reasonBits.push("title match");
          feedTheBeast.push({
            id: `ftb-derived-${c.id}-${aj.id}`,
            tone: "amber", section: "feed",
            kind: "derived",
            title: `Send ${c.name}'s CV to ${company} for ${aj.title}`,
            sub: reasonBits.join(" · "),
            signal: "Recent conversation + strong role match — pitch while warm",
            action: "Submit today",
            href: `/jobs`,
            urgency: 820 - d * 10 + tagHits * 15,
            logEntityType: "candidate",
            logEntityId: c.id,
            logEntityName: c.name,
          });
        }
      }

      let lastBdTouch: string | null = null;
      for (const n of notes as any[]) {
        if (!BD_TYPES.has(n.activity_type)) continue;
        if (!n.client_id) continue;
        lastBdTouch = n.created_at; break;
      }
      const bdSilenceDays = lastBdTouch ? daysSince(lastBdTouch) : 9999;

      let recentPlacement: BillersWorkflowData["recentPlacement"] = null;
      for (const p of placements) {
        if (p.status === "fallen_through") continue;
        const d = daysSince(p.offer_accepted_date || p.start_date);
        if (d <= 3 && (!recentPlacement || d < recentPlacement.daysAgo)) {
          recentPlacement = {
            name: p.candidate_name_snapshot || "Candidate",
            company: p.client_name_snapshot || "—",
            daysAgo: d,
          };
        }
      }

      const totalActiveJobs = jobs.filter((j: any) => j.status === "Active").length;
      const totalActiveDeals = cjs.filter((cj: any) => activeJobIds.has(cj.job_id) && ACTIVE_STAGES.includes(cj.stage)).length;
      const navinMode = totalActiveJobs === 0 && totalActiveDeals === 0 && bdSilenceDays >= 3;

      // DAILY BD TARGET — top 3 named calls (when <=1 active jobs OR bd silence >=3)
      const dailyBdTargets: BillerItem[] = [];
      if (totalActiveJobs <= 1 || bdSilenceDays >= thresholds.bdInactivityDays) {
        // 1. Most recent placement client
        const sortedPlClients = Array.from(placementsByClient.entries())
          .map(([cid, ps]) => {
            const last = ps.sort((a,b) => (b.offer_accepted_date || "").localeCompare(a.offer_accepted_date || ""))[0];
            return { cid, last, days: daysSince(last.offer_accepted_date || last.start_date) };
          })
          .sort((a,b) => a.days - b.days);
        const pick1 = sortedPlClients.find(x => !liveClientIds.has(x.cid));
        if (pick1) {
          const cl = clientById.get(pick1.cid) as any;
          if (cl) dailyBdTargets.push({
            id: `bdt-1-${pick1.cid}`, tone: "red", section: "feed",
            title: cl.contact_name || cl.company_name || "Past client",
            sub: `${cl.company_name || "—"} — placed client (${Math.floor(pick1.days/30)}mo ago)`,
            action: "Reactivation call — lead with value",
            urgency: 9999, bdTarget: true,
            logEntityType: "client", logEntityId: pick1.cid, logEntityName: cl.company_name,
          });
        }
        // 2. Warm prospect
        const warmPick = (clients as any[]).find((c) => {
          const s = (c.status || "").toLowerCase();
          if (!s.includes("warm") && !s.includes("prospect")) return false;
          if (liveClientIds.has(c.id)) return false;
          if (dailyBdTargets.some(t => t.logEntityId === c.id)) return false;
          return true;
        });
        if (warmPick) {
          dailyBdTargets.push({
            id: `bdt-2-${warmPick.id}`, tone: "red", section: "feed",
            title: warmPick.contact_name || warmPick.company_name,
            sub: `${warmPick.company_name || "—"} — warm prospect`,
            action: "Open with a market insight or candidate",
            urgency: 9998, bdTarget: true,
            logEntityType: "client", logEntityId: warmPick.id, logEntityName: warmPick.company_name,
          });
        }
        // 3. Placed candidate for referral
        const refPick = Array.from(placementByCand.entries())
          .map(([cid, p]) => ({ cid, p, days: daysSince(p.offer_accepted_date || p.start_date) }))
          .filter(x => x.days >= 90)
          .sort((a,b) => a.days - b.days)[0];
        if (refPick) {
          const cand = candById.get(refPick.cid) as any;
          if (cand) dailyBdTargets.push({
            id: `bdt-3-${refPick.cid}`, tone: "red", section: "feed",
            title: cand.name,
            sub: `Placed at ${refPick.p.client_name_snapshot || "—"} — ask for referrals`,
            action: "Settled-in check-in + referral ask",
            urgency: 9997, bdTarget: true,
            logEntityType: "candidate", logEntityId: refPick.cid, logEntityName: cand.name,
          });
        }
      }

      closeProtect.sort((a,b) => b.urgency - a.urgency);
      feedTheBeast.sort((a,b) => b.urgency - a.urgency);

      return {
        closeProtect: stripHidden(closeProtect).slice(0, 40),
        feedTheBeast: stripHidden(feedTheBeast).slice(0, 40),
        bdSilenceDays,
        recentPlacement,
        navinMode,
        totalActiveJobs,
        totalActiveDeals,
        dailyBdTargets: stripHidden(dailyBdTargets),
      };
    },
  });
}

export function snoozeItem(id: string, days: 1 | 3 | 7) {
  try {
    localStorage.setItem(`desky.bw.snooze.${id}`, String(Date.now() + days * 86400000));
  } catch {}
}

export function markItemDone(id: string) {
  // Hide for the rest of the day (24h)
  try {
    localStorage.setItem(`desky.bw.done.${id}`, String(Date.now() + 86400000));
  } catch {}
}

const THRESHOLD_KEY = "desky.bw.thresholds";
export function loadThresholds(): BillerThresholds {
  try {
    const raw = localStorage.getItem(THRESHOLD_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch { return DEFAULT_THRESHOLDS; }
}
export function saveThresholds(t: BillerThresholds) {
  try { localStorage.setItem(THRESHOLD_KEY, JSON.stringify(t)); } catch {}
}
