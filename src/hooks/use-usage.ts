import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";

export type FeatureType =
  | "coach_query"
  | "signal_detection"
  | "call_summary"
  | "candidate_match"
  | "field_extraction"
  | "cv_parse"
  | "content_post";

export const FEATURE_LABELS: Record<FeatureType, string> = {
  coach_query: "Coach queries",
  signal_detection: "Signal detection",
  call_summary: "Call summaries",
  candidate_match: "Candidate matching",
  field_extraction: "Field extraction",
  cv_parse: "CV parsing",
  content_post: "Content posts",
};

const SOLO_LIMITS: Record<FeatureType, number> = {
  coach_query: 30,
  signal_detection: 20,
  call_summary: 10,
  candidate_match: 10,
  field_extraction: 10,
  cv_parse: 20,
  content_post: 4,
};

function getCurrentMonthYear() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysUntilReset() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function isInGracePeriod() {
  return daysUntilReset() <= 3;
}

function getResetDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

export type UserPlan = {
  plan_type: "solo" | "pro";
  status: "active" | "cancelled" | "trial";
  trial_ends_at: string | null;
  next_reset_date: string;
  grace_used_this_month: boolean;
};

export function useUserPlan() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_plan", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_plans" as any)
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error || !data) {
        // Create default plan if not exists
        const { data: newPlan } = await supabase
          .from("user_plans" as any)
          .insert({
            user_id: user!.id,
            plan_type: "solo",
            status: "trial",
            trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          } as any)
          .select()
          .single();
        return (newPlan as any) as UserPlan;
      }
      return (data as any) as UserPlan;
    },
  });
}

export function useUsageCounts() {
  const { user } = useAuth();
  const monthYear = getCurrentMonthYear();

  return useQuery({
    queryKey: ["usage_counts", user?.id, monthYear],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("usage_logs" as any)
        .select("feature_type")
        .eq("user_id", user!.id)
        .eq("month_year", monthYear)
        .eq("is_grace_extension", false);

      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        counts[row.feature_type] = (counts[row.feature_type] || 0) + 1;
      });
      return counts;
    },
  });
}

export function useGraceCount() {
  const { user } = useAuth();
  const monthYear = getCurrentMonthYear();

  return useQuery({
    queryKey: ["grace_count", user?.id, monthYear],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("usage_logs" as any)
        .select("feature_type")
        .eq("user_id", user!.id)
        .eq("month_year", monthYear)
        .eq("is_grace_extension", true);

      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        counts[row.feature_type] = (counts[row.feature_type] || 0) + 1;
      });
      return counts;
    },
  });
}

export function useFeatureLimit(featureType: FeatureType) {
  const { data: plan } = useUserPlan();
  const { data: counts = {} } = useUsageCounts();
  const { data: graceCounts = {} } = useGraceCount();

  return useMemo(() => {
    if (!plan) return { canUse: true, used: 0, limit: 0, isUnlimited: false, pctUsed: 0, daysUntilReset: daysUntilReset(), resetDate: getResetDate(), showWarning: false, graceGranted: false };

    const isTrialActive = plan.status === "trial" && plan.trial_ends_at && new Date(plan.trial_ends_at) > new Date();
    const isPro = plan.plan_type === "pro" || isTrialActive;

    if (isPro) {
      return { canUse: true, used: counts[featureType] || 0, limit: -1, isUnlimited: true, pctUsed: 0, daysUntilReset: daysUntilReset(), resetDate: getResetDate(), showWarning: false, graceGranted: false };
    }

    const limit = SOLO_LIMITS[featureType];
    const used = counts[featureType] || 0;
    const graceUsed = graceCounts[featureType] || 0;
    const graceLimit = Math.floor(limit * 0.5);
    const pctUsed = limit > 0 ? Math.round((used / limit) * 100) : 0;

    let canUse = used < limit;
    let graceGranted = false;

    if (!canUse && isInGracePeriod() && !plan.grace_used_this_month) {
      // Grace period: allow extra 50%
      canUse = graceUsed < graceLimit;
      graceGranted = true;
    }

    const showWarning = pctUsed >= 80 && pctUsed < 100;

    return { canUse, used, limit, isUnlimited: false, pctUsed, daysUntilReset: daysUntilReset(), resetDate: getResetDate(), showWarning, graceGranted };
  }, [plan, counts, graceCounts, featureType]);
}

export function useLogUsage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ featureType, tokenCount = 0, isGrace = false }: { featureType: FeatureType; tokenCount?: number; isGrace?: boolean }) => {
      if (!user) return;
      await supabase.from("usage_logs" as any).insert({
        user_id: user.id,
        feature_type: featureType,
        month_year: getCurrentMonthYear(),
        token_count: tokenCount,
        is_grace_extension: isGrace,
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usage_counts"] });
      qc.invalidateQueries({ queryKey: ["grace_count"] });
    },
  });
}

export function useTrialStatus() {
  const { data: plan } = useUserPlan();

  return useMemo(() => {
    if (!plan || plan.status !== "trial" || !plan.trial_ends_at) {
      return { isTrialing: false, daysLeft: 0, showBanner: false };
    }
    const endsAt = new Date(plan.trial_ends_at);
    const now = new Date();
    const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    return { isTrialing: daysLeft > 0, daysLeft, showBanner: daysLeft <= 3 && daysLeft > 0 };
  }, [plan]);
}

export function useAllUsageStats() {
  const { data: counts = {} } = useUsageCounts();
  const { data: plan } = useUserPlan();

  return useMemo(() => {
    const isTrialActive = plan?.status === "trial" && plan.trial_ends_at && new Date(plan.trial_ends_at) > new Date();
    const isPro = plan?.plan_type === "pro" || isTrialActive;

    return (Object.keys(SOLO_LIMITS) as FeatureType[]).map((ft) => {
      const used = counts[ft] || 0;
      const limit = isPro ? -1 : SOLO_LIMITS[ft];
      const remaining = limit === -1 ? -1 : Math.max(0, limit - used);
      const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
      return { feature: ft, label: FEATURE_LABELS[ft], used, limit, remaining, pct };
    });
  }, [counts, plan]);
}
