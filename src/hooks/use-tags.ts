import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TagDefinition {
  id: string;
  category: string;
  label: string;
  position: number;
  archived: boolean;
  created_at: string;
}

export interface CandidateTag {
  id: string;
  candidate_id: string;
  tag_definition_id: string;
  source: string;
  confidence: string | null;
  created_at: string;
  tag_definitions?: TagDefinition;
}

export interface JobTag {
  id: string;
  job_id: string;
  tag_definition_id: string;
  created_at: string;
  tag_definitions?: TagDefinition;
}

export const TAG_CATEGORIES: Record<string, string> = {
  sector_preference: "Sector Preference",
  business_model: "Business Model",
  company_stage: "Company Stage",
  work_preference: "Work Preference",
  seniority_target: "Seniority Target",
  motivations: "Motivations",
  deal_breakers: "Deal Breakers",
};

export function useTagDefinitions() {
  return useQuery({
    queryKey: ["tag_definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tag_definitions")
        .select("*")
        .order("category")
        .order("position");
      if (error) throw error;
      return data as TagDefinition[];
    },
  });
}

export function useCandidateTags(candidateId: string) {
  return useQuery({
    queryKey: ["candidate_tags", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_tags")
        .select("*, tag_definitions(*)")
        .eq("candidate_id", candidateId);
      if (error) throw error;
      return data as CandidateTag[];
    },
    enabled: !!candidateId,
  });
}

export function useAddCandidateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { candidate_id: string; tag_definition_id: string; source?: string; confidence?: string }) => {
      const { error } = await supabase.from("candidate_tags").insert({
        candidate_id: params.candidate_id,
        tag_definition_id: params.tag_definition_id,
        source: params.source || "manual",
        confidence: params.confidence || null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["candidate_tags", vars.candidate_id] });
    },
  });
}

export function useRemoveCandidateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; candidate_id: string }) => {
      const { error } = await supabase.from("candidate_tags").delete().eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["candidate_tags", vars.candidate_id] });
    },
  });
}

export function useJobTags(jobId: string) {
  return useQuery({
    queryKey: ["job_tags", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_tags")
        .select("*, tag_definitions(*)")
        .eq("job_id", jobId);
      if (error) throw error;
      return data as JobTag[];
    },
    enabled: !!jobId,
  });
}

export function useAddJobTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { job_id: string; tag_definition_id: string }) => {
      const { error } = await supabase.from("job_tags").insert({
        job_id: params.job_id,
        tag_definition_id: params.tag_definition_id,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["job_tags", vars.job_id] });
    },
  });
}

export function useRemoveJobTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; job_id: string }) => {
      const { error } = await supabase.from("job_tags").delete().eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["job_tags", vars.job_id] });
    },
  });
}

export function useCreateTagDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { category: string; label: string; position?: number }) => {
      const { error } = await supabase.from("tag_definitions").insert({
        category: params.category,
        label: params.label,
        position: params.position || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tag_definitions"] });
    },
  });
}

export function useUpdateTagDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; label?: string; archived?: boolean }) => {
      const updates: any = {};
      if (params.label !== undefined) updates.label = params.label;
      if (params.archived !== undefined) updates.archived = params.archived;
      const { error } = await supabase.from("tag_definitions").update(updates).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tag_definitions"] });
    },
  });
}
