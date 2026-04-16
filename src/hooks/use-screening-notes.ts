import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ScreeningNote {
  id: string;
  candidate_job_id: string;
  why_suitable: string | null;
  key_strengths: string | null;
  interest_level: string | null;
  salary_confirmed: number | null;
  availability_confirmed: string | null;
  notice_period_confirmed: string | null;
  concerns: string | null;
  questions_answered: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export function useScreeningNote(candidateJobId: string | undefined) {
  return useQuery({
    queryKey: ["screening_notes", candidateJobId],
    enabled: !!candidateJobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("screening_notes")
        .select("*")
        .eq("candidate_job_id", candidateJobId!)
        .maybeSingle();
      if (error) throw error;
      return data as ScreeningNote | null;
    },
  });
}

/** Fetch all screening notes for a candidate (for the "previously screened" reference). */
export function usePreviousScreeningNotes(candidateId: string | undefined, excludeCandidateJobId?: string) {
  return useQuery({
    queryKey: ["screening_notes", "previous", candidateId, excludeCandidateJobId],
    enabled: !!candidateId,
    queryFn: async () => {
      // Get all candidate_jobs for this candidate
      const { data: cjs, error: cjErr } = await supabase
        .from("candidate_jobs")
        .select("id, job_id, jobs(title, clients(company_name))")
        .eq("candidate_id", candidateId!);
      if (cjErr) throw cjErr;
      const ids = (cjs ?? []).map((c) => c.id).filter((id) => id !== excludeCandidateJobId);
      if (ids.length === 0) return [];

      const { data: notes, error } = await supabase
        .from("screening_notes")
        .select("*")
        .in("candidate_job_id", ids)
        .order("updated_at", { ascending: false });
      if (error) throw error;

      return (notes ?? []).map((n) => {
        const cj = cjs?.find((c) => c.id === n.candidate_job_id);
        return {
          ...(n as ScreeningNote),
          job_title: (cj?.jobs as any)?.title ?? "Previous role",
          company_name: (cj?.jobs as any)?.clients?.company_name ?? null,
        };
      });
    },
  });
}

export function useUpsertScreeningNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ScreeningNote> & { candidate_job_id: string }) => {
      const { data, error } = await supabase
        .from("screening_notes")
        .upsert(input, { onConflict: "candidate_job_id" })
        .select()
        .single();
      if (error) throw error;
      return data as ScreeningNote;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["screening_notes", data.candidate_job_id] });
      qc.invalidateQueries({ queryKey: ["screening_notes", "previous"] });
    },
  });
}
