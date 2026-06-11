import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BillerTone = "amber" | "green";

export type BillerItem = {
  id: string;
  title: string;
  sub?: string;
  signal?: string;
  action: string;
  href?: string;
  urgency: number;
  tone: BillerTone;
  logEntityType?: "candidate" | "client";
  logEntityId?: string;
  logEntityName?: string;
};

export type BillersWorkflowData = {
  closeProtect: BillerItem[];
  feedTheBeast: BillerItem[];
  bdSilenceDays: number;
  recentPlacement: { name: string; company: string; daysAgo: number } | null;
  navinMode: boolean;
  totalActiveJobs: number;
  totalActiveDeals: number;
};

const BACKUP_STAGES = new Set(["Screening", "Shortlist"]);
const LATE_STAGES = new Set(["First Interview", "Second Interview", "Offer"]);
const SUBMITTED_STAGES = new Set(["Submitted", "Client Review"]);
const ACTIVE_STAGES = ["Longlist","Contact","Screening","Shortlist","Submitted","Client Review","First Interview","Second Interview","Offer"];

function daysSince(iso?: string | null): number {
  if (!iso) return 9999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// Parse free-text notice period to weeks. Returns null if unknown.
function parseNoticeWeeks(text?: string | null): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/immediate|none|^0\b/.test(t)) return 0;
  const mWeek = t.match(/(\d+)\s*week/);
  if (mWeek) return parseInt(mWeek[1], 10);
  const mMonth = t.match(/(\d+)\s*month/);
  if (mMonth) return parseInt(mMonth[1], 10) * 4;
  return null;
}

