import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type CandidateSection = "all" | "pools" | "in-play" | "buckets";

export const SECTION_META: Record<CandidateSection, { label: string; path: string }> = {
  all: { label: "All Candidates", path: "/candidates?section=all" },
  pools: { label: "Talent Pools", path: "/candidates?section=pools" },
  "in-play": { label: "In Play", path: "/candidates?section=in-play" },
  buckets: { label: "Buckets", path: "/candidates?section=buckets" },
};

export function usePinnedSections() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pinned_candidate_sections", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiter_profiles")
        .select("pinned_candidate_sections")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return ((data?.pinned_candidate_sections as any as string[]) || []) as CandidateSection[];
    },
  });
}

export function useTogglePin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (section: CandidateSection) => {
      if (!user) throw new Error("Not signed in");
      const { data } = await supabase
        .from("recruiter_profiles")
        .select("pinned_candidate_sections")
        .eq("user_id", user.id)
        .maybeSingle();
      const current = ((data?.pinned_candidate_sections as any as string[]) || []) as CandidateSection[];
      const next = current.includes(section)
        ? current.filter((s) => s !== section)
        : [...current, section];
      const { error } = await supabase
        .from("recruiter_profiles")
        .update({ pinned_candidate_sections: next as any })
        .eq("user_id", user.id);
      if (error) throw error;
      return next;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pinned_candidate_sections"] }),
  });
}
