import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ClientPortalInvite({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("client_portal_access")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      setAccess(data);
      setLoading(false);
    })();
  }, [clientId]);

  const generateLink = async () => {
    setGenerating(true);
    const { data } = await supabase.functions.invoke("portal-auth", {
      body: { action: "generate_link", client_id: clientId },
    });
    if (data?.token) {
      const newAccess = { ...access, magic_link_token: data.token, enabled: true };
      setAccess(newAccess);
      toast.success("Portal link generated");
    }
    setGenerating(false);
  };

  const toggleAccess = async (enabled: boolean) => {
    await supabase
      .from("client_portal_access")
      .update({ enabled })
      .eq("client_id", clientId);
    setAccess({ ...access, enabled });
    toast.success(enabled ? "Portal access enabled" : "Portal access disabled");
  };

  const copyLink = () => {
    const url = `${window.location.origin}/portal?token=${access.magic_link_token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading portal status...</div>;

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Client Portal</span>
        </div>
        {access && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{access.enabled ? "Active" : "Disabled"}</span>
            <Switch checked={access.enabled} onCheckedChange={toggleAccess} />
          </div>
        )}
      </div>

      {!access ? (
        <Button size="sm" onClick={generateLink} disabled={generating} className="w-full">
          {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
          Generate Portal Link
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={copyLink} className="flex-1">
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy Link
            </Button>
            <Button size="sm" variant="outline" onClick={generateLink} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Regenerate"}
            </Button>
          </div>
          {access.last_accessed_at && (
            <p className="text-xs text-muted-foreground">
              Last accessed: {new Date(access.last_accessed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </p>
          )}
          {access.token_expires_at && (
            <p className="text-xs text-muted-foreground">
              Expires: {new Date(access.token_expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
