import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ScreeningFrameworkItem {
  id: string;
  owner_user_id: string;
  candidate_id: string;
  section: number;
  item_key: string;
  value: string | null;
  notes: string | null;
  source: "manual" | "ai" | "transcript" | "import";
  source_note_id: string | null;
  captured_at: string;
  updated_at: string;
  created_at: string;
}

export function useScreeningFramework(candidateId: string | undefined) {
  return useQuery({
    queryKey: ["screening_framework", candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("screening_framework_items")
        .select("*")
        .eq("candidate_id", candidateId!)
        .order("section", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScreeningFrameworkItem[];
    },
  });
}

export function useUpsertScreeningItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      candidate_id: string;
      section: number;
      item_key: string;
      value?: string | null;
      notes?: string | null;
      source?: "manual" | "ai" | "transcript" | "import";
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch candidate owner so team members can write into their colleagues' candidates.
      const { data: cand, error: cErr } = await supabase
        .from("candidates")
        .select("owner_user_id")
        .eq("id", input.candidate_id)
        .maybeSingle();
      if (cErr) throw cErr;

      const payload = {
        owner_user_id: cand?.owner_user_id ?? user.id,
        candidate_id: input.candidate_id,
        section: input.section,
        item_key: input.item_key,
        value: input.value ?? null,
        notes: input.notes ?? null,
        source: input.source ?? "manual",
        captured_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("screening_framework_items")
        .upsert(payload, { onConflict: "candidate_id,item_key" })
        .select()
        .single();
      if (error) throw error;
      return data as ScreeningFrameworkItem;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["screening_framework", data.candidate_id] });
    },
  });
}

export function useClearScreeningItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { candidate_id: string; item_key: string }) => {
      const { error } = await supabase
        .from("screening_framework_items")
        .delete()
        .eq("candidate_id", input.candidate_id)
        .eq("item_key", input.item_key);
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: ["screening_framework", input.candidate_id] });
    },
  });
}
