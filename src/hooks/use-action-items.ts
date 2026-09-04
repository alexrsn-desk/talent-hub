import { useMemo } from "react";
import { useBillersWorkflow, loadThresholds, type BillerItem } from "@/hooks/use-billers-workflow";
import { useDecayAlerts } from "@/hooks/use-decay";
import { useClients, useContacts, useOverdueFollowUps } from "@/hooks/use-data";
import { useAgedOutBriefItems } from "@/hooks/use-brief-items";

export type ActionTone = "red" | "amber" | "green";

export type ActionItem = {
  id: string;
  /** Urgency colour — red = today, amber = this week, green = worth doing */
  tone: ActionTone;
  /** Where the item came from, shown as a small label */
  source: string;
  title: string;
  /** One line explaining why it is here */
  why: string;
  /** Suggested next step */
  action: string;
  urgency: number;
  href?: string;
  logEntityType?: "candidate" | "client";
  logEntityId?: string;
  logEntityName?: string;
  candidateId?: string;
  sourceQuote?: string;
  sourceLabel?: string;
  /** brief_item_history row id — resolving it clears the "still open" item */
  briefItemId?: string;
};

const narrowTone = (tone: BillerItem["tone"]): ActionTone =>
  tone === "red" ? "red" : tone === "green" ? "green" : "amber";

const sourceOf = (item: BillerItem): string => {
  if (item.kind === "conversation") return "From a call";
  if (item.bdTarget) return "BD target";
  return item.section === "close" ? "Close & protect" : "Feed the beast";
};

/**
 * One prioritised list of everything worth doing, merging the Biller's
 * Workflow detection logic, relationship decay reach-outs, items that aged
 * out of the brief and overdue follow-ups.
 */
export function useActionItems() {
  const thresholds = loadThresholds();
  const { data: workflow, isLoading, refetch, isFetching } = useBillersWorkflow(null, thresholds);
  const { data: decay = [] } = useDecayAlerts();
  const { data: clients = [] } = useClients();
  const { data: contacts = [] } = useContacts();
  const { data: agedOut = [] } = useAgedOutBriefItems();
  const { data: overdue = [] } = useOverdueFollowUps();

  const items = useMemo<ActionItem[]>(() => {
    const out: ActionItem[] = [];

    const fromWorkflow = [
      ...(workflow?.dailyBdTargets || []),
      ...(workflow?.closeProtect || []),
      ...(workflow?.feedTheBeast || []),
    ];
    const seen = new Set<string>();
    for (const it of fromWorkflow) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push({
        id: it.id,
        tone: narrowTone(it.tone),
        source: sourceOf(it),
        title: it.title,
        why: it.signal || it.sub || "",
        action: it.action,
        urgency: it.urgency + (it.bdTarget ? 50 : 0),
        href: it.href,
        logEntityType: it.logEntityType,
        logEntityId: it.logEntityId,
        logEntityName: it.logEntityName,
        candidateId: it.logEntityType === "candidate" ? it.logEntityId : undefined,
        sourceQuote: it.sourceQuote,
        sourceLabel: it.sourceLabel,
      });
    }

    for (const a of decay) {
      const client = a.entity_type === "client" ? clients.find((c) => c.id === a.entity_id) : null;
      const contact = a.entity_type === "contact" ? contacts.find((c) => c.id === a.entity_id) : null;
      const name = client?.contact_name || client?.company_name || contact?.name || "Contact";
      const parent = contact ? clients.find((c) => c.id === contact.client_id) : null;
      out.push({
        id: `decay-${a.id}`,
        tone: a.status === "critical" ? "red" : a.status === "at_risk" ? "amber" : "green",
        source: "Relationship cooling",
        title: `${name}${parent?.company_name ? ` · ${parent.company_name}` : client?.company_name ? ` · ${client.company_name}` : ""}`,
        why: a.reason || `No contact in ${a.days_since_contact} days.`,
        action: a.suggested_approach || "Reach out with a reason worth their time.",
        urgency: 40 + Math.min(a.days_since_contact, 60),
        logEntityType: "client",
        logEntityId: client?.id || contact?.client_id || undefined,
        logEntityName: name,
        href: (client?.id || contact?.client_id) ? `/clients?clientId=${client?.id || contact?.client_id}` : undefined,
      });
    }

    for (const b of agedOut) {
      const days = Math.max(
        1,
        Math.floor((Date.now() - new Date(b.first_surfaced_at).getTime()) / 86400000),
      );
      out.push({
        id: `still-${b.id}`,
        tone: days >= 7 ? "red" : "amber",
        source: "Still open",
        title: b.label,
        why: `Still open — ${days} day${days === 1 ? "" : "s"}: did you action this?`,
        action: "Action it or clear it off the list.",
        urgency: 60 + days,
        briefItemId: b.id,
      });
    }

    for (const n of overdue as any[]) {
      const name = n.candidates?.name || n.clients?.company_name || "Follow-up";
      out.push({
        id: `overdue-${n.id}`,
        tone: "red",
        source: "Overdue follow-up",
        title: `${name} — ${n.activity_type || "Follow-up"}`,
        why: `Was due ${new Date(n.follow_up_date).toLocaleDateString()}.`,
        action: n.content || "Pick this back up.",
        urgency: 90,
        logEntityType: n.candidate_id ? "candidate" : "client",
        logEntityId: n.candidate_id || n.client_id || undefined,
        logEntityName: name,
        candidateId: n.candidate_id || undefined,
      });
    }

    return out.sort((a, b) => b.urgency - a.urgency);
  }, [workflow, decay, clients, contacts, agedOut, overdue]);

  return { items, isLoading, isFetching, refetch };
}

/** Count for the sidebar badge — urgent (red) items outstanding. */
export function useActionsCount() {
  const { items } = useActionItems();
  return {
    total: items.length,
    urgent: items.filter((i) => i.tone === "red").length,
  };
}
