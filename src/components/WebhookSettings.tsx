import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Copy, RefreshCw, Loader2, Plug, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";

interface WebhookSettings {
  id?: string;
  user_id: string;
  secret_key: string;
  auto_create_clients: boolean;
  run_signal_detection: boolean;
  show_in_activity_feed: boolean;
  consecutive_failures: number;
}

interface WebhookLog {
  id: string;
  entity_type: string;
  action: string;
  status: string;
  record_name: string | null;
  error_message: string | null;
  created_at: string;
}

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-import`;

export function WebhookSettingsSection() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<WebhookSettings | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    let { data: s } = await (supabase as any)
      .from("webhook_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!s) {
      const { data: created } = await (supabase as any)
        .from("webhook_settings")
        .insert({ user_id: user.id })
        .select()
        .single();
      s = created;
    }

    setSettings(s as WebhookSettings);

    const { data: l } = await (supabase as any)
      .from("webhook_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setLogs((l || []) as WebhookLog[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const updateSetting = async (patch: Partial<WebhookSettings>) => {
    if (!settings || !user) return;
    setSettings({ ...settings, ...patch });
    const { error } = await (supabase as any)
      .from("webhook_settings")
      .update(patch)
      .eq("user_id", user.id);
    if (error) toast.error(error.message);
  };

  const regenerateKey = async () => {
    if (!user) return;
    if (!confirm("Regenerate the secret key? Any existing integrations using the old key will stop working.")) return;
    setRegenerating(true);
    try {
      // generate a 48-char hex key client-side
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const key = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
      const { error } = await (supabase as any)
        .from("webhook_settings")
        .update({ secret_key: key, consecutive_failures: 0 })
        .eq("user_id", user.id);
      if (error) throw error;
      setSettings(prev => prev ? { ...prev, secret_key: key, consecutive_failures: 0 } : prev);
      toast.success("New key generated — update your integrations");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRegenerating(false);
    }
  };

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  if (loading || !settings) {
    return (
      <div className="pt-6 border-t border-border">
        <div className="flex items-center gap-2 mb-3">
          <Plug className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-medium">Integrations · Webhook</h2>
        </div>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showFailureBanner = settings.consecutive_failures >= 3;

  return (
    <div className="pt-6 border-t border-border space-y-4">
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">Integrations · Webhook</h2>
      </div>

      {showFailureBanner && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Webhook sync may have stopped working.</strong>{" "}
            {settings.consecutive_failures} consecutive failures detected. Check the recent calls below.
          </div>
        </div>
      )}

      {/* URL */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Webhook URL</label>
        <div className="flex gap-2">
          <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
          <Button size="sm" variant="outline" onClick={() => copy(WEBHOOK_URL, "URL")}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Secret */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Secret Key (send as <code>x-webhook-key</code> header)</label>
        <div className="flex gap-2">
          <Input value={settings.secret_key} readOnly className="font-mono text-xs" />
          <Button size="sm" variant="outline" onClick={() => copy(settings.secret_key, "Key")}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={regenerateKey} disabled={regenerating}>
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Use this URL and key to send records from Zapier, Make.com or any external tool directly into Desky.
        Works with Vincere, Sourcewhale or any tool that supports webhooks.
        Send a <code>POST</code> with JSON: <code>{"{ entity_type, action, data }"}</code>.
      </p>

      {/* Behaviour toggles */}
      <div className="space-y-3 rounded-lg border border-border p-3">
        <h3 className="text-xs font-medium">Behaviour</h3>
        <ToggleRow
          label="Auto-create clients from unmatched company names"
          description="On: creates a new client when no match. Off: leaves contact unlinked & flagged."
          checked={settings.auto_create_clients}
          onChange={(v) => updateSetting({ auto_create_clients: v })}
        />
        <ToggleRow
          label="Run signal detection on synced notes"
          description="Automatically scan webhook-imported notes for signals."
          checked={settings.run_signal_detection}
          onChange={(v) => updateSetting({ run_signal_detection: v })}
        />
        <ToggleRow
          label="Show webhook activity in activity feed"
          description="Off hides 'Synced via webhook' entries for a cleaner feed."
          checked={settings.show_in_activity_feed}
          onChange={(v) => updateSetting({ show_in_activity_feed: v })}
        />
      </div>

      {/* Recent calls */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium">Recent webhook calls</h3>
          <Button size="sm" variant="ghost" onClick={load}>Refresh</Button>
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">No webhook calls yet.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Time</th>
                  <th className="text-left px-3 py-2 font-medium">Entity</th>
                  <th className="text-left px-3 py-2 font-medium">Action</th>
                  <th className="text-left px-3 py-2 font-medium">Record</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 capitalize">{l.entity_type}</td>
                    <td className="px-3 py-2 capitalize">{l.action}</td>
                    <td className="px-3 py-2 truncate max-w-[180px]" title={l.record_name || l.error_message || ""}>
                      {l.record_name || (l.error_message ? <span className="text-destructive">{l.error_message}</span> : "—")}
                    </td>
                    <td className="px-3 py-2">
                      {l.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="h-3 w-3" /> Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
