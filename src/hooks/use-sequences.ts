import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Sequence = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SequenceStep = {
  id: string;
  sequence_id: string;
  step_number: number;
  day_offset: number;
  channel: string;
  message_prompt: string | null;
  note: string | null;
};

export type SequenceEnrollment = {
  id: string;
  sequence_id: string;
  candidate_id: string | null;
  client_id: string | null;
  job_id: string | null;
  start_date: string;
  status: string;
  current_step: number;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  candidates?: { id: string; name: string } | null;
  jobs?: { id: string; title: string } | null;
};

export type SequenceTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  steps: Array<{
    step_number: number;
    day_offset: number;
    channel: string;
    message_prompt: string;
    note?: string;
  }>;
};

export function useSequences() {
  return useQuery({
    queryKey: ["sequences"],
    queryFn: async (): Promise<Sequence[]> => {
      const { data, error } = await supabase
        .from("sequences")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSequenceSteps(sequenceId: string | null) {
  return useQuery({
    queryKey: ["sequence_steps", sequenceId],
    enabled: !!sequenceId,
    queryFn: async (): Promise<SequenceStep[]> => {
      const { data, error } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", sequenceId!)
        .order("step_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSequenceEnrollments(sequenceId: string | null) {
  return useQuery({
    queryKey: ["sequence_enrollments", sequenceId],
    enabled: !!sequenceId,
    queryFn: async (): Promise<SequenceEnrollment[]> => {
      const { data, error } = await supabase
        .from("sequence_enrollments")
        .select("*, candidates(id,name), jobs(id,title)")
        .eq("sequence_id", sequenceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useSequenceTemplates() {
  return useQuery({
    queryKey: ["sequence_templates"],
    queryFn: async (): Promise<SequenceTemplate[]> => {
      const { data, error } = await supabase
        .from("sequence_templates")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useCreateSequenceFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; template?: SequenceTemplate | null }) => {
      const { data: seq, error } = await supabase
        .from("sequences")
        .insert({ name: input.name, description: input.description ?? null, type: "personal", status: "active" })
        .select()
        .single();
      if (error) throw error;

      if (input.template) {
        const rows = input.template.steps.map((s) => ({
          sequence_id: seq.id,
          step_number: s.step_number,
          day_offset: s.day_offset,
          channel: s.channel,
          message_prompt: s.message_prompt,
          note: s.note ?? null,
        }));
        const { error: stepErr } = await supabase.from("sequence_steps").insert(rows);
        if (stepErr) throw stepErr;
      }
      return seq;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sequences"] }),
  });
}

export function useDeleteSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sequences"] }),
  });
}

export type CandidateEnrollment = {
  id: string;
  sequence_id: string;
  candidate_id: string | null;
  job_id: string | null;
  start_date: string;
  status: string;
  current_step: number;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  sequences: {
    id: string;
    name: string;
    type: string;
  } | null;
  total_steps?: number;
};

export function useCandidateEnrollments(candidateId: string | null) {
  return useQuery({
    queryKey: ["candidate_enrollments", candidateId],
    enabled: !!candidateId,
    queryFn: async (): Promise<CandidateEnrollment[]> => {
      const { data, error } = await supabase
        .from("sequence_enrollments")
        .select("*, sequences(id,name,type)")
        .eq("candidate_id", candidateId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const enrollments = (data ?? []) as any[];
      // Fetch step counts per sequence
      const seqIds = Array.from(new Set(enrollments.map((e) => e.sequence_id)));
      if (seqIds.length === 0) return [];
      const { data: stepCounts } = await supabase
        .from("sequence_steps")
        .select("sequence_id")
        .in("sequence_id", seqIds);
      const counts = new Map<string, number>();
      (stepCounts ?? []).forEach((s: any) => {
        counts.set(s.sequence_id, (counts.get(s.sequence_id) ?? 0) + 1);
      });
      return enrollments.map((e) => ({ ...e, total_steps: counts.get(e.sequence_id) ?? 0 }));
    },
  });
}

export function useSequenceEnrollmentCounts() {
  return useQuery({
    queryKey: ["sequence_enrollment_counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("sequence_enrollments")
        .select("sequence_id")
        .eq("status", "active");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((e: any) => {
        counts[e.sequence_id] = (counts[e.sequence_id] ?? 0) + 1;
      });
      return counts;
    },
  });
}

export function useSequenceStepCounts() {
  return useQuery({
    queryKey: ["sequence_step_counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("sequence_steps").select("sequence_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((s: any) => {
        counts[s.sequence_id] = (counts[s.sequence_id] ?? 0) + 1;
      });
      return counts;
    },
  });
}

export function useRemoveEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("sequence_enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate_enrollments"] });
      qc.invalidateQueries({ queryKey: ["sequence_enrollment_counts"] });
    },
  });
}

export function useEnrollCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sequence_id: string;
      candidate_id: string;
      job_id?: string | null;
      start_date?: string;
    }) => {
      const startDate = input.start_date ?? new Date().toISOString().slice(0, 10);

      // Create enrollment
      const { data: enrollment, error } = await supabase
        .from("sequence_enrollments")
        .insert({
          sequence_id: input.sequence_id,
          candidate_id: input.candidate_id,
          job_id: input.job_id ?? null,
          start_date: startDate,
          status: "active",
          current_step: 1,
        })
        .select()
        .single();
      if (error) throw error;

      // Generate step logs from the sequence steps
      const { data: steps } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", input.sequence_id)
        .order("step_number", { ascending: true });

      if (steps && steps.length > 0) {
        const start = new Date(startDate);
        const logs = steps.map((s) => {
          const due = new Date(start);
          due.setDate(due.getDate() + (s.day_offset ?? 0));
          return {
            enrollment_id: enrollment.id,
            step_number: s.step_number,
            status: "pending",
            due_date: due.toISOString().slice(0, 10),
          };
        });
        await supabase.from("sequence_step_logs").insert(logs);
      }
      return enrollment;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["sequence_enrollments", vars.sequence_id] });
    },
  });
}
