import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, Share2 as Linkedin, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { connectConnector, disconnectConnector, getConnectionStatus, type ConnectorId } from "@/lib/app-connections";

const PROVIDERS: { id: ConnectorId; name: string; desc: string; icon: typeof Mail }[] = [
  { id: "microsoft_outlook", name: "Outlook / Microsoft 365", desc: "Send candidate and client emails from your Outlook mailbox", icon: Mail },
  { id: "google_mail", name: "Gmail / Google Workspace", desc: "Send candidate and client emails from your Gmail", icon: Mail },
  { id: "linkedin", name: "LinkedIn", desc: "Publish job posts to your LinkedIn feed in one click", icon: Linkedin },
];

export function EmailConnectionsSection() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<ConnectorId | null>(null);
  const status = useQuery({ queryKey: ["app-connections"], queryFn: getConnectionStatus });

  async function connect(id: ConnectorId, name: string, reconnect: boolean) {
    setBusy(id);
    try {
      await connectConnector(id);
      await qc.invalidateQueries({ queryKey: ["app-connections"] });
      toast.success(reconnect ? `Reconnected to ${name}` : `Connected to ${name}`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }
  async function disconnect(id: ConnectorId) {
    setBusy(id);
    try { await disconnectConnector(id); await qc.invalidateQueries({ queryKey: ["app-connections"] }); toast.success("Disconnected"); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Email & LinkedIn</h2>
        <p className="text-sm text-muted-foreground">Connect your own accounts so Desky can send launch emails and posts as you. Each person connects their own.</p>
      </div>
      {PROVIDERS.map((p) => {
        const row = status.data?.connections.find((c) => c.connector_id === p.id);
        const available = status.data?.available?.[p.id];
        const Icon = p.icon;
        return (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-4">
            <Icon className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{p.name}</p>
              {row?.reconnect_required ? (
                <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Your {p.name} access needs to be renewed.</p>
              ) : row ? (
                <p className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Connected{row.account_email ? ` as ${row.account_email}` : ""}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{available === false ? "Not set up for your workspace yet" : p.desc}</p>
              )}
            </div>
            {status.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : row && !row.reconnect_required ? (
              <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => disconnect(p.id)}>Disconnect</Button>
            ) : (
              <Button size="sm" disabled={busy === p.id || available === false} onClick={() => connect(p.id, p.name, !!row)}>
                {busy === p.id && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{row ? `Reconnect` : "Connect"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
