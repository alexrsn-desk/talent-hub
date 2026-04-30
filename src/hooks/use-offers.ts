import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Offer = {
  id: string;
  owner_user_id: string;
  candidate_id: string;
  job_id: string;
  candidate_job_id: string;

  offer_type: "verbal" | "written";
  salary_offered: number | null;
  salary_currency: string;
  start_date_proposed: string | null;
  notice_period_weeks: number | null;
  earliest_start_date: string | null;
  benefits_notes: string | null;
  conditions: string[] | null;
  conditions_other: string | null;

  candidate_name_snapshot: string | null;
  client_name_snapshot: string | null;
  job_title_snapshot: string | null;
  candidate_expectation_snapshot: number | null;

  counter_offer_risk: "low" | "medium" | "high" | null;
  counter_offer_reasons: string | null;
  acceptance_risk: "low" | "medium" | "high" | null;
  acceptance_reasons: string | null;
  start_date_risk: "low" | "medium" | "high" | null;
  start_date_reasons: string | null;
  overall_risk: "low" | "medium" | "high" | null;
  risk_assessed_at: string | null;

  verbal_offer_date: string | null;
  written_offer_date: string | null;
  acceptance_deadline: string | null;
  candidate_decision: "pending" | "accepted" | "declined";
  decision_logged_at: string | null;
  resignation_planned_date: string | null;
  resignation_handed_in_date: string | null;
  counter_offer_received_date: string | null;
  resignation_accepted_date: string | null;
  start_date_confirmed: string | null;

  pre_start_candidate_called: boolean;
  pre_start_client_called: boolean;
  pre_start_candidate_briefed: boolean;
  pre_start_placement_ready: boolean;

  status:
    | "awaiting_acceptance"
    | "accepted"
    | "resigned"
    | "counter_offered"
    | "counter_offer_lost"
    | "starting_soon"
    | "placement_complete"
    | "withdrawn";

  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CounterOffer = {
  id: string;
  owner_user_id: string;
  offer_id: string;
  amount_offered: number | null;
  other_changes: string | null;
  candidate_reaction:
    | "leaning_accept"
    | "undecided"
    | "leaning_decline"
    | "declined"
    | null;
  outcome: "pending" | "accepted" | "declined";
  ai_strategy: string | null;
  received_date: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

const KEY = ["offers"];

export function useOffers() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("*, candidates(id,name,first_name,phone,email), jobs(id,title,clients(id,company_name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useOfferByCandidateJob(candidate_job_id: string | null) {
  return useQuery({
    queryKey: [...KEY, "by-cj", candidate_job_id],
    enabled: !!candidate_job_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("*")
        .eq("candidate_job_id", candidate_job_id!)
        .maybeSingle();
      if (error) throw error;
      return data as Offer | null;
    },
  });
}

export function useUpdateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Offer> & { id: string }) => {
      const { data, error } = await supabase.from("offers").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data as Offer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useCounterOffers(offer_id: string | null) {
  return useQuery({
    queryKey: ["counter_offers", offer_id],
    enabled: !!offer_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("counter_offers")
        .select("*")
        .eq("offer_id", offer_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CounterOffer[];
    },
  });
}

export function useCreateCounterOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<CounterOffer> & { offer_id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("counter_offers")
        .insert({ ...payload, owner_user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as CounterOffer;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["counter_offers", vars.offer_id] });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateCounterOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CounterOffer> & { id: string }) => {
      const { data, error } = await supabase.from("counter_offers").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data as CounterOffer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["counter_offers"] });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

// Lightweight helpers consumed by the dashboard summary
export function useOffersSummary() {
  const { data: offers = [] } = useOffers();
  const today = new Date();
  const in7 = new Date(Date.now() + 7 * 86400000);
  const active = offers.filter((o) => o.status !== "withdrawn" && o.status !== "placement_complete" && o.status !== "counter_offer_lost");
  return {
    active: active.length,
    awaitingAcceptance: offers.filter((o) => o.status === "awaiting_acceptance").length,
    inNotice: offers.filter((o) => o.status === "resigned").length,
    startingThisWeek: offers.filter((o) => o.start_date_confirmed && new Date(o.start_date_confirmed) >= today && new Date(o.start_date_confirmed) <= in7).length,
    highRisk: active.filter((o) => o.overall_risk === "high").length,
    rows: offers,
  };
}
