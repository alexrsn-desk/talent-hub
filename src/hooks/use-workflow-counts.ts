import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const daysSince = (iso?: string | null) =>
  !iso ? 9999 : Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

/** Counts shown as badges on the workflow cards. */
export function useWorkflowCounts() {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["workflow-counts", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [jobsRes, cjRes, clientsRes, notesRes] = await Promise.all([
        supabase.from("jobs").select("id,status,client_id,search_launched_at,launch_ignored_at").eq("owner_user_id", user!.id),
        supabase.from("candidate_jobs").select("job_id,stage").eq("owner_user_id", user!.id),
        supabase.from("clients").select("id,status,last_activity_date").eq("owner_user_id", user!.id),
        supabase.from("notes").select("client_id,created_at").order("created_at", { ascending: false }).limit(1500),
      ]);
      const jobs = jobsRes.data || [];
      const cj = cjRes.data || [];
      const clients = clientsRes.data || [];

      const activeJobs = jobs.filter((j: any) => j.status === "Active");
      const jobLaunch = activeJobs.filter((j: any) => !j.search_launched_at && !j.launch_ignored_at).length;

      const byJob = new Map<string, string[]>();
      for (const l of cj as any[]) {
        const a = byJob.get(l.job_id) || [];
        a.push(l.stage);
        byJob.set(l.job_id, a);
      }
      let compare = 0;
      for (const j of activeJobs as any[]) {
        const stages = byJob.get(j.id) || [];
        if (stages.includes("Shortlist") && !stages.includes("Sent CV")) compare++;
      }

      // Reactivation: clients with no live role who have gone quiet.
      const liveClientIds = new Set(activeJobs.map((j: any) => j.client_id).filter(Boolean));
      const lastClientNote = new Map<string, string>();
      for (const n of (notesRes.data || []) as any[]) {
        if (n.client_id && !lastClientNote.has(n.client_id)) lastClientNote.set(n.client_id, n.created_at);
      }
      let reactivation = 0;
      for (const c of clients as any[]) {
        if (liveClientIds.has(c.id)) continue;
        const last = lastClientNote.get(c.id) || c.last_activity_date;
        if (daysSince(last) >= 42) reactivation++;
      }

      return { jobLaunch, compare, reactivation };
    },
  });

  return {
    jobLaunch: q.data?.jobLaunch ?? 0,
    compare: q.data?.compare ?? 0,
    reactivation: q.data?.reactivation ?? 0,
  };
}
