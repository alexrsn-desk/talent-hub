import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { pushCandidateToPortal } from "@/lib/agency.functions";

type PortalOption = {
  portalJobId: string;
  jobTitle: string;
  clientName: string | null;
  stage: string | null;
};

/** Desky jobs this candidate is in the pipeline for that have a portal. */
function usePortalOptions(candidateId: string) {
  return useQuery({
    queryKey: ["push-to-portal-options", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_jobs")
        .select("stage, jobs!inner(id, title, portal_job_id, clients(company_name))")
        .eq("candidate_id", candidateId)
        .not("jobs.portal_job_id", "is", null);
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((r) => {
          const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
          if (!job?.portal_job_id) return null;
          const client = Array.isArray(job.clients) ? job.clients[0] : job.clients;
          return {
            portalJobId: job.portal_job_id as string,
            jobTitle: job.title as string,
            clientName: (client?.company_name as string) ?? null,
            stage: r.stage ?? null,
          } satisfies PortalOption;
        })
        .filter(Boolean) as PortalOption[];
    },
  });
}

/** Existing portal_candidates rows already pushed for this Desky candidate. */
function usePushedRows(candidateId: string) {
  return useQuery({
    queryKey: ["push-to-portal-pushed", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_candidates")
        .select("id, job_id, client_notes, pushed_at")
        .eq("desky_candidate_id", candidateId);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        job_id: string;
        client_notes: string | null;
        pushed_at: string | null;
      }[];
    },
  });
}

export function PushToPortalButton({
  candidateId,
  clientReadyNotes,
}: {
  candidateId: string;
  clientReadyNotes?: string | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: options = [], isLoading } = usePortalOptions(candidateId);
  const { data: pushed = [] } = usePushedRows(candidateId);

  const push = useMutation({
    mutationFn: (portalJobId: string) =>
      pushCandidateToPortal({ data: { deskyCandidateId: candidateId, portalJobId } }),
    onSuccess: (res) => {
      toast.success(res.created ? "Pushed to portal" : "Portal updated");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["push-to-portal-pushed", candidateId] });
      qc.invalidateQueries({ queryKey: ["portal-launch"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || options.length === 0) return null;

  const rowFor = (portalJobId: string) => pushed.find((p) => p.job_id === portalJobId);
  const needsUpdate = (portalJobId: string) => {
    const row = rowFor(portalJobId);
    if (!row) return false;
    return (row.client_notes ?? "") !== (clientReadyNotes ?? "");
  };

  const fmt = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

  // Single portal — one direct button, no selector.
  if (options.length === 1) {
    const only = options[0];
    const row = rowFor(only.portalJobId);
    const stale = needsUpdate(only.portalJobId);

    if (row && !stale) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button size="sm" variant="outline" className="gap-1.5 opacity-60" disabled>
                <Check className="h-3.5 w-3.5" /> On Portal
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Pushed on {fmt(row.pushed_at)}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={push.isPending}
        onClick={() => push.mutate(only.portalJobId)}
      >
        {stale ? <RefreshCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
        {stale ? "Update Portal" : "Push to Portal"}
      </Button>
    );
  }

  // Multiple portals — selector.
  const allPushedAndFresh =
    options.every((o) => rowFor(o.portalJobId) && !needsUpdate(o.portalJobId));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          {allPushedAndFresh ? (
            <>
              <Check className="h-3.5 w-3.5" /> On Portal
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" /> Push to Portal
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b border-border p-3">
          <p className="text-sm font-medium">Push to which portal?</p>
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {options.map((o) => {
            const row = rowFor(o.portalJobId);
            const stale = needsUpdate(o.portalJobId);
            const done = row && !stale;
            return (
              <div
                key={o.portalJobId}
                className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{o.jobTitle}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.clientName || "No client"}
                    {row?.pushed_at ? ` · pushed ${fmt(row.pushed_at)}` : ""}
                  </p>
                </div>
                {done ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5" /> On Portal
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant={stale ? "outline" : "default"}
                    className="shrink-0"
                    disabled={push.isPending}
                    onClick={() => push.mutate(o.portalJobId)}
                  >
                    {stale ? "Update" : "Push"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
