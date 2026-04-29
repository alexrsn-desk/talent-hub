import { useDecayAlertForEntity } from "@/hooks/use-decay";
import { DecayAlertCard } from "@/components/DecayAlertCard";

interface Props {
  entityType: "client" | "contact";
  entityId: string;
  entityName: string;
  company?: string | null;
  clientId?: string | null;
}

/**
 * Shows the live decay alert for a single client or contact.
 * Renders nothing unless an alert has been surfaced (i.e. AI found a genuine reason).
 */
export function EntityDecayAlert({ entityType, entityId, entityName, company, clientId }: Props) {
  const { data: alert } = useDecayAlertForEntity(entityType, entityId);
  if (!alert) return null;
  if (!["due", "at_risk", "critical"].includes(alert.status)) return null;
  if (!alert.reason) return null;
  const today = new Date().toISOString().split("T")[0];
  if (alert.snoozed_until && alert.snoozed_until > today) return null;

  return (
    <DecayAlertCard
      alert={alert}
      entityName={entityName}
      company={company}
      clientId={clientId}
    />
  );
}
