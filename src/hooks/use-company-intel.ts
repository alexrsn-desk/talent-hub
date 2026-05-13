import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CompanySignal = {
  headline: string;
  date?: string;
  category?: string;
  signal_type?: "growth" | "risk" | "change";
  bd_implication?: string;
  source_url?: string;
};

export type JobPosting = { title: string; department?: string; location?: string; count?: number };

export type CompanyIntel = {
  id: string;
  client_id: string;
  official_name: string | null;
  website: string | null;
  linkedin_url: string | null;
  headquarters: string | null;
  year_founded: number | null;
  employee_count: string | null;
  industry: string | null;
  description: string | null;
  funding_stage: string | null;
  funding_amount: string | null;
  funding_date: string | null;
  funding_lead_investors: string[] | null;
  total_funding: string | null;
  last_valuation: string | null;
  revenue_range: string | null;
  tech_stack: string[] | null;
  recent_signals: CompanySignal[];
  current_job_postings: JobPosting[];
  enrichment_source: string | null;
  last_enriched_at: string | null;
};

export function useCompanyIntel(clientId?: string) {
  return useQuery({
    queryKey: ["company_intel", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_intel" as any).select("*").eq("client_id", clientId!).maybeSingle();
      if (error) throw error;
      return (data as any as CompanyIntel) || null;
    },
  });
}

export function useEnrichCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await supabase.functions.invoke("enrich-company", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      return data as { intel: CompanyIntel; spent_pence: number; budget_pence: number };
    },
    onSuccess: (_d, clientId) => {
      qc.invalidateQueries({ queryKey: ["company_intel", clientId] });
      qc.invalidateQueries({ queryKey: ["enrichment_usage"] });
      toast.success("Company intelligence updated");
    },
    onError: (e: any) => {
      toast.error(e?.message || "Enrichment failed");
    },
  });
}

export function useEnrichmentUsage() {
  return useQuery({
    queryKey: ["enrichment_usage"],
    queryFn: async () => {
      const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("enrichment_usage" as any).select("cost_pence,created_at")
        .gte("created_at", start.toISOString());
      if (error) throw error;
      const spent = (data || []).reduce((s: number, r: any) => s + (r.cost_pence || 0), 0);
      return { spent_pence: spent, count: (data || []).length };
    },
  });
}
