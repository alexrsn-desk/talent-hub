import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Placement = {
  id: string;
  owner_user_id: string;
  candidate_id: string;
  client_id: string | null;
  job_id: string | null;
  candidate_job_id: string | null;
  candidate_name_snapshot: string | null;
  client_name_snapshot: string | null;
  job_title_snapshot: string | null;
  offer_accepted_date: string | null;
  start_date: string | null;
  salary_placed_at: number | null;
  fee_type: string;
  fee_percentage: number | null;
  fee_amount: number | null;
  invoice_date: string | null;
  payment_terms_days: number;
  invoice_due_date: string | null;
  guarantee_weeks: number;
  guarantee_expiry_date: string | null;
  invoice_raised: boolean;
  invoice_raised_at: string | null;
  invoice_paid: boolean;
  invoice_paid_at: string | null;
  status: "pre_start" | "active" | "guaranteed" | "at_risk" | "fallen_through";
  source: string | null;
  notes: string | null;
  fall_through_reason: string | null;
  fall_through_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlacementCheckin = {
  id: string;
  owner_user_id: string;
  placement_id: string;
  checkin_type: "week_1" | "week_4" | "week_8" | "probation_review" | "guarantee_expiry" | "custom";
  due_date: string;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
  concern_flagged: boolean;
  concern_summary: string | null;
  created_at: string;
  updated_at: string;
};

export function usePlacements() {
  return useQuery({
    queryKey: ["placements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("placements")
        .select("*")
        .order("start_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Placement[];
    },
  });
}

export function usePlacement(id: string | undefined) {
  return useQuery({
    queryKey: ["placement", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("placements")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as Placement | null;
    },
  });
}

export function usePlacementCheckins(placementId: string | undefined) {
  return useQuery({
    queryKey: ["placement_checkins", placementId],
    enabled: !!placementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("placement_checkins")
        .select("*")
        .eq("placement_id", placementId!)
        .order("due_date");
      if (error) throw error;
      return (data ?? []) as PlacementCheckin[];
    },
  });
}

export function useAllOpenCheckins() {
  return useQuery({
    queryKey: ["placement_checkins_open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("placement_checkins")
        .select("*")
        .eq("completed", false)
        .order("due_date");
      if (error) throw error;
      return (data ?? []) as PlacementCheckin[];
    },
  });
}

export function useCreatePlacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Placement>) => {
      const { data: user } = await supabase.auth.getUser();
      const owner = user.user?.id;
      if (!owner) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("placements")
        .insert({ ...input, owner_user_id: owner } as any)
        .select()
        .single();
      if (error) throw error;
      return data as Placement;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["placements"] });
      toast.success("Placement created");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create placement"),
  });
}

export function useUpdatePlacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Placement> & { id: string }) => {
      const { data, error } = await supabase
        .from("placements")
        .update(patch as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Placement;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["placements"] });
      qc.invalidateQueries({ queryKey: ["placement", vars.id] });
      qc.invalidateQueries({ queryKey: ["placement_checkins", vars.id] });
    },
  });
}

export function useUpdateCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<PlacementCheckin> & { id: string }) => {
      const { data, error } = await supabase
        .from("placement_checkins")
        .update(patch as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as PlacementCheckin;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["placement_checkins", data.placement_id] });
      qc.invalidateQueries({ queryKey: ["placement_checkins_open"] });
    },
  });
}

export function useActivePlacementCount() {
  const { data } = usePlacements();
  return (data ?? []).filter((p) => p.status === "active" || p.status === "pre_start" || p.status === "at_risk").length;
}

export const CHECKIN_LABELS: Record<PlacementCheckin["checkin_type"], string> = {
  week_1: "Week 1 check-in",
  week_4: "Week 4 check-in",
  week_8: "Week 8 check-in",
  probation_review: "Probation review",
  guarantee_expiry: "Guarantee expiry",
  custom: "Check-in",
};

export const STATUS_LABELS: Record<Placement["status"], string> = {
  pre_start: "Pre-start",
  active: "Active",
  guaranteed: "Guaranteed",
  at_risk: "At risk",
  fallen_through: "Fallen through",
};

export const STATUS_COLORS: Record<Placement["status"], string> = {
  pre_start: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  guaranteed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  at_risk: "bg-red-500/15 text-red-400 border-red-500/30",
  fallen_through: "bg-zinc-700/40 text-zinc-400 border-zinc-600/30",
};
