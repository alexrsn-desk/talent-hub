import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Look up enriched product context for a candidate's employer by matching
 * candidates.current_employer against clients.company_name (case-insensitive).
 * Returns null when no match or no enrichment.
 */
export function useEmployerContext(employerName?: string | null) {
  return useQuery({
    queryKey: ["employer_context", employerName?.toLowerCase().trim() || ""],
    enabled: !!employerName?.trim(),
    queryFn: async () => {
      const name = employerName!.trim();
      const { data: clients } = await supabase
        .from("clients")
        .select("id, company_name")
        .ilike("company_name", name)
        .limit(1);
      const client = clients?.[0];
      if (!client) return null;
      const { data: intel } = await supabase
        .from("company_intel" as any)
        .select("client_id, product_types, who_uses_products, internal_external, industry, enrichment_confidence")
        .eq("client_id", client.id)
        .maybeSingle();
      if (!intel) return null;
      return {
        client_id: client.id,
        company_name: client.company_name,
        ...(intel as any),
      } as {
        client_id: string;
        company_name: string;
        product_types: string | null;
        who_uses_products: string | null;
        internal_external: string | null;
        industry: string | null;
        enrichment_confidence: "high" | "medium" | "low" | null;
      };
    },
  });
}
