import { useEffect, useState } from "react";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

function makeToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

export function ClientPortalLinkSection({ jobId }: { jobId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("client_portals")
        .select("access_token")
        .eq("job_id", jobId)
        .maybeSingle();
      if (active) {
        setToken(data?.access_token ?? null);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [jobId]);

  const url = token ? `${window.location.origin}/portal/${token}` : null;

  const generate = async () => {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const newToken = makeToken();
      const { error } = await supabase
        .from("client_portals")
        .upsert({ job_id: jobId, user_id: auth.user?.id, access_token: newToken }, { onConflict: "job_id" });
      if (error) throw error;
      setToken(newToken);
      toast({ title: token ? "New portal link created" : "Client portal link created" });
    } catch (e) {
      toast({ title: "Couldn't create the link", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Client Portal</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        A read-only-by-design board for the client: name, headline, Client Ready Notes and CV only.
      </p>

      {url ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">{url}</code>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast({ title: "Link copied" }); }}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
            </a>
          </Button>
          <Button size="sm" variant="ghost" onClick={generate} disabled={busy}>
            Regenerate
          </Button>
        </div>
      ) : (
        <Button size="sm" className="mt-3" onClick={generate} disabled={busy}>
          Create portal link
        </Button>
      )}
    </div>
  );
}
