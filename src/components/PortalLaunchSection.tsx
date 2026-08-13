import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Entry point from a Desky job into the Client / Candidate / Agency Portal.
 * Creates the portal_jobs record on first launch and stores its id on the Desky job.
 */
export function PortalLaunchSection({
  jobId,
  portalJobId,
  title,
  clientName,
  onLinked,
}: {
  jobId: string;
  portalJobId: string | null;
  title: string;
  clientName: string | null;
  onLinked?: (portalJobId: string) => void;
}) {
  const qc = useQueryClient();

  const portal = useQuery({
    queryKey: ["portal-launch", portalJobId],
    enabled: !!portalJobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_jobs")
        .select(
          "id, title, portal_client_portals(access_token), portal_candidates(id, name, portal_candidate_portals(access_token))",
        )
        .eq("id", portalJobId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const launch = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const { data: created, error } = await supabase
        .from("portal_jobs")
        .insert({
          user_id: auth.user.id,
          title,
          client_name: clientName ?? "Client",
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: pErr } = await supabase
        .from("portal_client_portals")
        .insert({ job_id: created.id });
      if (pErr) throw pErr;

      const { error: jErr } = await supabase
        .from("jobs")
        .update({ portal_job_id: created.id })
        .eq("id", jobId);
      if (jErr) throw jErr;

      return created.id as string;
    },
    onSuccess: (id) => {
      toast.success("Portal launched");
      onLinked?.(id);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["portal-launch", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = (path: string) => window.open(path, "_blank", "noopener");
  const cpRel = portal.data?.portal_client_portals as any;
  const clientToken = (Array.isArray(cpRel) ? cpRel[0] : cpRel)?.access_token;
  const candidates = portal.data?.portal_candidates ?? [];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-h2">Portal</h3>
          <p className="text-small">
            Share this search with the client and keep candidates updated.
          </p>
        </div>
        {!portalJobId && (
          <Button onClick={() => launch.mutate()} disabled={launch.isPending}>
            <Rocket className="mr-2 h-4 w-4" />
            Launch Portal
          </Button>
        )}
      </div>

      {portalJobId && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => open(`/agency-portal/${portalJobId}`)}>
            Agency Portal <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!clientToken}
            onClick={() => clientToken && open(`/portal/${clientToken}`)}
          >
            Client Portal <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Button>
          {candidates.map((c) => {
            const cRel = (c as any).portal_candidate_portals;
            const token = (Array.isArray(cRel) ? cRel[0] : cRel)?.access_token;
            if (!token) return null;
            return (
              <Button
                key={c.id}
                variant="ghost"
                size="sm"
                onClick={() => open(`/candidate/${token}`)}
              >
                {c.name} <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>
            );
          })}
          {candidates.length === 0 && (
            <span className="self-center text-small">
              Add candidates in the Agency Portal to get candidate links.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
