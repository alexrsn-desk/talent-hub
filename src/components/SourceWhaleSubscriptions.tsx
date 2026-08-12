import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, Loader2, Radio } from "lucide-react";

/**
 * SourceWhale only supports two live subscription types (confirmed Aug 2026):
 * candidateCreated and candidateUpdated. There is no subscription for notes,
 * comments, replies or general candidate activity.
 */
const TYPES: { type: string; label: string; description: string }[] = [
  {
    type: "candidateCreated",
    label: "Candidate created",
    description: "A new candidate is added in SourceWhale — creates or links the record on your desk.",
  },
  {
    type: "candidateUpdated",
    label: "Candidate updated",
    description: "Candidate details, stage or status change in SourceWhale — enriches the matching record.",
  },
];

type Subscription = {
  subscription_type: string;
  subscription_id: string;
  target_url: string;
  created_at: string;
};

export function SourceWhaleSubscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "sourcewhale-contacts?action=subscriptions",
        { method: "GET" },
      );
      if (error) throw error;
      setSubs(data?.subscriptions ?? []);
      setTargetUrl(data?.targetUrl ?? "");
    } catch (err: any) {
      console.error(err);
      toast.error("Couldn't load subscriptions", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(type: string, on: boolean) {
    setBusy(type);
    try {
      const { data, error } = await supabase.functions.invoke(
        `sourcewhale-contacts?action=${on ? "subscribe" : "unsubscribe"}`,
        { method: "POST", body: { subscriptionType: type } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(on ? "Live sync switched on" : "Live sync switched off", {
        description: `${type} events ${on ? "will now stream into Desky" : "are no longer received"}.`,
      });
      await load();
    } catch (err: any) {
      console.error(err);
      toast.error("Subscription change failed", { description: err?.message ?? "Unknown error" });
    } finally {
      setBusy(null);
    }
  }

  const active = (type: string) => subs.find((s) => s.subscription_type === type);

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Radio className="h-3.5 w-3.5 text-primary" />
            Live sync
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            SourceWhale pushes events to Desky as they happen — no polling. Only candidate created and
            candidate updated are supported; notes, replies and comments still arrive via sync.
          </p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="space-y-3">
        {TYPES.map((t) => {
          const sub = active(t.type);
          return (
            <div key={t.type} className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t.label}</span>
                  <code className="text-[11px] text-muted-foreground font-mono">{t.type}</code>
                  {sub && (
                    <Badge variant="secondary" className="text-[10px]">
                      Live since {new Date(sub.created_at).toLocaleDateString()}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {busy === t.type && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Switch
                  checked={!!sub}
                  disabled={loading || busy === t.type}
                  onCheckedChange={(v) => toggle(t.type, v)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {targetUrl && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Receiving endpoint</label>
          <div className="flex gap-2">
            <Input value={targetUrl} readOnly className="font-mono text-xs" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(targetUrl);
                toast.success("Endpoint copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
