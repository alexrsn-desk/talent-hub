import { supabase } from "@/integrations/supabase/client";

export type DncRow = {
  id: string;
  name: string;
  do_not_contact: boolean | null;
  dnc_reason: string | null;
  dnc_set_at: string | null;
  status?: string | null;
};

const tableFor = (t: "candidate" | "contact") => (t === "candidate" ? "candidates" : "contacts");

/**
 * Throw a friendly error if the entity is marked Do Not Contact.
 * Used as a hard block before any outreach action (sequences, check-ins, bulk).
 */
export async function assertNotDoNotContact(
  entityType: "candidate" | "contact",
  entityId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from(tableFor(entityType) as any)
    .select("id, name, do_not_contact, dnc_reason, dnc_set_at, status")
    .eq("id", entityId)
    .maybeSingle();
  if (error) return; // never block on a read failure
  const row = data as DncRow | null;
  if (!row) return;
  const isDnc = row.do_not_contact === true || row.status === "Do Not Contact";
  if (!isDnc) return;
  const date = row.dnc_set_at ? new Date(row.dnc_set_at).toLocaleDateString() : "earlier";
  const reason = row.dnc_reason ?? "Do Not Contact";
  throw new Error(
    `⛔ ${row.name} is marked Do Not Contact. They cannot be added to outreach.\nSet ${date}. Reason: ${reason}`,
  );
}

/** Filter out DNC entities from a list, returning kept and blocked. */
export async function filterDoNotContact(
  entityType: "candidate" | "contact",
  ids: string[],
): Promise<{ allowed: string[]; blocked: { id: string; name: string }[] }> {
  if (ids.length === 0) return { allowed: [], blocked: [] };
  const { data, error } = await supabase
    .from(tableFor(entityType) as any)
    .select("id, name, do_not_contact, status")
    .in("id", ids);
  if (error) return { allowed: ids, blocked: [] };
  const blocked: { id: string; name: string }[] = [];
  const allowed: string[] = [];
  for (const r of (data as any[]) ?? []) {
    if (r.do_not_contact === true || r.status === "Do Not Contact") {
      blocked.push({ id: r.id, name: r.name });
    } else {
      allowed.push(r.id);
    }
  }
  return { allowed, blocked };
}
