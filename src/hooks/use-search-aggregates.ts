import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Lightweight aggregates for the AdvancedSearchBar:
// - latest note date + content excerpt per candidate / client
// - active pipeline candidate_ids (stage not in Placed/Rejected)
// - client_ids that have at least one Open job

export type SearchAggregates = {
  candidateNoteMeta: Map<string, { last: string | null; excerpt: string }>;
  clientNoteMeta: Map<string, { last: string | null; excerpt: string }>;
  candidatesInPipeline: Set<string>;
  clientsWithOpenRoles: Set<string>;
};

export function useSearchAggregates() {
  return useQuery({
    queryKey: ["search-aggregates"],
    staleTime: 60_000,
    queryFn: async (): Promise<SearchAggregates> => {
      const [notesRes, cjRes, jobsRes] = await Promise.all([
        supabase.from("notes").select("candidate_id,client_id,content,created_at").order("created_at", { ascending: false }).limit(2000),
        supabase.from("candidate_jobs").select("candidate_id,stage").not("stage", "in", '("Placed","Rejected","Not Suitable")'),
        supabase.from("jobs").select("client_id,status").eq("status", "Open"),
      ]);

      const candidateNoteMeta = new Map<string, { last: string | null; excerpt: string }>();
      const clientNoteMeta = new Map<string, { last: string | null; excerpt: string }>();
      for (const n of (notesRes.data || []) as any[]) {
        if (n.candidate_id && !candidateNoteMeta.has(n.candidate_id)) {
          candidateNoteMeta.set(n.candidate_id, { last: n.created_at, excerpt: (n.content || "").slice(0, 600) });
        } else if (n.candidate_id) {
          // append more content (up to 800 chars total)
          const cur = candidateNoteMeta.get(n.candidate_id)!;
          if (cur.excerpt.length < 800) cur.excerpt += " | " + (n.content || "").slice(0, 200);
        }
        if (n.client_id && !clientNoteMeta.has(n.client_id)) {
          clientNoteMeta.set(n.client_id, { last: n.created_at, excerpt: (n.content || "").slice(0, 600) });
        } else if (n.client_id) {
          const cur = clientNoteMeta.get(n.client_id)!;
          if (cur.excerpt.length < 800) cur.excerpt += " | " + (n.content || "").slice(0, 200);
        }
      }

      const candidatesInPipeline = new Set<string>(((cjRes.data || []) as any[]).map(r => r.candidate_id));
      const clientsWithOpenRoles = new Set<string>(((jobsRes.data || []) as any[]).map(r => r.client_id).filter(Boolean));

      return { candidateNoteMeta, clientNoteMeta, candidatesInPipeline, clientsWithOpenRoles };
    },
  });
}
