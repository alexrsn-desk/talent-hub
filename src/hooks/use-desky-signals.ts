import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type DeskySignal = {
  id: string;
  user_id: string;
  person_id: string | null;
  person_type: "candidate" | "contact" | null;
  company_id: string | null;
  signal_type: string;
  previous_value: string | null;
  new_value: string | null;
  detected_at: string;
  provider: string;
  confidence: string;
  relationship_score: number;
  opportunity_score: number;
  reason_for_recommendation: string | null;
  suggested_action: string | null;
  status: "new" | "viewed" | "actioned" | "snoozed" | "dismissed";
  created_at: string;
};

export type SignalScoreSettings = {
  weights: Record<string, number>;
  monitor_top_percent: number;
  monitor_min_score: number;
  going_cold_days: number;
  anniversary_lookahead_days: number;
  anniversary_months: number;
};

export const DEFAULT_WEIGHTS: Record<string, number> = {
  placed: 30,
  client: 30,
  touchpoints: 20,
  hiring_manager: 20,
  revenue: 20,
  replied: 10,
  recent_contact: 10,
  linkedin_only: 2,
};

export const WEIGHT_LABELS: Record<string, string> = {
  placed: "Placed candidate",
  client: "Current or past client",
  touchpoints: "3+ logged touchpoints",
  hiring_manager: "Hiring manager / senior title",
  revenue: "Previously generated revenue",
  replied: "Has replied to outreach",
  recent_contact: "Contacted in last 12 months",
  linkedin_only: "LinkedIn connection only",
};

export const SIGNAL_TYPE_LABELS: Record<string, string> = {
  going_cold: "Relationship going cold",
  placement_anniversary: "Placement anniversary",
  follow_up_due: "Follow-up due",
  seniority_change: "Seniority change",
};

const DEFAULT_SETTINGS: SignalScoreSettings = {
  weights: DEFAULT_WEIGHTS,
  monitor_top_percent: 20,
  monitor_min_score: 40,
  going_cold_days: 180,
  anniversary_lookahead_days: 30,
  anniversary_months: 12,
};

export function useSignalScoreSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["signal-score-settings", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<SignalScoreSettings> => {
      const { data, error } = await supabase
        .from("signal_score_settings" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      const row: any = data;
      if (!row) return DEFAULT_SETTINGS;
      return {
        weights: { ...DEFAULT_WEIGHTS, ...(row.weights || {}) },
        monitor_top_percent: row.monitor_top_percent ?? 20,
        monitor_min_score: row.monitor_min_score ?? 40,
        going_cold_days: row.going_cold_days ?? 180,
        anniversary_lookahead_days: row.anniversary_lookahead_days ?? 30,
        anniversary_months: row.anniversary_months ?? 12,
      };
    },
  });
}

export function useUpdateSignalScoreSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<SignalScoreSettings>) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("signal_score_settings" as any)
        .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() } as any, {
          onConflict: "user_id",
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signal-score-settings"] }),
  });
}

/** Active (non-dismissed, non-actioned) signals, highest opportunity first. */
export function useDeskySignals() {
  return useQuery({
    queryKey: ["desky-signals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signals" as any)
        .select("*")
        .in("status", ["new", "viewed", "snoozed"])
        .order("opportunity_score", { ascending: false })
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DeskySignal[];
    },
  });
}

/** All signals for one person, for the profile timeline. */
export function usePersonSignals(personType: "candidate" | "contact", personId?: string) {
  return useQuery({
    queryKey: ["desky-signals-person", personType, personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signals" as any)
        .select("*")
        .eq("person_type", personType)
        .eq("person_id", personId!)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DeskySignal[];
    },
  });
}

export function useMonitoredCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["monitored-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const db = supabase as any;
      const [cands, cons] = await Promise.all([
        db
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .eq("owner_user_id", user!.id)
          .eq("monitored", true),
        db
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("owner_user_id", user!.id)
          .eq("monitored", true),
      ]);

      return (cands.count || 0) + (cons.count || 0);
    },
  });
}

/** Refreshes relationship scores, monitoring flags and generates internal signals. */
export function useRunSignalsScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("desky_signals_scan" as any);
      if (error) throw error;
      return data as { monitored: number; created: number; cutoff: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["desky-signals"] });
      qc.invalidateQueries({ queryKey: ["monitored-count"] });
    },
  });
}

export function useUpdateDeskySignalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DeskySignal["status"] }) => {
      const { error } = await supabase
        .from("signals" as any)
        .update({ status } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["desky-signals"] });
      qc.invalidateQueries({ queryKey: ["desky-signals-person"] });
    },
  });
}
