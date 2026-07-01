// Builds the candidate/contact/client list for a Reactivation Campaign,
// based on filters or a pre-populated trigger group.
// Vendor-neutral (Gemini & Claude compatible) — pure DB query, no AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

type Kind = "past_client" | "warm_prospect" | "placed_candidate" | "cold_contact" | "general";

type Filters = {
  kinds: Kind[];
  lastContactBucket: "30-60" | "60-90" | "90+";
  requireRelationship: boolean;
  group?: string; // optional pre-populated trigger group key
  contactIds?: string[]; // optional explicit ids
};

function daysSince(iso?: string | null): number {
  if (!iso) return 9999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}
function bucketMatches(d: number, b: Filters["lastContactBucket"]): boolean {
  if (b === "30-60") return d >= 30 && d < 60;
  if (b === "60-90") return d >= 60 && d < 90;
  return d >= 90;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const filters: Filters = await req.json();

    // Pull all relevant context for this owner
    const [clientsRes, contactsRes, candidatesRes, placementsRes, notesRes] = await Promise.all([
      supabase.from("clients").select("id,company_name,contact_name,email,status,last_activity_date,created_at").eq("owner_user_id", user.id),
      supabase.from("contacts").select("id,first_name,last_name,name,client_id,email,status,created_at,clients(company_name)").eq("owner_user_id", user.id),
      supabase.from("candidates").select("id,name,first_name,last_name,email,current_employer,job_title,status,created_at").eq("owner_user_id", user.id),
      supabase.from("placements").select("id,client_id,candidate_id,client_name_snapshot,candidate_name_snapshot,offer_accepted_date,start_date,status").eq("owner_user_id", user.id),
      supabase.from("notes").select("id,client_id,candidate_id,content,created_at").eq("owner_user_id", user.id).order("created_at", { ascending: false }).limit(2000),
    ]);

    const clients = clientsRes.data || [];
    const contacts = contactsRes.data || [];
    const candidates = candidatesRes.data || [];
    const placements = (placementsRes.data || []).filter((p: any) => p.status !== "fallen_through");
    const notes = notesRes.data || [];

    const notesByClient = new Map<string, any[]>();
    const notesByCand = new Map<string, any[]>();
    for (const n of notes) {
      if (n.client_id) { const a = notesByClient.get(n.client_id) || []; a.push(n); notesByClient.set(n.client_id, a); }
      if (n.candidate_id) { const a = notesByCand.get(n.candidate_id) || []; a.push(n); notesByCand.set(n.candidate_id, a); }
    }

    const placedClientIds = new Set(placements.map((p: any) => p.client_id));
    const placedCandIds = new Set(placements.map((p: any) => p.candidate_id));

    type Row = {
      kind: Kind;
      id: string;
      name: string;
      company: string;
      email: string | null;
      lastContactedDays: number;
      contextLine: string;
      touchpoints: number;
      hasPlacement: boolean;
      relationshipWarm: boolean;
    };
    const rows: Row[] = [];

    if (filters.kinds.includes("past_client")) {
      for (const c of clients as any[]) {
        if (!placedClientIds.has(c.id)) continue;
        const ln = (notesByClient.get(c.id) || [])[0];
        const d = daysSince(ln?.created_at || c.last_activity_date);
        if (!bucketMatches(d, filters.lastContactBucket)) continue;
        const p = placements.find((x: any) => x.client_id === c.id);
        const months = p ? Math.max(1, Math.floor(daysSince(p.offer_accepted_date || p.start_date) / 30)) : 0;
        rows.push({
          kind: "past_client", id: c.id,
          name: c.contact_name || c.company_name, company: c.company_name,
          email: c.contact_email,
          lastContactedDays: d,
          contextLine: months ? `Placed here ${months} month${months === 1 ? "" : "s"} ago` : "Past client",
          touchpoints: (notesByClient.get(c.id) || []).length,
          hasPlacement: true, relationshipWarm: true,
        });
      }
    }

    if (filters.kinds.includes("warm_prospect")) {
      for (const c of clients as any[]) {
        const st = (c.status || "").toLowerCase();
        if (!st.includes("warm") && !st.includes("prospect")) continue;
        if (placedClientIds.has(c.id)) continue;
        const ln = (notesByClient.get(c.id) || [])[0];
        const d = daysSince(ln?.created_at || c.last_activity_date);
        if (!bucketMatches(d, filters.lastContactBucket)) continue;
        const lastNote = (notesByClient.get(c.id) || [])[0]?.content as string | undefined;
        rows.push({
          kind: "warm_prospect", id: c.id,
          name: c.contact_name || c.company_name, company: c.company_name,
          email: c.contact_email,
          lastContactedDays: d,
          contextLine: lastNote ? `Last note: ${lastNote.slice(0, 80)}` : "Warm prospect — went quiet",
          touchpoints: (notesByClient.get(c.id) || []).length,
          hasPlacement: false, relationshipWarm: true,
        });
      }
    }

    if (filters.kinds.includes("placed_candidate")) {
      for (const cand of candidates as any[]) {
        if (!placedCandIds.has(cand.id)) continue;
        const ln = (notesByCand.get(cand.id) || [])[0];
        const d = daysSince(ln?.created_at);
        if (!bucketMatches(d, filters.lastContactBucket)) continue;
        const p = placements.find((x: any) => x.candidate_id === cand.id);
        const company = p?.client_name_snapshot || cand.current_company || "—";
        const months = p ? Math.max(1, Math.floor(daysSince(p.offer_accepted_date || p.start_date) / 30)) : 0;
        rows.push({
          kind: "placed_candidate", id: cand.id,
          name: cand.name, company,
          email: cand.email,
          lastContactedDays: d,
          contextLine: months ? `Placed at ${company} ${months} month${months === 1 ? "" : "s"} ago — strong referral source` : `Placed at ${company}`,
          touchpoints: (notesByCand.get(cand.id) || []).length,
          hasPlacement: true, relationshipWarm: true,
        });
      }
    }

    if (filters.kinds.includes("cold_contact") || filters.kinds.includes("general")) {
      for (const c of contacts as any[]) {
        const d = daysSince(c.last_contacted_at);
        if (!bucketMatches(d, filters.lastContactBucket)) continue;
        const tps = (notesByContact.get(c.id) || []).length;
        rows.push({
          kind: "cold_contact", id: c.id,
          name: c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim(),
          company: c.company_name || "—",
          email: c.email,
          lastContactedDays: d,
          contextLine: tps > 0 ? `${tps} touchpoint${tps === 1 ? "" : "s"} logged` : "Network contact",
          touchpoints: tps,
          hasPlacement: false, relationshipWarm: tps >= 2,
        });
      }
    }

    // Relationship-quality gate
    let filtered = rows;
    if (filters.requireRelationship) {
      filtered = rows.filter(r => r.touchpoints >= 2 || r.hasPlacement || r.relationshipWarm);
    }

    // Restrict to explicit ids if provided
    if (filters.contactIds && filters.contactIds.length) {
      const set = new Set(filters.contactIds);
      filtered = filtered.filter(r => set.has(r.id));
    }

    return json({ rows: filtered });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
