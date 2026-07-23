import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type StandardCategory = "marketing" | "bd" | "candidates" | "jobs";
export type TrackingMode = "auto" | "manual";
export type Unit = "count" | "percent" | "boolean";

export type StandardTarget = {
  id?: string;
  user_id?: string;
  category: StandardCategory;
  key: string;
  label: string;
  target_value: number;
  unit: Unit;
  tracking_mode: TrackingMode;
  auto_source?: string | null;
  enabled: boolean;
  sort_order: number;
};

export type StandardProgress = {
  target: StandardTarget;
  actual: number;
  pct: number; // 0..1 (or >1 if overachieved)
  expectedByNow: number; // 0..target_value
  behindPace: boolean;
  criticallyBehind: boolean;
  note?: string;
};

export type CategoryPlate = {
  category: StandardCategory;
  label: string;
  items: StandardProgress[];
  avgPct: number;
  behindPace: boolean;
  criticallyBehind: boolean;
};

export const DEFAULT_TARGETS: StandardTarget[] = [
  // Marketing
  { category: "marketing", key: "linkedin_posts", label: "LinkedIn content posts", target_value: 2, unit: "count", tracking_mode: "manual", enabled: true, sort_order: 0 },
  { category: "marketing", key: "job_ads_live", label: "Job ads live", target_value: 3, unit: "count", tracking_mode: "manual", enabled: true, sort_order: 1 },
  { category: "marketing", key: "linkedin_job_posts", label: "Jobs posted on LinkedIn", target_value: 2, unit: "count", tracking_mode: "manual", enabled: true, sort_order: 2 },
  { category: "marketing", key: "website_updated", label: "Website up to date", target_value: 1, unit: "boolean", tracking_mode: "manual", enabled: true, sort_order: 3 },
  { category: "marketing", key: "newsletter_sent", label: "Newsletter / email campaign sent", target_value: 1, unit: "boolean", tracking_mode: "manual", enabled: true, sort_order: 4 },
  // BD
  { category: "bd", key: "icp_personalised", label: "ICPs contacted (personalised)", target_value: 20, unit: "count", tracking_mode: "manual", enabled: true, sort_order: 0 },
  { category: "bd", key: "senior_calls", label: "Calls with new senior contacts / CPOs", target_value: 7, unit: "count", tracking_mode: "manual", enabled: true, sort_order: 1 },
  { category: "bd", key: "keep_in_touch", label: "Keep-in-touch messages sent", target_value: 5, unit: "count", tracking_mode: "manual", enabled: true, sort_order: 2 },
  // Candidates
  { category: "candidates", key: "talent_pool_adds", label: "Candidates added to talent pools", target_value: 5, unit: "count", tracking_mode: "auto", auto_source: "candidate_talent_pools", enabled: true, sort_order: 0 },
  // Jobs
  { category: "jobs", key: "jobs_with_5plus_pct", label: "Live jobs with 5+ candidates in play", target_value: 80, unit: "percent", tracking_mode: "auto", auto_source: "jobs_pipeline_depth", enabled: true, sort_order: 0 },
  { category: "jobs", key: "jobs_launched_pct", label: "Live jobs with a complete Job Launch", target_value: 70, unit: "percent", tracking_mode: "auto", auto_source: "job_launch_items", enabled: true, sort_order: 1 },
  { category: "jobs", key: "jobs_uptodate_pct", label: "Live jobs with up-to-date comms (7d)", target_value: 70, unit: "percent", tracking_mode: "auto", auto_source: "notes_recent", enabled: true, sort_order: 2 },
];

export const CATEGORY_LABELS: Record<StandardCategory, string> = {
  marketing: "Marketing",
  bd: "BD",
  candidates: "Candidates",
  jobs: "Jobs",
};

// Monday-based week start in local time
export function weekStart(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
export function fmtISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}
export function daysElapsedInWeek(now: Date = new Date()): number {
  const start = weekStart(now).getTime();
  const elapsed = (now.getTime() - start) / (1000 * 60 * 60 * 24);
  return Math.max(0.25, Math.min(7, elapsed));
}

async function fetchTargets(userId: string): Promise<StandardTarget[]> {
  const { data } = await supabase
    .from("weekly_standards_targets" as any)
    .select("*")
    .eq("user_id", userId)
    .order("category")
    .order("sort_order");
  if (data && data.length) return data as any as StandardTarget[];
  return [];
}

async function seedDefaults(userId: string): Promise<StandardTarget[]> {
  const rows = DEFAULT_TARGETS.map((t) => ({ ...t, user_id: userId }));
  await supabase.from("weekly_standards_targets" as any).insert(rows as any);
  return fetchTargets(userId);
}

