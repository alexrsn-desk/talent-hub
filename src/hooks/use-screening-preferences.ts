import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ScreeningSection = {
  key: string;
  name: string;
  enabled: boolean;
  format: "paragraphs" | "bullets" | "sentence" | "free";
  length: "brief" | "standard" | "detailed";
  required: boolean;
};

export interface ScreeningPreferences {
  id: string;
  user_id: string;
  sections: ScreeningSection[];
  tone: "formal" | "direct" | "warm" | "match_examples";
  pov: "first_person" | "third_person";
  length: "brief" | "standard" | "detailed";
  examples: string[];
  updated_at: string;
}

export const DEFAULT_SECTIONS: ScreeningSection[] = [
  { key: "why_suitable", name: "Why suitable for this role", enabled: true, format: "paragraphs", length: "standard", required: true },
  { key: "key_strengths", name: "Key strengths for this role", enabled: true, format: "bullets", length: "standard", required: true },
  { key: "interest_level", name: "Interest level assessment", enabled: true, format: "sentence", length: "brief", required: true },
  { key: "concerns", name: "Concerns and risks", enabled: true, format: "paragraphs", length: "brief", required: true },
  { key: "practical_details", name: "Salary and practical details", enabled: true, format: "free", length: "brief", required: false },
  { key: "cultural_fit", name: "Cultural fit notes", enabled: false, format: "paragraphs", length: "brief", required: false },
  { key: "relevant_experience", name: "Previous relevant experience", enabled: false, format: "paragraphs", length: "standard", required: false },
  { key: "candidate_words", name: "Candidate's own words", enabled: false, format: "bullets", length: "brief", required: false },
];

export function useScreeningPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["screening_preferences", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ScreeningPreferences | null> => {
      const { data, error } = await supabase
        .from("screening_preferences" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });
}

export function useUpsertScreeningPreferences() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<ScreeningPreferences>) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("screening_preferences" as any)
        .upsert({ user_id: user.id, ...input } as any, { onConflict: "user_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screening_preferences"] });
    },
  });
}
