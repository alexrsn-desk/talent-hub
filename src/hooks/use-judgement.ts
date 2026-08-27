import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CallTranscript {
  id: string;
  candidate_id: string | null;
  source: string;
  content: string;
  duration_minutes: number | null;
  call_date: string;
  extraction_status: string;
  created_at: string;
}

export interface ImpactClaim {
  id: string;
  candidate_id: string;
  transcript_id: string | null;
  what_they_did: string;
  claimed_impact: string | null;
  specificity: "high" | "medium" | "low";
  created_at: string;
}

export interface CandidateJudgement {
  id: string;
  candidate_id: string;
  summary: string | null;
  evidence_meta: Record<string, any>;
  low_specificity_flag: boolean;
  generated_at: string;
}

export interface JobJudgement {
  candidate_id: string;
  job_id: string;
  score: number | null;
  reasoning: string | null;
  evidence_level: string;
  dealbreaker: string | null;
  generated_at: string;
}

export function useCallTranscripts(candidateId?: string) {
  return useQuery({
    queryKey: ["call_transcripts", candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_transcripts")
        .select("*")
        .eq("candidate_id", candidateId!)
        .order("call_date", { ascending: false });
      if (error) throw error;
      return (data || []) as CallTranscript[];
    },
  });
}

export function useImpactClaims(candidateId?: string) {
  return useQuery({
    queryKey: ["candidate_impact_claims", candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_impact_claims")
        .select("*")
        .eq("candidate_id", candidateId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ImpactClaim[];
    },
  });
}

export function useCandidateJudgement(candidateId?: string) {
  return useQuery({
    queryKey: ["candidate_judgement", candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_judgements")
        .select("*")
        .eq("candidate_id", candidateId!)
        .maybeSingle();
      if (error) throw error;
      return (data as CandidateJudgement) || null;
    },
  });
}

/** Log a call (any source) then run impact extraction + summary regeneration. */
export function useLogCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      candidate_id: string;
      content: string;
      call_date: string;
      duration_minutes?: number | null;
      source?: string;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("call_transcripts")
        .insert({
          candidate_id: input.candidate_id,
          content: input.content,
          call_date: input.call_date,
          duration_minutes: input.duration_minutes ?? null,
          source: input.source || "manual",
          user_id: userRes?.user?.id as string,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { data: fnData, error: fnErr } = await supabase.functions.invoke("judgement-extract", {
        body: { transcript_id: data.id },
      });
      if (fnErr) throw fnErr;
      if ((fnData as any)?.error) throw new Error((fnData as any).error);
      return fnData;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["call_transcripts", vars.candidate_id] });
      qc.invalidateQueries({ queryKey: ["candidate_impact_claims", vars.candidate_id] });
      qc.invalidateQueries({ queryKey: ["candidate_judgement", vars.candidate_id] });
    },
  });
}

export function useRegenerateJudgement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidateId: string) => {
      const { data, error } = await supabase.functions.invoke("judgement-summary", {
        body: { candidate_id: candidateId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_d, candidateId) => {
      qc.invalidateQueries({ queryKey: ["candidate_judgement", candidateId] });
    },
  });
}

/** Existing per-job judgement scores, keyed by candidate id. */
export function useJobJudgements(jobId?: string) {
  return useQuery({
    queryKey: ["job_judgements", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_job_judgements")
        .select("candidate_id, job_id, score, reasoning, evidence_level, dealbreaker, generated_at")
        .eq("job_id", jobId!);
      if (error) throw error;
      const map: Record<string, JobJudgement> = {};
      for (const r of (data || []) as JobJudgement[]) map[r.candidate_id] = r;
      return map;
    },
  });
}

export function useRunJobJudgements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { job_id: string; candidate_ids: string[] }) => {
      const { data, error } = await supabase.functions.invoke("judgement-score", { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { judgements: JobJudgement[] };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["job_judgements", vars.job_id] });
    },
  });
}