async function fetchCheckins(userId: string, weekStarts: string[]) {
  const { data } = await supabase
    .from("weekly_standards_checkins" as any)
    .select("*")
    .eq("user_id", userId)
    .in("week_start", weekStarts);
  return (data || []) as any as Array<{ week_start: string; target_key: string; value: number; note: string | null }>;
}

async function computeAutoValues(
  userId: string,
  weekStartDate: Date,
  keys: Set<string>
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const wsIso = fmtISODate(weekStartDate);
  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weIso = weekEnd.toISOString();

  if (keys.has("talent_pool_adds")) {
    // Count candidate_talent_pools created this week whose candidate has an email
    const { data } = await supabase
      .from("candidate_talent_pools")
      .select("candidate_id, created_at, candidates!inner(email, owner_user_id)")
      .eq("candidates.owner_user_id", userId)
      .gte("created_at", wsIso)
      .lt("created_at", weIso);
    const uniq = new Set<string>();
    for (const r of (data || []) as any[]) {
      if (r.candidates?.email) uniq.add(r.candidate_id);
    }
    out["talent_pool_adds"] = uniq.size;
  }

  // Live jobs metrics — computed as current snapshot (percent of live jobs)
  // For historical weeks we still snapshot as-of-now (best-effort); weekly manual checkins take precedence if user overrode.
  if (
    keys.has("jobs_with_5plus_pct") ||
    keys.has("jobs_launched_pct") ||
    keys.has("jobs_uptodate_pct")
  ) {
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("owner_user_id", userId)
      .eq("status", "Active");
    const jobIds = (jobs || []).map((j: any) => j.id);
    const liveCount = jobIds.length;

    if (liveCount === 0) {
      if (keys.has("jobs_with_5plus_pct")) out["jobs_with_5plus_pct"] = 0;
      if (keys.has("jobs_launched_pct")) out["jobs_launched_pct"] = 0;
      if (keys.has("jobs_uptodate_pct")) out["jobs_uptodate_pct"] = 0;
    } else {
      if (keys.has("jobs_with_5plus_pct")) {
        const { data: cj } = await supabase
          .from("candidate_jobs")
          .select("job_id, stage")
          .in("job_id", jobIds)
          .not("stage", "in", "(Rejected,Placed)");
        const counts: Record<string, number> = {};
        for (const r of (cj || []) as any[]) counts[r.job_id] = (counts[r.job_id] || 0) + 1;
        const good = jobIds.filter((id) => (counts[id] || 0) >= 5).length;
        out["jobs_with_5plus_pct"] = Math.round((good / liveCount) * 100);
      }
      if (keys.has("jobs_launched_pct")) {
        const { data: li } = await supabase
          .from("job_launch_items" as any)
          .select("job_id, item_key, status")
          .in("job_id", jobIds)
          .eq("status", "done");
        const perJob: Record<string, Set<string>> = {};
        for (const r of (li || []) as any[]) {
          if (!perJob[r.job_id]) perJob[r.job_id] = new Set();
          perJob[r.job_id].add(r.item_key);
        }
        const REQUIRED = ["job_ad", "linkedin_post", "candidate_messages", "client_confirmation"];
        const complete = jobIds.filter((id) => {
          const s = perJob[id];
          if (!s) return false;
          return REQUIRED.every((k) => s.has(k));
        }).length;
        out["jobs_launched_pct"] = Math.round((complete / liveCount) * 100);
      }
      if (keys.has("jobs_uptodate_pct")) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        const { data: notes } = await supabase
          .from("notes")
          .select("entity_type, entity_id, created_at")
          .eq("owner_user_id", userId)
          .gte("created_at", cutoff.toISOString());
        const jobsWithNote = new Set<string>();
        // Direct notes on a job, or on a candidate that's in the job pipeline
        const jobIdSet = new Set(jobIds);
        const candIdsToCheck: string[] = [];
        for (const n of (notes || []) as any[]) {
          if (n.entity_type === "job" && jobIdSet.has(n.entity_id)) jobsWithNote.add(n.entity_id);
          if (n.entity_type === "candidate") candIdsToCheck.push(n.entity_id);
        }
        if (candIdsToCheck.length) {
          const { data: cjLinks } = await supabase
            .from("candidate_jobs")
            .select("job_id, candidate_id")
            .in("job_id", jobIds)
            .in("candidate_id", candIdsToCheck);
          for (const r of (cjLinks || []) as any[]) jobsWithNote.add(r.job_id);
        }
        out["jobs_uptodate_pct"] = Math.round((jobsWithNote.size / liveCount) * 100);
      }
    }
  }

  return out;
}

