import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Loader2, ExternalLink, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const ACTIVE_STAGES = [
  "Screening",
  "Shortlist",
  "Submitted",
  "Client Review",
  "First Interview",
  "Second Interview",
  "Offer",
];

export function InPlaceCandidatesPanel() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["in-play-candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_jobs")
        .select("id, stage, candidate_id, job_id, candidates(id, name, first_name, last_name, email, linkedin_url, job_title, current_employer), jobs(id, title, clients(company_name))")
        .in("stage", ACTIVE_STAGES)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">No candidates in play</p>
        <p>Candidates appear here when they hit Screening or later in any job pipeline.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Candidate</th>
            <th className="text-left px-4 py-2 font-medium">Current role</th>
            <th className="text-left px-4 py-2 font-medium">Job</th>
            <th className="text-left px-4 py-2 font-medium">Stage</th>
            <th className="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((row: any) => {
            const c = row.candidates;
            const j = row.jobs;
            if (!c) return null;
            return (
              <tr key={row.id} className="border-t border-border hover:bg-muted/20">
                <td className="px-4 py-2.5">
                  <Link to={`/candidates?id=${c.id}`} className="font-medium text-foreground hover:underline">
                    {c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unnamed"}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {c.job_title || "—"}
                  {c.current_employer ? <span className="opacity-60"> · {c.current_employer}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {j?.title || "—"}
                  {j?.clients?.company_name ? <span className="opacity-60"> · {j.clients.company_name}</span> : null}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant="secondary" className="text-[10px]">{row.stage}</Badge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center gap-1.5 justify-end text-muted-foreground">
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noreferrer" title="LinkedIn">
                        <ExternalLink className="h-3.5 w-3.5 hover:text-primary" />
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} title="Email">
                        <Mail className="h-3.5 w-3.5 hover:text-primary" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
