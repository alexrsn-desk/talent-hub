import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type QuickNote = {
  id: string;
  owner_user_id: string;
  content: string;
  status: string; // 'inbox' | 'done'
  category: string; // 'inbox' | 'general'
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function useQuickNotes(
  status: "inbox" | "all" = "inbox",
  category?: "inbox" | "general"
) {
  return useQuery({
    queryKey: ["quick_notes", status, category ?? "any"],
    queryFn: async () => {
      let q = supabase.from("quick_notes").select("*").order("created_at", { ascending: false });
      if (status === "inbox") q = q.eq("status", "inbox");
      if (category) q = (q as any).eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      return data as QuickNote[];
    },
  });
}

export function useCreateQuickNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { content: string; category?: "inbox" | "general" }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const content = typeof input === "string" ? input : input.content;
      const category = typeof input === "string" ? "inbox" : (input.category ?? "inbox");
      const { data, error } = await supabase
        .from("quick_notes")
        .insert({ content, owner_user_id: user.id, category } as any)
        .select()
        .single();
      if (error) throw error;
      return data as QuickNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick_notes"] }),
  });
}

export function useUpdateQuickNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<QuickNote> & { id: string }) => {
      const { data, error } = await supabase
        .from("quick_notes")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as QuickNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick_notes"] }),
  });
}

export function useDeleteQuickNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick_notes"] }),
  });
}

// Records added quickly that need full profile completion
export function useIncompleteRecords() {
  return useQuery({
    queryKey: ["incomplete_records"],
    queryFn: async () => {
      const [c, cl, co, j] = await Promise.all([
        supabase.from("candidates").select("id,name,job_title,current_employer,created_at").eq("incomplete_profile", true).order("created_at", { ascending: false }),
        supabase.from("clients").select("id,company_name,sector,contact_name,created_at").eq("incomplete_profile", true).order("created_at", { ascending: false }),
        supabase.from("contacts").select("id,name,client_id,job_title,created_at").eq("incomplete_profile", true).order("created_at", { ascending: false }),
        supabase.from("jobs").select("id,title,client_id,created_at").eq("incomplete_profile", true).order("created_at", { ascending: false }),
      ]);
      return {
        candidates: (c.data || []) as any[],
        clients: (cl.data || []) as any[],
        contacts: (co.data || []) as any[],
        jobs: (j.data || []) as any[],
      };
    },
  });
}

export async function markRecordComplete(table: "candidates" | "clients" | "contacts" | "jobs", id: string) {
  await supabase.from(table).update({ incomplete_profile: false }).eq("id", id);
}
