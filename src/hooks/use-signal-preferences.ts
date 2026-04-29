import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_ENABLED_SIGNALS,
  DEFAULT_ENABLED_CATEGORIES,
  SignalCategoryKey,
} from "@/lib/signal-categories";

export type SignalPreferences = {
  daily_limit: number;
  enabled_signals: Record<string, boolean>;
  enabled_categories: Record<SignalCategoryKey, boolean>;
  show_low_confidence: boolean;
};

const DEFAULTS: SignalPreferences = {
  daily_limit: 8,
  enabled_signals: DEFAULT_ENABLED_SIGNALS,
  enabled_categories: DEFAULT_ENABLED_CATEGORIES,
  show_low_confidence: false,
};

export function useSignalPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["signal-preferences", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<SignalPreferences> => {
      const { data, error } = await supabase
        .from("signal_preferences" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      if (!data) return DEFAULTS;
      const row: any = data;
      return {
        daily_limit: row.daily_limit ?? DEFAULTS.daily_limit,
        enabled_signals: { ...DEFAULTS.enabled_signals, ...(row.enabled_signals || {}) },
        enabled_categories: { ...DEFAULTS.enabled_categories, ...(row.enabled_categories || {}) },
        show_low_confidence: row.show_low_confidence ?? false,
      };
    },
  });
}

export function useUpdateSignalPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: Partial<SignalPreferences>) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("signal_preferences" as any)
        .upsert(
          {
            user_id: user.id,
            ...prefs,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signal-preferences"] });
    },
  });
}