export function useBillersWorkflow(viewUserId?: string | null) {
  return useQuery({
    queryKey: ["billers-workflow-v2", viewUserId || "me"],
    staleTime: 30_000,
    queryFn: async (): Promise<BillersWorkflowData> => {
      const [cjRes, jobsRes, clientsRes, candsRes, notesRes, jobTagsRes, candTagsRes, poolsRes, poolMembersRes, placementsRes] = await Promise.all([
        supabase.from("candidate_jobs").select("id,candidate_id,job_id,stage,stage_changed_at,created_at,owner_user_id"),
        supabase.from("jobs").select("id,title,status,client_id,owner_user_id,clients(company_name,contact_name)"),
        supabase.from("clients").select("id,company_name,contact_name,status,heat,last_activity_date,owner_user_id"),
        supabase.from("candidates").select("id,name,job_title,status,notice_period,owner_user_id"),
        supabase.from("notes").select("id,candidate_id,client_id,activity_type,content,created_at").order("created_at", { ascending: false }).limit(1500),
        supabase.from("job_tags").select("job_id,tag_definition_id"),
        supabase.from("candidate_tags").select("candidate_id,tag_definition_id"),
        supabase.from("talent_pools" as any).select("id,name,description,target_size,checkin_frequency_days,warning_threshold_days,owner_user_id"),
        supabase.from("candidate_talent_pools" as any).select("candidate_id,pool_id,owner_user_id,added_at"),
        supabase.from("placements" as any).select("id,candidate_id,client_id,job_id,candidate_name_snapshot,client_name_snapshot,job_title_snapshot,offer_accepted_date,start_date,status,owner_user_id"),
      ]);

      const filterOwner = (rows: any[] | null): any[] =>
        (rows || []).filter((r: any) => !viewUserId || r.owner_user_id === viewUserId);

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

      // Index cjs by job
      const cjsByJob = new Map<string, any[]>();
      for (const cj of cjs) {
        const arr = cjsByJob.get(cj.job_id) || [];
        arr.push(cj);
        cjsByJob.set(cj.job_id, arr);
      }

      // Tag indices for silver medallist matching
      const tagsByCand = new Map<string, Set<string>>();
      for (const ct of candTags as any[]) {
        const s = tagsByCand.get(ct.candidate_id) || new Set();
        s.add(ct.tag_definition_id);
        tagsByCand.set(ct.candidate_id, s);
      }
      const tagsByJob = new Map<string, Set<string>>();
      for (const jt of jobTags as any[]) {
        const s = tagsByJob.get(jt.job_id) || new Set();
        s.add(jt.tag_definition_id);
        tagsByJob.set(jt.job_id, s);
      }

      const findBackupSuggestions = (job: any, onJobIds: Set<string>): string[] => {
        const out: string[] = [];
        const jobTagIds = tagsByJob.get(job.id);
        if (jobTagIds && jobTagIds.size) {
          for (const c of candidates as any[]) {
            if (onJobIds.has(c.id)) continue;
            if (c.status !== "Active" && c.status !== "Passive") continue;
            const ct = tagsByCand.get(c.id);
            if (!ct) continue;
            let shared = false;
            for (const t of jobTagIds) if (ct.has(t)) { shared = true; break; }
            if (shared) { out.push(c.name); if (out.length >= 3) return out; }
          }
        }
        // Fallback: job title token overlap
        if (out.length < 3) {
          const titleTokens = (job.title || "").toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
          for (const c of candidates as any[]) {
            if (onJobIds.has(c.id)) continue;
            if (c.status !== "Active" && c.status !== "Passive") continue;
            const jt = (c.job_title || "").toLowerCase();
            if (titleTokens.some((t: string) => jt.includes(t))) {
              if (!out.includes(c.name)) out.push(c.name);
              if (out.length >= 3) break;
            }
          }
        }
        return out;
      };

      // ============================================================
      // SECTION 1 — CLOSE & PROTECT
      // ============================================================
      const closeProtect: BillerItem[] = [];

      for (const cj of cjs) {
        if (!activeJobIds.has(cj.job_id)) continue;
        const job = jobById.get(cj.job_id) as any;
        const cand = candById.get(cj.candidate_id) as any;
        if (!job || !cand) continue;
        const company = job.clients?.company_name || "—";
        const contactName = job.clients?.contact_name || "client";
        const stageDays = daysSince(cj.stage_changed_at || cj.created_at);

        // TRIGGER 3 — OFFER GOING COLD (4+ days)
        if (cj.stage === "Offer" && stageDays >= 4) {
          closeProtect.push({
            id: `cp-offercold-${cj.id}`,
            tone: "amber",
            title: `${cand.name} has had the offer ${stageDays} days without accepting`,
            sub: `${job.title} at ${company}`,
            signal: stageDays >= 5
              ? "After 5 days — counter offer probability rises sharply"
              : "Silence on an offer means something is happening",
            action: "Call today — not email. Ask directly what is going on.",
            href: `/jobs`,
            urgency: 200 + stageDays,
            logEntityType: "candidate",
            logEntityId: cand.id,
            logEntityName: cand.name,
          });
        }

        // TRIGGER 2 — NOTICE PERIOD WARMUP (at Offer, 6+ weeks notice)
        if (cj.stage === "Offer") {
          const weeks = parseNoticeWeeks(cand.notice_period);
          if (weeks !== null && weeks >= 6) {
            const months = weeks >= 8 ? `${Math.round(weeks / 4)} month` : `${weeks} week`;
            closeProtect.push({
              id: `cp-notice-${cj.id}`,
              tone: "amber",
              title: `${cand.name} has a ${months} notice period`,
              sub: `${job.title} at ${company} — a lot can happen in ${months}s`,
              signal: "Counter offer risk is highest during long notice periods",
              action: "Schedule a 2-week-in check-in + send counter-offer prep notes",
              href: `/jobs`,
              urgency: 150 + weeks,
              logEntityType: "candidate",
              logEntityId: cand.id,
              logEntityName: cand.name,
            });
          }
        }

        // TRIGGER 1 & 6 — BACKUP CANDIDATE NEEDED (late stages, no backup at Screening/Shortlist)
        if (LATE_STAGES.has(cj.stage)) {
          const others = cjsByJob.get(cj.job_id) || [];
          const hasBackup = others.some((o: any) => o.id !== cj.id && BACKUP_STAGES.has(o.stage));
          if (!hasBackup) {
            const onJobIds = new Set(others.map((o: any) => o.candidate_id));
            const suggestions = findBackupSuggestions(job, onJobIds);
            const isFinal = cj.stage === "Second Interview" || cj.stage === "Offer";
            closeProtect.push({
              id: `cp-backup-${cj.id}`,
              tone: "amber",
              title: `${cand.name} is at ${cj.stage} for ${job.title} at ${company} — no backup`,
              sub: suggestions.length
                ? `Silver medallists who match: ${suggestions.slice(0, 3).join(", ")}`
                : "No silver medallists found — source one this week",
              signal: isFinal
                ? "Finals fall through ~30% of the time. If this drops you start from scratch."
                : "If this falls through you have nothing to send next.",
              action: "Add one backup to shortlist today",
              href: `/jobs`,
              urgency: (isFinal ? 130 : 110) + stageDays,
            });
          }
        }
      }

      // TRIGGER 4 — CLIENT GONE QUIET MID PROCESS (CVs out 7+ days no feedback)
      const submittedByJob = new Map<string, { count: number; lastDays: number }>();
      for (const cj of cjs) {
        if (!SUBMITTED_STAGES.has(cj.stage)) continue;
        if (!activeJobIds.has(cj.job_id)) continue;
        const job = jobById.get(cj.job_id) as any;
        if (!job) continue;
        const ln = lastClientNote.get(job.client_id);
        const d = daysSince(ln?.created_at);
        if (d < 7) continue;
        const cur = submittedByJob.get(cj.job_id) || { count: 0, lastDays: d };
        cur.count += 1;
        cur.lastDays = Math.max(cur.lastDays, d);
        submittedByJob.set(cj.job_id, cur);
      }
      for (const [jobId, info] of submittedByJob.entries()) {
        const job = jobById.get(jobId) as any;
        if (!job) continue;
        const company = job.clients?.company_name || "—";
        const contactName = job.clients?.contact_name || "client";
        closeProtect.push({
          id: `cp-quiet-${jobId}`,
          tone: "amber",
          title: `${company} has had ${info.count} CV${info.count === 1 ? "" : "s"} for ${info.lastDays} days with no feedback`,
          sub: `${job.title}`,
          signal: "Silence usually means: too busy / not right / lost interest. All three need a call.",
          action: `Call ${contactName} today`,
          href: `/clients`,
          urgency: 120 + info.lastDays,
          logEntityType: "client",
          logEntityId: job.client_id,
          logEntityName: company,
        });
      }

      closeProtect.sort((a, b) => b.urgency - a.urgency);

      // ============================================================
      // SECTION 2 — FEED THE BEAST
      // ============================================================
      const feedTheBeast: BillerItem[] = [];

      // TRIGGER 1 — THIN PIPELINE WARNING (<3 candidates at any active stage)
      for (const job of jobs as any[]) {
        if (job.status !== "Active") continue;
        const active = (cjsByJob.get(job.id) || []).filter((cj: any) => ACTIVE_STAGES.includes(cj.stage));
        const count = active.length;
        if (count >= 3) continue;
        const company = job.clients?.company_name || "—";
        const onJobIds = new Set(active.map((cj: any) => cj.candidate_id));

        // Pool suggestion
        const jobTitleLower = (job.title || "").toLowerCase();
        let poolHit: { name: string; candidate?: string } | null = null;
        for (const pool of pools as any[]) {
          const tokens = `${pool.name || ""} ${pool.description || ""}`.toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
          if (!tokens.some((t: string) => jobTitleLower.includes(t))) continue;
          const memberIds = (poolMembers as any[]).filter((m) => m.pool_id === pool.id).map((m) => m.candidate_id);
          let pickName: string | undefined;
          for (const cid of memberIds) {
            if (onJobIds.has(cid)) continue;
            const c = candById.get(cid) as any;
            if (c && (c.status === "Active" || c.status === "Passive")) { pickName = c.name; break; }
          }
          poolHit = { name: pool.name, candidate: pickName };
          break;
        }

        feedTheBeast.push({
          id: `ftb-thin-${job.id}`,
          tone: "green",
          title: `${job.title} at ${company} — thin pipeline (${count} candidate${count === 1 ? "" : "s"})`,
          sub: poolHit
            ? `Pool "${poolHit.name}"${poolHit.candidate ? ` — start with ${poolHit.candidate}` : ""}`
            : `Target ≥ 3 to give yourself a real chance`,
          signal: count === 0 ? "Zero candidates — this role is at risk of dying" : undefined,
          action: "Add 2 candidates to this pipeline today",
          href: `/jobs`,
          urgency: 80 + (3 - count) * 10,
        });
      }

      // TRIGGER 2 — SILVER MEDALLIST RE-ENGAGEMENT
      // Candidates who reached interview stage in last 6 months, weren't placed, still Active/Passive
      const placedCandIds = new Set(placements.filter((p: any) => p.status !== "fallen_through").map((p: any) => p.candidate_id));
      const interviewedRecent = new Map<string, { cj: any; job: any }>();
      for (const cj of cjs) {
        if (!["First Interview","Second Interview","Offer"].includes(cj.stage)) continue;
        const moved = daysSince(cj.stage_changed_at || cj.created_at);
        if (moved > 180) continue;
        const cand = candById.get(cj.candidate_id) as any;
        if (!cand) continue;
        if (placedCandIds.has(cand.id)) continue;
        if (cand.status !== "Active" && cand.status !== "Passive") continue;
        const job = jobById.get(cj.job_id) as any;
        if (!job) continue;
        const prev = interviewedRecent.get(cand.id);
        if (!prev || moved < daysSince(prev.cj.stage_changed_at || prev.cj.created_at)) {
          interviewedRecent.set(cand.id, { cj, job });
        }
      }
      // Active jobs the candidate could match (by shared tag or title token)
      const activeJobsList = jobs.filter((j: any) => j.status === "Active");
      for (const [candId, { cj, job }] of interviewedRecent.entries()) {
        const cand = candById.get(candId) as any;
        const weeks = Math.max(1, Math.round(daysSince(cj.stage_changed_at || cj.created_at) / 7));
        const company = job.clients?.company_name || "—";
        const candOnJobIds = new Set(cjs.filter((c: any) => c.candidate_id === candId && ACTIVE_STAGES.includes(c.stage)).map((c: any) => c.job_id));
        const candTagSet = tagsByCand.get(candId) || new Set();
        const matches: string[] = [];
        for (const aj of activeJobsList) {
          if (candOnJobIds.has(aj.id)) continue;
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
          tone: "green",
          title: `${cand.name} interviewed at ${company} ${weeks} week${weeks === 1 ? "" : "s"} ago — still on the market`,
          sub: `Could match: ${matches.join(" · ")}`,
          signal: "Warm candidate who already knows your process",
          action: "Pitch into a new role today",
          href: `/candidates`,
          urgency: 70 - Math.min(weeks, 20),
          logEntityType: "candidate",
          logEntityId: candId,
          logEntityName: cand.name,
        });
      }

      // TRIGGER 3 — BD REACTIVATION (past clients with placements, 60+ days no contact)
      const placementsByClient = new Map<string, any[]>();
      for (const p of placements) {
        if (p.status === "fallen_through") continue;
        const arr = placementsByClient.get(p.client_id) || [];
        arr.push(p);
        placementsByClient.set(p.client_id, arr);
      }
      for (const [clientId, ps] of placementsByClient.entries()) {
        const client = clientById.get(clientId) as any;
        if (!client) continue;
        const last = ps.sort((a, b) => (b.offer_accepted_date || "").localeCompare(a.offer_accepted_date || ""))[0];
        const placedDays = daysSince(last.offer_accepted_date || last.start_date);
        if (placedDays < 60) continue;
        const ln = lastClientNote.get(clientId);
        const contactDays = daysSince(ln?.created_at || client.last_activity_date);
        if (contactDays < 60) continue;
        const months = Math.max(1, Math.floor(placedDays / 30));
        const company = client.company_name || last.client_name_snapshot || "—";
        feedTheBeast.push({
          id: `ftb-bd-${clientId}`,
          tone: "green",
          title: `${company} hired through you ${months} month${months === 1 ? "" : "s"} ago`,
          sub: `${contactDays >= 9000 ? "Not heard from since" : `${contactDays}d since last contact`} — past clients are 5x more likely to hire again`,
          action: `Call ${client.contact_name || "contact"} today — lead with a candidate or insight, not "checking in"`,
          href: `/clients`,
          urgency: 60 + Math.min(contactDays, 90),
          logEntityType: "client",
          logEntityId: clientId,
          logEntityName: company,
        });
      }

      // TRIGGER 4 — PLACED CANDIDATE REFERRAL (90+ days, no contact since)
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
        if (placedDays < 90) continue;
        const cand = candById.get(candId) as any;
        if (!cand) continue;
        const ln = lastCandNote.get(candId);
        const contactDays = daysSince(ln?.created_at);
        if (contactDays < 60) continue;
        const months = Math.max(1, Math.floor(placedDays / 30));
        const company = p.client_name_snapshot || (clientById.get(p.client_id) as any)?.company_name || "—";
        feedTheBeast.push({
          id: `ftb-ref-${p.id}`,
          tone: "green",
          title: `${cand.name} has been at ${company} for ${months} month${months === 1 ? "" : "s"}`,
          sub: `Settled, happy, and connected to a new network`,
          signal: "Placed candidates are your best referral source",
          action: "Call this week — ask how it's going, ask who's looking",
          href: `/candidates`,
          urgency: 50 + Math.min(contactDays, 60),
          logEntityType: "candidate",
          logEntityId: candId,
          logEntityName: cand.name,
        });
      }

      // TRIGGER 6 — TALENT POOL HEALTH (below target OR 3+ cold members)
      for (const pool of pools as any[]) {
        const members = (poolMembers as any[]).filter((m) => m.pool_id === pool.id);
        const target = pool.target_size || 5;
        const warnDays = pool.warning_threshold_days || 28;
        let cold = 0;
        for (const m of members) {
          const c = candById.get(m.candidate_id) as any;
          if (!c) continue;
          const ln = lastCandNote.get(m.candidate_id);
          const d = daysSince(ln?.created_at || m.added_at);
          if (d >= warnDays * 1.5) cold += 1;
        }
        const thin = members.length < target;
        if (!thin && cold < 3) continue;
        feedTheBeast.push({
          id: `ftb-pool-${pool.id}`,
          tone: "green",
          title: `${pool.name} pool is running thin`,
          sub: `${members.length} candidate${members.length === 1 ? "" : "s"} · target ${target}${cold ? ` · ${cold} gone cold` : ""}`,
          signal: "A thin bench means slow fills when roles come in",
          action: "Add 2–3 candidates this week + re-engage cold ones",
          href: `/candidates`,
          urgency: 40 + (target - members.length) * 5 + cold * 3,
        });
      }

      feedTheBeast.sort((a, b) => b.urgency - a.urgency);

      // ============================================================
      // META — BD silence, recent placement, navin mode
      // ============================================================
      const BD_ACTIVITY_TYPES = new Set(["Call", "Email", "LinkedIn Message", "Meeting", "Text Message", "WhatsApp"]);
      let lastBdTouch: string | null = null;
      for (const n of notes as any[]) {
        if (!BD_ACTIVITY_TYPES.has(n.activity_type)) continue;
        if (!n.client_id) continue;
        lastBdTouch = n.created_at;
        break;
      }
      const bdSilenceDays = lastBdTouch ? daysSince(lastBdTouch) : 9999;

      // Recent placement in last 3 days
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
      const navinMode = totalActiveJobs === 0 && totalActiveDeals === 0;

      return {
        closeProtect: closeProtect.slice(0, 30),
        feedTheBeast: feedTheBeast.slice(0, 30),
        bdSilenceDays,
        recentPlacement,
        navinMode,
        totalActiveJobs,
        totalActiveDeals,
      };
    },
  });
}
