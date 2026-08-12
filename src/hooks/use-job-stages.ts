import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type JobStage = {
  id: string;
  job_id: string;
  stage_name: string;
  stage_order: number;
  is_system_stage: boolean;
  created_at: string;
};

export const WITHDRAWN_STAGE = "Rejected / Withdrawn";

// Fallback used only while stages load or if a job has none yet.
export const FALLBACK_STAGES = [
  "AI Suggested",
  "Shortlist",
  "Sent CV",
  "First Stage",
  "Second Stage",
  "Final Stage",
  "Offer",
  "Placed",
];

export function useJobStages(jobId: string | undefined) {
  return useQuery({
    queryKey: ["job-stages", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_stages")
        .select("*")
        .eq("job_id", jobId!)
        .order("stage_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as JobStage[];
    },
  });
}

function useInvalidate(jobId: string | undefined) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["job-stages", jobId] });
}

export function useAddJobStage(jobId: string) {
  const invalidate = useInvalidate(jobId);
  return useMutation({
    mutationFn: async ({ stage_name, stage_order }: { stage_name: string; stage_order: number }) => {
      const { error } = await supabase
        .from("job_stages")
        .insert({ job_id: jobId, stage_name, stage_order, is_system_stage: false });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRenameJobStage(jobId: string) {
  const invalidate = useInvalidate(jobId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage_name, oldName }: { id: string; stage_name: string; oldName: string }) => {
      const { error } = await supabase.from("job_stages").update({ stage_name }).eq("id", id);
      if (error) throw error;
      // Keep candidates in the renamed column
      const { error: cjError } = await supabase
        .from("candidate_jobs")
        .update({ stage: stage_name })
        .eq("job_id", jobId)
        .eq("stage", oldName);
      if (cjError) throw cjError;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["candidate-jobs"] });
    },
  });
}

export function useDeleteJobStage(jobId: string) {
  const invalidate = useInvalidate(jobId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("job_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useReorderJobStages(jobId: string) {
  const invalidate = useInvalidate(jobId);
  return useMutation({
    mutationFn: async (ordered: { id: string; stage_order: number }[]) => {
      for (const row of ordered) {
        const { error } = await supabase
          .from("job_stages")
          .update({ stage_order: row.stage_order })
          .eq("id", row.id);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });
}
