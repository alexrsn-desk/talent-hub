import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SavedSearch = {
  id: string;
  scope: "candidate" | "contact";
  name: string;
  query: string | null;
  filters: Record<string, any>;
  created_at: string;
};

export function useSavedSearches(scope: "candidate" | "contact") {
  return useQuery({
    queryKey: ["saved_searches", scope],
    queryFn: async (): Promise<SavedSearch[]> => {
      const { data, error } = await supabase
        .from("saved_searches" as any)
        .select("*")
        .eq("scope", scope)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

export function useCreateSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { scope: "candidate" | "contact"; name: string; query: string; filters: Record<string, any> }) => {
      const { data: u } = await supabase.auth.getUser();
      const owner_user_id = u.user?.id;
      if (!owner_user_id) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("saved_searches" as any)
        .insert([{ ...payload, owner_user_id }])
        .select()
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["saved_searches", vars.scope] }),
  });
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; scope: "candidate" | "contact" }) => {
      const { error } = await supabase.from("saved_searches" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["saved_searches", vars.scope] }),
  });
}
