import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBillersWorkflow } from "@/hooks/use-billers-workflow";

export function useWorkflowCounts() {
  const { user } = useAuth();
  const { data: bw } = useBillersWorkflow();

  const q = useQuery({
    queryKey: ["workflow-counts", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [jobsRes, cjRes] = await Promise.all([
        supabase.from("jobs").select("id,status,search_launched_at").eq("owner_user_id", user!.id),
        supabase.from("candidate_jobs").select("job_id,stage").eq("owner_user_id", user!.id),
      ]);
      const jobs = jobsRes.data || [];
      const cj = cjRes.data || [];

      const activeJobs = jobs.filter((j: any) => j.status === "Active");
      const jobLaunch = activeJobs.filter((j: any) => !j.search_launched_at).length;

      const byJob = new Map<string, string[]>();
      for (const l of cj as any[]) {
        const a = byJob.get(l.job_id) || [];
        a.push(l.stage);
        byJob.set(l.job_id, a);
      }
      let compare = 0;
      for (const j of activeJobs as any[]) {
        const stages = byJob.get(j.id) || [];
        const hasShortlist = stages.includes("Shortlist");
        const hasSubmitted = stages.some((s) => s === "Submitted" || s === "Client Review");
        if (hasShortlist && !hasSubmitted) compare++;
      }
      return { jobLaunch, compare };
    },
  });

  const reactivation = bw
    ? bw.feedTheBeast.filter((i: any) =>
        i.id.startsWith("ftb-bd") ||
        i.id.startsWith("ftb-warm") ||
        i.id.startsWith("ftb-ref") ||
        i.id.startsWith("ftb-silver")
      ).length
    : 0;

  return {
    jobLaunch: q.data?.jobLaunch ?? 0,
    compare: q.data?.compare ?? 0,
    reactivation,
  };
}
