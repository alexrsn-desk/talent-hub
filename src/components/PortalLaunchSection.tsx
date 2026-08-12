import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExternalLink, Loader2, Rocket, Copy } from "lucide-react";

type Props = {
  jobId: string;
  jobTitle: string;
  clientName?: string | null;
  portalJobId?: string | null;
  onUpdate?: () => void;
};

export function PortalLaunchSection({ jobId, jobTitle, clientName, portalJobId, onUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [portal, setPortal] = useState<{ id: string; client_token: string | null } | null>(null);
  const [checking, setChecking] = useState(true);

  const loadPortal = async () => {
    if (!portalJobId) {
      setChecking(false);
      return;
    }
    const { data: job } = await supabase
      .from("portal_jobs")
      .select("id")
      .eq("id", portalJobId)
      .maybeSingle();
    if (!job) {
      setPortal(null);
      setChecking(false);
      return;
    }
    const { data: cp } = await supabase
      .from("portal_client_portals")
      .select("access_token")
      .eq("job_id", job.id)
      .maybeSingle();
    setPortal({ id: job.id, client_token: cp?.access_token ?? null });
    setChecking(false);
  };

  useEffect(() => {
    loadPortal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalJobId]);

  const launch = async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");

      const { data: created, error } = await supabase
        .from("portal_jobs")
        .insert({
          owner_user_id: uid,
          title: jobTitle,
          client_name: clientName ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { data: cp, error: cpErr } = await supabase
        .from("portal_client_portals")
        .insert({ job_id: created.id })
        .select("access_token")
        .single();
      if (cpErr) throw cpErr;

      await supabase.from("jobs").update({ portal_job_id: created.id }).eq("id", jobId);

      setPortal({ id: created.id, client_token: cp.access_token });
      toast.success("Portal created");
      onUpdate?.();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create portal");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  if (checking)
    return (
      <div className="rounded-lg border border-border p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking portal…
      </div>
    );

  const clientUrl = portal?.client_token ? `${window.location.origin}/portal/${portal.client_token}` : null;

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-medium">Hiring Portal</h2>
          <p className="text-xs text-muted-foreground">
            A shared shortlist board for your client and a prep hub for candidates.
          </p>
        </div>

        {!portal ? (
          <Button size="sm" onClick={launch} disabled={loading} className="gap-1">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Launch Portal
          </Button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="default"
              className="gap-1"
              onClick={() => window.open(`/agency-portal/${portal.id}`, "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Agency Portal
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={!clientUrl}
              onClick={() => clientUrl && window.open(clientUrl, "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Client Portal
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => window.open(`/agency-portal/${portal.id}?tab=candidates`, "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Candidate Portal
            </Button>
            {clientUrl && (
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => copyLink(clientUrl)}>
                <Copy className="h-3.5 w-3.5" /> Copy client link
              </Button>
            )}
          </div>
        )}
      </div>
      {portal && (
        <p className="text-xs text-muted-foreground">
          Candidate links are generated per candidate inside the Agency Portal.
        </p>
      )}
    </div>
  );
}
