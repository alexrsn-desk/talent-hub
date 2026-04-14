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
  feedback_rating: string | null;
  feedback_at: string | null;
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

export function useSignalPerformance() {
  return useQuery({
    queryKey: ["signal-performance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_signals" as any)
        .select("signal_type, feedback_rating");
      if (error) throw error;
      const stats: Record<string, { total: number; up: number; down: number }> = {};
      for (const s of (data || []) as any[]) {
        if (!stats[s.signal_type]) stats[s.signal_type] = { total: 0, up: 0, down: 0 };
        stats[s.signal_type].total++;
        if (s.feedback_rating === "thumbs_up") stats[s.signal_type].up++;
        if (s.feedback_rating === "thumbs_down") stats[s.signal_type].down++;
      }
      return Object.entries(stats)
        .map(([type, s]) => ({
          type,
          total: s.total,
          up: s.up,
          upPct: s.total > 0 ? Math.round((s.up / s.total) * 100) : 0,
          down: s.down,
          downPct: s.total > 0 ? Math.round((s.down / s.total) * 100) : 0,
        }))
        .sort((a, b) => b.downPct - a.downPct);
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

export function useFeedbackSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, rating }: { id: string; rating: "thumbs_up" | "thumbs_down" }) => {
      const updates: any = {
        feedback_rating: rating,
        feedback_at: new Date().toISOString(),
      };
      // Thumbs down also dismisses
      if (rating === "thumbs_down") {
        updates.status = "dismissed";
      }
      const { error } = await supabase
        .from("call_signals" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-signals"] });
      qc.invalidateQueries({ queryKey: ["call-signals-unactioned"] });
      qc.invalidateQueries({ queryKey: ["call-signal-counts"] });
      qc.invalidateQueries({ queryKey: ["signal-performance"] });
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
