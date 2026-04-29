import { useEffect, useMemo } from "react";
import { Heart, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDecayAlerts, useRunDecayScan } from "@/hooks/use-decay";
import { useClients, useContacts } from "@/hooks/use-data";
import { DecayAlertCard } from "@/components/DecayAlertCard";

export function DecayAlertsSection() {
  const { data: alerts = [], isLoading } = useDecayAlerts();
  const { data: clients = [] } = useClients();
  const { data: contacts = [] } = useContacts();
  const scan = useRunDecayScan();

  // Auto-scan once per session
  useEffect(() => {
    const key = "decay_scan_last";
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last > 1000 * 60 * 30) {
      sessionStorage.setItem(key, String(Date.now()));
      scan.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enriched = useMemo(() => {
    return alerts.map((a) => {
      if (a.entity_type === "client") {
        const c = clients.find((x) => x.id === a.entity_id);
        return {
          alert: a,
          name: c?.contact_name || c?.company_name || "—",
          company: c?.company_name || null,
          clientId: c?.id || null,
        };
      }
      const ct = contacts.find((x) => x.id === a.entity_id);
      const parent = ct ? clients.find((c) => c.id === ct.client_id) : null;
      return {
        alert: a,
        name: ct?.name || "—",
        company: parent?.company_name || null,
        clientId: parent?.id || ct?.client_id || null,
      };
    });
  }, [alerts, clients, contacts]);

  if (isLoading && enriched.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-pink-400" />
          <h2 className="text-sm font-medium">
            Relationships needing a reason to reach out
            {enriched.length > 0 ? ` (${enriched.length})` : ""}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => scan.mutate()}
          disabled={scan.isPending}
          className="gap-1 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${scan.isPending ? "animate-spin" : ""}`} />
          Rescan
        </Button>
      </div>

      {enriched.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No relationships are due a contact yet — or none have a genuine reason worth surfacing right now.
          A reminder with nothing to say damages a relationship more than silence.
        </p>
      ) : (
        <div className="space-y-2">
          {enriched.map(({ alert, name, company, clientId }) => (
            <DecayAlertCard
              key={alert.id}
              alert={alert}
              entityName={name}
              company={company}
              clientId={clientId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
