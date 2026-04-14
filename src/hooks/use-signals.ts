import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CallSignal = {
  id: string;
  note_id: string;
  signal_type: string;
  trigger_phrase: string;
  explanation: string;
  suggested_action: string;
  status: string;
  created_at: string;
};

export function useSignalsForNote(noteId: string | undefined) {
  return useQuery({
    queryKey: ["call-signals", noteId],
    enabled: !!noteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_signals" as any)
        .select("*")
        .eq("note_id", noteId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as CallSignal[];
    },
  });
}

export function useAllUnactionedSignals() {
  return useQuery({
    queryKey: ["call-signals-unactioned"],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data, error } = await supabase
        .from("call_signals" as any)
        .select("*")
        .eq("status", "unactioned")
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CallSignal[];
    },
  });
}

export function useSignalCounts() {
  return useQuery({
    queryKey: ["call-signal-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_signals" as any)
        .select("note_id, status")
        .eq("status", "unactioned");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const s of (data || []) as any[]) {
        counts[s.note_id] = (counts[s.note_id] || 0) + 1;
      }
      return counts;
    },
  });
}

export function useUpdateSignalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("call_signals" as any)
        .update({ status } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-signals"] });
      qc.invalidateQueries({ queryKey: ["call-signals-unactioned"] });
      qc.invalidateQueries({ queryKey: ["call-signal-counts"] });
    },
  });
}

export function useDetectSignals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { data, error } = await supabase.functions.invoke("detect-signals", {
        body: { note_id: noteId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-signals"] });
      qc.invalidateQueries({ queryKey: ["call-signal-counts"] });
      qc.invalidateQueries({ queryKey: ["call-signals-unactioned"] });
    },
  });
}
