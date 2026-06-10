import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computePlacementScore } from "@/lib/placement-score";

export type BillerItem = {
  id: string;
  title: string;       // main line e.g. "James Chen → Senior DevOps at Acme"
  sub?: string;        // secondary line e.g. "At offer — day 4"
  signal?: string;     // urgent signal line
  action: string;      // single action
  href?: string;       // optional link target
  urgency: number;     // for sorting
};

export type BillersWorkflowData = {
  closestToBilling: BillerItem[];
  chaseSubmissions: BillerItem[];
  readyToSend: BillerItem[];
  fillPipeline: BillerItem[];
  protectRelationships: BillerItem[];
};

const ACTIVE_STAGES = ["Longlist","Contact","Screening","Shortlist","Submitted","Client Review","First Interview","Second Interview","Offer"];
const SUBMITTED_STAGES = new Set(["Submitted","Client Review"]);

function daysSince(iso?: string | null): number {
  if (!iso) return 9999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function useBillersWorkflow(viewUserId?: string | null) {
  return useQuery({
    queryKey: ["billers-workflow", viewUserId || "me"],
    staleTime: 30_000,
    queryFn: async (): Promise<BillersWorkflowData> => {
      const [cjRes, jobsRes, clientsRes, candsRes, contactsRes, notesRes, jobTagsRes, candTagsRes, poolsRes, poolMembersRes] = await Promise.all([
        supabase.from("candidate_jobs").select("id,candidate_id,job_id,stage,stage_changed_at,created_at,owner_user_id"),
        supabase.from("jobs").select("id,title,status,client_id,owner_user_id,clients(company_name,contact_name)"),
        supabase.from("clients").select("id,company_name,contact_name,status,heat,next_action,next_action_due_date,next_followup_date,last_activity_date,owner_user_id"),
        supabase.from("candidates").select("id,name,job_title,status,reengage_date,priority_followup_date,owner_user_id"),
        supabase.from("contacts").select("id,name,client_id,status,reengage_date"),
        supabase.from("notes").select("id,candidate_id,client_id,activity_type,content,created_at,follow_up_date").order("created_at", { ascending: false }).limit(1500),
        supabase.from("job_tags").select("job_id,tag_definition_id"),
        supabase.from("candidate_tags").select("candidate_id,tag_definition_id"),
        supabase.from("talent_pools" as any).select("id,name,description,owner_user_id"),
        supabase.from("candidate_talent_pools" as any).select("candidate_id,pool_id,owner_user_id"),
      ]);

      const filterOwner = (rows: any[] | null): any[] =>
        (rows || []).filter((r: any) => !viewUserId || r.owner_user_id === viewUserId);

      const cjs = filterOwner(cjRes.data as any);
      const jobs = filterOwner(jobsRes.data as any);
      const clients = filterOwner(clientsRes.data as any);
      const candidates = filterOwner(candsRes.data as any);
      const contacts = (contactsRes.data || []);
      const notes = notesRes.data || [];
      const jobTags = jobTagsRes.data || [];
      const candTags = candTagsRes.data || [];

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

      // ============ SECTION 1: Closest to billing ============
      const closestToBilling: BillerItem[] = [];
      for (const cj of cjs) {
        if (!activeJobIds.has(cj.job_id)) continue;
        const job = jobById.get(cj.job_id) as any;
        const cand = candById.get(cj.candidate_id) as any;
        if (!job || !cand) continue;
        const company = job.clients?.company_name || "—";
        const stageDays = daysSince(cj.stage_changed_at || cj.created_at);

        if (cj.stage === "Offer") {
          closestToBilling.push({
            id: cj.id,
            title: `${cand.name} → ${job.title} at ${company}`,
            sub: `At offer — day ${stageDays}`,
            signal: stageDays >= 3 ? "⚠️ Counter offer risk — close out fast" : undefined,
            action: "Call candidate today — confirm acceptance",
            href: `/jobs`,
            urgency: 100 + stageDays,
          });
        } else if (cj.stage === "Second Interview") {
          closestToBilling.push({
            id: cj.id,
            title: `${cand.name} → ${job.title} at ${company}`,
            sub: `At 2nd interview — day ${stageDays}`,
            action: "Prep candidate + chase client decision",
            href: `/jobs`,
            urgency: 80 + Math.min(stageDays, 20),
          });
        } else if (cj.stage === "First Interview" && stageDays >= 2) {
          closestToBilling.push({
            id: cj.id,
            title: `${cand.name} → ${job.title} at ${company}`,
            sub: `1st interview feedback — ${stageDays}d overdue`,
            signal: "Feedback gone cold",
            action: `Chase ${job.clients?.contact_name || "client"} for feedback`,
            href: `/jobs`,
            urgency: 60 + stageDays,
          });
        }
      }
      closestToBilling.sort((a, b) => b.urgency - a.urgency);

      // ============ SECTION 2a: Chase existing submissions ============
      const chaseMap = new Map<string, { job: any; count: number; lastDays: number }>();
      for (const cj of cjs) {
        if (!SUBMITTED_STAGES.has(cj.stage)) continue;
        if (!activeJobIds.has(cj.job_id)) continue;
        const job = jobById.get(cj.job_id) as any;
        if (!job) continue;
        const lastNote = lastClientNote.get(job.client_id);
        const lastDays = daysSince(lastNote?.created_at);
        if (lastDays < 5) continue;
        const cur = chaseMap.get(cj.job_id) || { job, count: 0, lastDays };
        cur.count += 1;
        cur.lastDays = Math.max(cur.lastDays, lastDays);
        chaseMap.set(cj.job_id, cur);
      }
      const chaseSubmissions: BillerItem[] = Array.from(chaseMap.values()).map(({ job, count, lastDays }) => ({
        id: job.id,
        title: `${job.title} at ${job.clients?.company_name || "—"}`,
        sub: `${count} CV${count > 1 ? "s" : ""} submitted · ${lastDays}d since feedback`,
        action: `Chase ${job.clients?.contact_name || "client"} today`,
        href: `/jobs`,
        urgency: lastDays,
      })).sort((a, b) => b.urgency - a.urgency);

      // ============ SECTION 2b: Ready to send (Shortlist, not submitted) ============
      const candsAlreadySubmittedPerJob = new Set<string>();
      for (const cj of cjs) {
        if (SUBMITTED_STAGES.has(cj.stage) || ["First Interview","Second Interview","Offer","Placed"].includes(cj.stage)) {
          candsAlreadySubmittedPerJob.add(`${cj.candidate_id}:${cj.job_id}`);
        }
      }
      const readyToSend: BillerItem[] = [];
      for (const cj of cjs) {
        if (cj.stage !== "Shortlist") continue;
        if (!activeJobIds.has(cj.job_id)) continue;
        if (candsAlreadySubmittedPerJob.has(`${cj.candidate_id}:${cj.job_id}`)) continue;
        const job = jobById.get(cj.job_id) as any;
        const cand = candById.get(cj.candidate_id) as any;
        if (!job || !cand) continue;
        const fit = cand.job_title && job.title?.toLowerCase().includes((cand.job_title || "").toLowerCase().split(" ")[0])
          ? `Background matches: ${cand.job_title}`
          : `Shortlisted for ${job.title}`;
        readyToSend.push({
          id: cj.id,
          title: cand.name,
          sub: `${job.title} at ${job.clients?.company_name || "—"}`,
          signal: fit,
          action: "Send CV now",
          href: `/jobs`,
          urgency: daysSince(cj.stage_changed_at || cj.created_at),
        });
      }
      readyToSend.sort((a, b) => b.urgency - a.urgency);

      // ============ SECTION 3: Fill the pipeline ============
      const fillPipeline: BillerItem[] = [];
      // Group cjs by job for active stages
      const activeByJob = new Map<string, any[]>();
      for (const cj of cjs) {
        if (!ACTIVE_STAGES.includes(cj.stage)) continue;
        const arr = activeByJob.get(cj.job_id) || [];
        arr.push(cj);
        activeByJob.set(cj.job_id, arr);
      }
      // Build tag pool: for each job tag, which candidates share that tag
      const candidatesByTag = new Map<string, Set<string>>();
      for (const ct of candTags as any[]) {
        const s = candidatesByTag.get(ct.tag_definition_id) || new Set();
        s.add(ct.candidate_id);
        candidatesByTag.set(ct.tag_definition_id, s);
      }
      const tagsByJob = new Map<string, string[]>();
      for (const jt of jobTags as any[]) {
        const arr = tagsByJob.get(jt.job_id) || [];
        arr.push(jt.tag_definition_id);
        tagsByJob.set(jt.job_id, arr);
      }
      for (const job of jobs as any[]) {
        if (job.status !== "Active") continue;
        const active = activeByJob.get(job.id) || [];
        const onJobIds = new Set(active.map((cj: any) => cj.candidate_id));
        let score: any = null;
        try {
          score = computePlacementScore({
            job, candidateJobs: active, clientNotes: [], allNotesByCandidate: {} as any,
          } as any);
        } catch {}
        const probability = score?.score ?? (active.length === 0 ? 15 : active.length === 1 ? 35 : 60);
        const needs = active.length === 0 || active.length === 1 || probability < 40;
        if (!needs) continue;

        // Find pool match first: any pool whose name/description keywords appear in job title
        const pools = filterOwner(poolsRes.data as any);
        const poolMembers = filterOwner(poolMembersRes.data as any);
        const jobTitleLower = (job.title || "").toLowerCase();
        let matchName: string | null = null;
        let matchPool: string | null = null;
        for (const pool of pools as any[]) {
          const tokens = `${pool.name || ""} ${pool.description || ""}`.toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
          const overlaps = tokens.some((t: string) => jobTitleLower.includes(t));
          if (!overlaps) continue;
          const memberIds = (poolMembers as any[]).filter((m) => m.pool_id === pool.id).map((m) => m.candidate_id);
          for (const cid of memberIds) {
            if (onJobIds.has(cid)) continue;
            const c = candById.get(cid) as any;
            if (c && (c.status === "Active" || c.status === "Passive")) {
              matchName = c.name;
              matchPool = pool.name;
              break;
            }
          }
          if (matchName) break;
        }
        // Fallback: shared-tag match
        if (!matchName) {
          const jobTagIds = tagsByJob.get(job.id) || [];
          for (const tid of jobTagIds) {
            const candIds = candidatesByTag.get(tid);
            if (!candIds) continue;
            for (const cid of candIds) {
              if (onJobIds.has(cid)) continue;
              const c = candById.get(cid) as any;
              if (c && (c.status === "Active" || c.status === "Passive")) { matchName = c.name; break; }
            }
            if (matchName) break;
          }
        }

        fillPipeline.push({
          id: job.id,
          title: `${job.title} at ${job.clients?.company_name || "—"}`,
          sub: `${active.length} candidate${active.length === 1 ? "" : "s"} · ${probability}% probability`,
          signal: matchName ? (matchPool ? `Pool match in ${matchPool}: ${matchName}` : `Pool match: ${matchName}`) : undefined,
          action: matchName
            ? `Add ${matchName} to pipeline`
            : `Source 2–3 ${job.title} candidates this week`,
          href: `/jobs`,
          urgency: (100 - probability) + (active.length === 0 ? 20 : 0),
        });
      }
      fillPipeline.sort((a, b) => b.urgency - a.urgency);

      // ============ SECTION 4: Protect relationships ============
      const today = new Date().toISOString().split("T")[0];
      const protectRelationships: BillerItem[] = [];

      // Terms Sent, no response 5+ days
      for (const cl of clients as any[]) {
        if (cl.status !== "Terms Sent") continue;
        const note = lastClientNote.get(cl.id);
        const d = daysSince(note?.created_at || cl.last_activity_date);
        if (d < 5) continue;
        protectRelationships.push({
          id: `terms-${cl.id}`,
          title: `${cl.company_name}${cl.contact_name ? ` · ${cl.contact_name}` : ""}`,
          sub: `Terms sent · ${d}d no response`,
          signal: "Deal going cold",
          action: "Chase today",
          href: `/clients`,
          urgency: 100 + d,
        });
      }
      // Hot BD overdue
      for (const cl of clients as any[]) {
        if (cl.heat !== "Hot") continue;
        const fud = cl.next_action_due_date || cl.next_followup_date;
        if (!fud || fud >= today) continue;
        protectRelationships.push({
          id: `hot-${cl.id}`,
          title: `${cl.company_name}${cl.contact_name ? ` · ${cl.contact_name}` : ""}`,
          sub: `Hot BD · follow-up overdue ${daysSince(fud)}d`,
          action: "Call today",
          href: `/clients`,
          urgency: 80 + daysSince(fud),
        });
      }
      // Re-engage candidates due today
      for (const c of candidates as any[]) {
        if (!c.reengage_date || c.reengage_date > today) continue;
        protectRelationships.push({
          id: `reengage-${c.id}`,
          title: c.name,
          sub: `Re-engage date reached`,
          action: "They said get back in touch today",
          href: `/candidates`,
          urgency: 70,
        });
      }
      // Warm BD going cold (Warm, 14+ days)
      for (const cl of clients as any[]) {
        if (cl.heat !== "Warm") continue;
        const note = lastClientNote.get(cl.id);
        const d = daysSince(note?.created_at || cl.last_activity_date);
        if (d < 14) continue;
        protectRelationships.push({
          id: `warm-${cl.id}`,
          title: `${cl.company_name}${cl.contact_name ? ` · ${cl.contact_name}` : ""}`,
          sub: `Warm BD · ${d}d quiet`,
          action: "Touch base this week",
          href: `/clients`,
          urgency: 40 + Math.min(d, 30),
        });
      }
      protectRelationships.sort((a, b) => b.urgency - a.urgency);

      return {
        closestToBilling,
        chaseSubmissions,
        readyToSend,
        fillPipeline,
        protectRelationships: protectRelationships.slice(0, 20),
      };
    },
  });
}
