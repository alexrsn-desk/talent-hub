import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DecayAlert = {
  id: string;
  owner_user_id: string;
  entity_type: "client" | "contact";
  entity_id: string;
  relationship_kind: "key" | "active" | "bd" | "general";
  status: "pending" | "due" | "at_risk" | "critical" | "resolved" | "dismissed";
  days_since_contact: number;
  threshold_days: number;
  reason: string | null;
  reason_source: string | null;
  suggested_approach: string | null;
  channel_suggestion: string | null;
  reason_generated_at: string | null;
  snoozed_until: string | null;
  last_scanned_at: string;
  surfaced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DecaySettings = {
  id?: string;
  user_id?: string;
  threshold_key: number;
  threshold_active: number;
  threshold_bd: number;
  threshold_general: number;
  enabled: boolean;
};

export function useDecayAlerts() {
  return useQuery({
    queryKey: ["decay_alerts"],
    queryFn: async (): Promise<DecayAlert[]> => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("decay_alerts")
        .select("*")
        .in("status", ["due", "at_risk", "critical"])
        .or(`snoozed_until.is.null,snoozed_until.lt.${today}`)
        .order("days_since_contact", { ascending: false });
      if (error) throw error;
      return (data || []) as DecayAlert[];
    },
  });
}

export function useDecayAlertForEntity(entityType: "client" | "contact", entityId: string | null | undefined) {
  return useQuery({
    queryKey: ["decay_alert", entityType, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<DecayAlert | null> => {
      const { data, error } = await supabase
        .from("decay_alerts")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!)
        .maybeSingle();
      if (error) throw error;
      return (data as DecayAlert) ?? null;
    },
  });
}

export function useRunDecayScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("decay-scan");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decay_alerts"] });
      qc.invalidateQueries({ queryKey: ["decay_alert"] });
    },
  });
}

export function useSnoozeDecayAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      const until = new Date();
      until.setDate(until.getDate() + days);
      const { error } = await supabase
        .from("decay_alerts")
        .update({ snoozed_until: until.toISOString().split("T")[0] })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decay_alerts"] });
      qc.invalidateQueries({ queryKey: ["decay_alert"] });
    },
  });
}

export function useResolveDecayAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("decay_alerts")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decay_alerts"] });
      qc.invalidateQueries({ queryKey: ["decay_alert"] });
    },
  });
}

export function useDecaySettings() {
  return useQuery({
    queryKey: ["decay_settings"],
    queryFn: async (): Promise<DecaySettings> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("decay_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as DecaySettings) ?? {
        threshold_key: 21,
        threshold_active: 14,
        threshold_bd: 30,
        threshold_general: 60,
        enabled: true,
      };
    },
  });
}

export function useSaveDecaySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: DecaySettings) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("decay_settings")
        .upsert({ ...settings, user_id: user.id }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["decay_settings"] }),
  });
}

export function decayStatusLabel(status: DecayAlert["status"]) {
  switch (status) {
    case "due": return { label: "Due", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "🟡" };
    case "at_risk": return { label: "At risk", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", dot: "🔴" };
    case "critical": return { label: "Critical", color: "text-red-300", bg: "bg-red-700/15", border: "border-red-700/40", dot: "🟥" };
    default: return { label: status, color: "text-muted-foreground", bg: "bg-muted/10", border: "border-border", dot: "•" };
  }
}
