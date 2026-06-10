import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type TalentPool = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  target_size: number;
  checkin_frequency_days: number;
  warning_threshold_days: number;
  created_at: string;
};

export type PoolMembership = {
  id: string;
  candidate_id: string;
  pool_id: string;
  owner_user_id: string;
  added_at: string;
  added_by: string | null;
};

export type PoolHealth = "healthy" | "thin" | "empty";
export type CandidateBenchHealth = "hot" | "warm" | "cooling" | "cold";

export function usePools() {
  return useQuery({
    queryKey: ["talent_pools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("talent_pools" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data as unknown as TalentPool[]) || [];
    },
  });
}

export function usePoolMemberships() {
  return useQuery({
    queryKey: ["pool_memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_talent_pools" as any)
        .select("*");
      if (error) throw error;
      return (data as unknown as PoolMembership[]) || [];
    },
  });
}

export function useCandidatePools(candidateId: string | undefined) {
  return useQuery({
    queryKey: ["candidate_pools", candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_talent_pools" as any)
        .select("pool_id")
        .eq("candidate_id", candidateId!);
      if (error) throw error;
      return ((data as any[]) || []).map((r) => r.pool_id as string);
    },
  });
}

export function useCreatePool() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("talent_pools" as any)
        .insert({
          owner_user_id: user.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TalentPool;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["talent_pools"] });
    },
  });
}

export function useUpdatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TalentPool> & { id: string }) => {
      const { error } = await supabase.from("talent_pools" as any).update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["talent_pools"] }),
  });
}

export function useDeletePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("talent_pools" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["talent_pools"] });
      qc.invalidateQueries({ queryKey: ["pool_memberships"] });
    },
  });
}

export function useAddCandidatesToPool() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ poolId, candidateIds }: { poolId: string; candidateIds: string[] }) => {
      if (!user) throw new Error("Not signed in");
      const rows = candidateIds.map((cid) => ({
        candidate_id: cid,
        pool_id: poolId,
        owner_user_id: user.id,
        added_by: user.id,
      }));
      const { error } = await supabase
        .from("candidate_talent_pools" as any)
        .upsert(rows as any, { onConflict: "candidate_id,pool_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool_memberships"] });
      qc.invalidateQueries({ queryKey: ["candidate_pools"] });
    },
  });
}

export function useRemoveCandidateFromPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ poolId, candidateId }: { poolId: string; candidateId: string }) => {
      const { error } = await supabase
        .from("candidate_talent_pools" as any)
        .delete()
        .eq("pool_id", poolId)
        .eq("candidate_id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool_memberships"] });
      qc.invalidateQueries({ queryKey: ["candidate_pools"] });
    },
  });
}

/** Replace the exact set of pools a candidate belongs to. */
export function useSetCandidatePools() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ candidateId, poolIds }: { candidateId: string; poolIds: string[] }) => {
      if (!user) throw new Error("Not signed in");
      const { data: existing } = await supabase
        .from("candidate_talent_pools" as any)
        .select("pool_id")
        .eq("candidate_id", candidateId);
      const have = new Set(((existing as any[]) || []).map((r) => r.pool_id as string));
      const want = new Set(poolIds);
      const toAdd = [...want].filter((p) => !have.has(p));
      const toRemove = [...have].filter((p) => !want.has(p));
      if (toAdd.length > 0) {
        await supabase.from("candidate_talent_pools" as any).insert(
          toAdd.map((pid) => ({
            candidate_id: candidateId,
            pool_id: pid,
            owner_user_id: user.id,
            added_by: user.id,
          })) as any
        );
      }
      if (toRemove.length > 0) {
        await supabase
          .from("candidate_talent_pools" as any)
          .delete()
          .eq("candidate_id", candidateId)
          .in("pool_id", toRemove);
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pool_memberships"] });
      qc.invalidateQueries({ queryKey: ["candidate_pools", vars.candidateId] });
    },
  });
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 99999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function computePoolHealth(
  pool: TalentPool,
  members: Array<{ status: string; last_contacted: string | null }>
): PoolHealth {
  if (members.length === 0) return "empty";
  const activeOrPassive = members.filter((m) => m.status === "Active" || m.status === "Passive").length;
  const recent = members.filter((m) => daysSince(m.last_contacted) <= 28).length;
  if (members.length >= 5 && activeOrPassive >= 3 && recent >= Math.ceil(members.length / 2)) return "healthy";
  return "thin";
}

export function computeCandidateBench(
  status: string,
  lastContactedISO: string | null | undefined
): CandidateBenchHealth {
  const d = daysSince(lastContactedISO);
  if (status === "Active" && d <= 14) return "hot";
  if ((status === "Passive" || status === "Active") && d <= 28) return "warm";
  if (d <= 56) return "cooling";
  return "cold";
}

export const HEALTH_DOT: Record<PoolHealth, string> = {
  healthy: "🟢",
  thin: "🟡",
  empty: "⚫",
};

export const BENCH_DOT: Record<CandidateBenchHealth, string> = {
  hot: "🟢",
  warm: "🟡",
  cooling: "🔴",
  cold: "⚫",
};

export const BENCH_ORDER: Record<CandidateBenchHealth, number> = {
  hot: 0,
  warm: 1,
  cooling: 2,
  cold: 3,
};