export function useWeeklyStandards(historyWeeks: number = 4) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["weekly-standards", user?.id, historyWeeks],
    enabled: !!user,
    queryFn: async (): Promise<{
      plates: CategoryPlate[];
      targets: StandardTarget[];
      history: Record<string, { weekStart: string; pct: number }[]>; // per target key
      weekStart: string;
    }> => {
      if (!user) return { plates: [], targets: [], history: {}, weekStart: "" };

      let targets = await fetchTargets(user.id);
      if (targets.length === 0) targets = await seedDefaults(user.id);

      const now = new Date();
      const currentWs = weekStart(now);
      const currentWsIso = fmtISODate(currentWs);

      const weekList: Date[] = [];
      for (let i = 0; i < historyWeeks; i++) {
        const d = new Date(currentWs);
        d.setDate(d.getDate() - i * 7);
        weekList.push(d);
      }
      const weekIsos = weekList.map(fmtISODate);
      const checkins = await fetchCheckins(user.id, weekIsos);

      const autoKeys = new Set(targets.filter((t) => t.tracking_mode === "auto" && t.enabled).map((t) => t.key));
      // Auto values are computed for current week (fast). Historical auto values fall back to any stored checkin snapshot, else 0.
      const currentAuto = autoKeys.size ? await computeAutoValues(user.id, currentWs, autoKeys) : {};

      const daysElapsed = daysElapsedInWeek(now);

      const enabled = targets.filter((t) => t.enabled);
      const items: StandardProgress[] = enabled.map((t) => {
        let actual = 0;
        let note: string | undefined;
        const ck = checkins.find((c) => c.week_start === currentWsIso && c.target_key === t.key);
        if (t.tracking_mode === "auto") {
          actual = currentAuto[t.key] ?? 0;
        } else {
          actual = ck ? Number(ck.value) : 0;
          note = ck?.note || undefined;
        }
        const pct = t.target_value > 0 ? actual / t.target_value : 0;
        const isPercent = t.unit === "percent";
        // For percent targets, pace runs from day 1 — the goal is a steady-state metric, so measure directly against target.
        const expectedByNow = isPercent ? t.target_value : (t.target_value * daysElapsed) / 7;
        const behindPace = actual < expectedByNow * 0.7;
        const criticallyBehind = actual < expectedByNow * 0.4;
        return { target: t, actual, pct, expectedByNow, behindPace, criticallyBehind, note };
      });

      const plateMap: Record<StandardCategory, StandardProgress[]> = {
        marketing: [], bd: [], candidates: [], jobs: [],
      };
      for (const it of items) plateMap[it.target.category].push(it);

      const plates: CategoryPlate[] = (Object.keys(plateMap) as StandardCategory[]).map((cat) => {
        const list = plateMap[cat];
        const avgPct = list.length ? list.reduce((s, x) => s + Math.min(1, x.pct), 0) / list.length : 0;
        const behindPace = list.some((x) => x.behindPace);
        const criticallyBehind = list.some((x) => x.criticallyBehind);
        return { category: cat, label: CATEGORY_LABELS[cat], items: list, avgPct, behindPace, criticallyBehind };
      });

      // Trend: last N weeks per target — auto uses stored checkin value if present else this-week computed for current only.
      const history: Record<string, { weekStart: string; pct: number }[]> = {};
      for (const t of enabled) {
        const arr: { weekStart: string; pct: number }[] = [];
        for (const wIso of weekIsos) {
          let val = 0;
          const ck = checkins.find((c) => c.week_start === wIso && c.target_key === t.key);
          if (ck) val = Number(ck.value);
          else if (wIso === currentWsIso && t.tracking_mode === "auto") val = currentAuto[t.key] ?? 0;
          const pct = t.target_value > 0 ? Math.min(1.5, val / t.target_value) : 0;
          arr.push({ weekStart: wIso, pct });
        }
        arr.reverse(); // oldest → newest
        history[t.key] = arr;
      }

      return { plates, targets, history, weekStart: currentWsIso };
    },
    staleTime: 60_000,
  });
}

export function useUpdateCheckin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ target_key, value, note }: { target_key: string; value: number; note?: string }) => {
      if (!user) throw new Error("No user");
      const ws = fmtISODate(weekStart());
      const { error } = await supabase
        .from("weekly_standards_checkins" as any)
        .upsert(
          { user_id: user.id, week_start: ws, target_key, value, note: note ?? null } as any,
          { onConflict: "user_id,week_start,target_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly-standards"] }),
  });
}

export function useUpdateTargets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Array<Partial<StandardTarget> & { key: string }>) => {
      if (!user) throw new Error("No user");
      for (const u of updates) {
        await supabase
          .from("weekly_standards_targets" as any)
          .update({
            target_value: u.target_value,
            enabled: u.enabled,
            label: u.label,
          } as any)
          .eq("user_id", user.id)
          .eq("key", u.key);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly-standards"] }),
  });
}

export function useResetDefaults() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("No user");
      await supabase.from("weekly_standards_targets" as any).delete().eq("user_id", user.id);
      await seedDefaults(user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly-standards"] }),
  });
}
