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
    <div className="border border-border rounded-md px-3 py-2 inline-flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">Client Portal ATS</span>
      </div>
      {access && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">{access.enabled ? "Active" : "Off"}</span>
          <Switch checked={access.enabled} onCheckedChange={toggleAccess} className="scale-75 origin-left" />
        </div>
      )}
      {!access ? (
        <Button size="sm" variant="outline" onClick={generateLink} disabled={generating} className="h-7 text-xs gap-1">
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
          Generate Link
        </Button>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={copyLink} className="h-7 text-xs gap-1">
            <Copy className="h-3 w-3" /> Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={generateLink} disabled={generating} className="h-7 text-xs">
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Regen"}
          </Button>
          {access.last_accessed_at && (
            <span className="text-[10px] text-muted-foreground">
              Last: {new Date(access.last_accessed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
