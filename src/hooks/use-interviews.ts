import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Interview = {
  id: string;
  owner_user_id: string;
  candidate_id: string;
  job_id: string;
  candidate_job_id: string;
  stage: string;
  scheduled_at: string | null;
  duration_mins: number | null;
  format: string | null;
  location: string | null;
  interviewers: string | null;
  interview_type: string | null;
  prep_notes: string | null;
  recruiter_advice: string | null;
  details_captured_at: string | null;
  confirmation_sent_at: string | null;
  prep_sent_at: string | null;
  day_before_reminder_sent_at: string | null;
  morning_checkin_sent_at: string | null;
  candidate_feedback_logged_at: string | null;
  client_feedback_logged_at: string | null;
  client_chase_sent_at: string | null;
  feedback_chase_snoozed_until: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
};

export type InterviewSettings = {
  id: string;
  user_id: string;
  auto_send_confirmation: boolean;
  auto_send_reminder: boolean;
  day_before_reminder_time: string;
  morning_checkin_enabled: boolean;
  post_interview_delay_hours: number;
};

const KEY = ["interviews"];

export function useInterviews(filters?: { candidate_id?: string; job_id?: string }) {
  return useQuery({
    queryKey: [...KEY, filters ?? {}],
    queryFn: async () => {
      let q = supabase
        .from("interviews")
        .select("*, candidates(id,name,first_name,email,phone), jobs(id,title,clients(id,company_name)), interview_feedback(*)")
        .order("scheduled_at", { ascending: true, nullsFirst: false });
      if (filters?.candidate_id) q = q.eq("candidate_id", filters.candidate_id);
      if (filters?.job_id) q = q.eq("job_id", filters.job_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useInterview(id: string | null) {
  return useQuery({
    queryKey: [...KEY, id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interviews")
        .select("*, candidates(*), jobs(*, clients(*)), interview_feedback(*)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useInterviewByCandidateJob(candidate_job_id: string | null, stage: string | null) {
  return useQuery({
    queryKey: [...KEY, "by-cj", candidate_job_id, stage],
    enabled: !!candidate_job_id && !!stage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interviews")
        .select("*")
        .eq("candidate_job_id", candidate_job_id!)
        .eq("stage", stage!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Interview | null;
    },
  });
}

export function useUpdateInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Interview> & { id: string }) => {
      const { data, error } = await supabase.from("interviews").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data as Interview;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreateInterviewFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      interview_id: string;
      source?: "candidate" | "client";
      how_it_went?: string | null;
      key_points?: string | null;
      still_interested?: string | null;
      counter_offer_risk?: string | null;
      next_steps?: string | null;
      notes?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("interview_feedback")
        .insert({ ...payload, owner_user_id: user.id, source: payload.source ?? "candidate" })
        .select()
        .single();
      if (error) throw error;

      // Mark logged on parent interview
      const stamp = payload.source === "client" ? "client_feedback_logged_at" : "candidate_feedback_logged_at";
      await supabase.from("interviews").update({ [stamp]: new Date().toISOString() }).eq("id", payload.interview_id);

      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useInterviewSettings() {
  return useQuery({
    queryKey: ["interview_settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("interview_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as InterviewSettings | null;
    },
  });
}

export function useUpsertInterviewSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<InterviewSettings>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("interview_settings")
        .upsert({ user_id: user.id, ...updates }, { onConflict: "user_id" })
        .select()
        .single();
      if (error) throw error;
      return data as InterviewSettings;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["interview_settings"] }),
  });
}

// Coach-friendly upcoming interviews for the next 14 days
export function useUpcomingInterviews(days = 14) {
  return useQuery({
    queryKey: [...KEY, "upcoming", days],
    queryFn: async () => {
      const now = new Date();
      const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from("interviews")
        .select("*, candidates(id,name,first_name), jobs(id,title,clients(id,company_name))")
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", end.toISOString())
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
