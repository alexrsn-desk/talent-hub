import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BriefItem = {
  id: string;
  item_key: string;
  label: string;
  entity_type: string | null;
  entity_id: string | null;
  first_surfaced_at: string;
  last_shown_at: string | null;
  times_shown: number;
  suppressed: boolean;
  resolved_at: string | null;
};

/**
 * Items that have aged out of the brief text (shown twice with no change to the
 * underlying situation). They live on in AI Actions with "still open" framing.
 */
export function useAgedOutBriefItems() {
  return useQuery({
    queryKey: ["brief-items-aged-out"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brief_item_history" as any)
        .select("*")
        .eq("suppressed", true)
        .is("resolved_at", null)
        .order("first_surfaced_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as BriefItem[];
    },
  });
}

export function useResolveBriefItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("brief_item_history" as any)
        .update({ resolved_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brief-items-aged-out"] });
    },
  });
}
