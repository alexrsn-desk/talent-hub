// Relationship Decay Alert scanner.
// Scans the authenticated user's clients + contacts, computes decay status,
// and only persists a surfaced alert when the AI can produce a genuine,
// specific reason to make contact. Uses the Lovable AI Gateway with a
// vendor-neutral chat completions call (no Gemini-specific features).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Kind = "key" | "active" | "bd" | "general";

const ACTIVE_CLIENT_STATUSES = new Set(["Active"]);
const BD_CLIENT_STATUSES = new Set(["Target", "Contacted", "Conversation Started", "Meeting Booked", "Terms Sent", "Approached", "In Dialogue"]);

function classifyClient(c: any, openJobsForClient: number): Kind {
  if (openJobsForClient > 0 || ACTIVE_CLIENT_STATUSES.has(c.status)) return "active";
  if (BD_CLIENT_STATUSES.has(c.status)) return "bd";
  if (c.heat === "hot") return "key";
  return "general";
}

function classifyContact(ct: any, parentKind: Kind | null): Kind {
  if (parentKind && parentKind !== "general") return parentKind;
  if (ct.status === "Active") return "active";
  return "general";
}

function severity(daysSince: number, threshold: number): "pending" | "due" | "at_risk" | "critical" {
  if (daysSince < threshold) return "pending"; // not yet — internal only
  if (daysSince < threshold * 1.5) return "due";
  if (daysSince < threshold * 2.5) return "at_risk";
  return "critical";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Not authenticated" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");

    // Identify user from JWT
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) return json({ error: "Not authenticated" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Settings
    const { data: settingsRow } = await sb
      .from("decay_settings").select("*").eq("user_id", userId).maybeSingle();
    const settings = settingsRow ?? {
      threshold_key: 21, threshold_active: 14, threshold_bd: 30, threshold_general: 60, enabled: true,
    };
    if (settings.enabled === false) return json({ ok: true, alerts: [], skipped: "disabled" });

    const thresholdFor: Record<Kind, number> = {
      key: settings.threshold_key,
      active: settings.threshold_active,
      bd: settings.threshold_bd,
      general: settings.threshold_general,
    };

    // Fetch desk data scoped to this user (RLS not used here because we use service key,
    // so we filter by owner_user_id explicitly).
    const [
      { data: clients },
      { data: contacts },
      { data: jobs },
      { data: notes },
      { data: candidates },
      { data: signals },
    ] = await Promise.all([
      sb.from("clients").select("*").eq("owner_user_id", userId),
      sb.from("contacts").select("*"),
      sb.from("jobs").select("*").eq("owner_user_id", userId),
      sb.from("notes").select("*").eq("owner_user_id", userId).order("created_at", { ascending: false }).limit(800),
      sb.from("candidates").select("id,name,job_title,location,status,summary,current_employer").eq("owner_user_id", userId),
      sb.from("call_signals").select("signal_type,trigger_phrase,explanation,created_at,note_id").eq("status", "unactioned").order("created_at", { ascending: false }).limit(50),
    ]);

    const allClients = clients || [];
    const allContacts = (contacts || []).filter((ct: any) =>
      allClients.some((c: any) => c.id === ct.client_id)
    );
    const allJobs = jobs || [];
    const openJobs = allJobs.filter((j: any) => j.status === "Open");
    const allNotes = notes || [];
    const allCandidates = candidates || [];
    const recentSignals = signals || [];

    const today = new Date();
    const dayMs = 86400000;

    // Build per-entity context
    type Item = {
      entity_type: "client" | "contact";
      entity_id: string;
      entity_name: string;
      company?: string;
      kind: Kind;
      threshold: number;
      daysSince: number;
      status: "pending" | "due" | "at_risk" | "critical";
      lastNotes: any[];
      openJobsHere: any[];
    };

    const items: Item[] = [];

    for (const c of allClients) {
      const openHere = openJobs.filter((j: any) => j.client_id === c.id);
      const kind = classifyClient(c, openHere.length);
      const lastTouchMs = (() => {
        const ns = allNotes.filter((n: any) => n.client_id === c.id);
        if (ns.length === 0 && c.last_activity_date) return new Date(c.last_activity_date).getTime();
        return ns[0]?.created_at ? new Date(ns[0].created_at).getTime() : new Date(c.created_at).getTime();
      })();
      const daysSince = Math.floor((today.getTime() - lastTouchMs) / dayMs);
      const t = thresholdFor[kind];
      items.push({
        entity_type: "client",
        entity_id: c.id,
        entity_name: c.contact_name || c.company_name,
        company: c.company_name,
        kind, threshold: t, daysSince,
        status: severity(daysSince, t),
        lastNotes: allNotes.filter((n: any) => n.client_id === c.id).slice(0, 5),
        openJobsHere: openHere,
      });
    }

    for (const ct of allContacts) {
      const parent = allClients.find((c: any) => c.id === ct.client_id);
      const openHere = parent ? openJobs.filter((j: any) => j.client_id === parent.id) : [];
      const parentKind = parent ? classifyClient(parent, openHere.length) : null;
      const kind = classifyContact(ct, parentKind);
      const lastTouchMs = (() => {
        const ns = allNotes.filter((n: any) => n.client_id === ct.client_id);
        return ns[0]?.created_at ? new Date(ns[0].created_at).getTime() : new Date(ct.created_at).getTime();
      })();
      const daysSince = Math.floor((today.getTime() - lastTouchMs) / dayMs);
      const t = thresholdFor[kind];
      items.push({
        entity_type: "contact",
        entity_id: ct.id,
        entity_name: ct.name,
        company: parent?.company_name,
        kind, threshold: t, daysSince,
        status: severity(daysSince, t),
        lastNotes: allNotes.filter((n: any) => n.client_id === ct.client_id).slice(0, 5),
        openJobsHere: openHere,
      });
    }

    // Load existing alerts to handle snooze + cleanup
    const { data: existingAlerts } = await sb
      .from("decay_alerts").select("*").eq("owner_user_id", userId);
    const existingByKey = new Map<string, any>();
    for (const a of existingAlerts || []) {
      existingByKey.set(`${a.entity_type}:${a.entity_id}`, a);
    }

    const todayDate = today.toISOString().split("T")[0];
    const surfaced: any[] = [];
    const upserts: any[] = [];

    // Cap how many AI calls we make per scan
    const candidatesNeedingReason = items
      .filter((i) => i.status !== "pending")
      .filter((i) => {
        const existing = existingByKey.get(`${i.entity_type}:${i.entity_id}`);
        if (existing?.snoozed_until && existing.snoozed_until > todayDate) return false;
        if (existing?.status === "dismissed") return false;
        return true;
      })
      // Most overdue first, weight by sensitivity
      .sort((a, b) => (b.daysSince - b.threshold) - (a.daysSince - a.threshold))
      .slice(0, 8);

    // Heuristic candidate-matching helper
    const matchingCandidatesFor = (item: Item) => {
      const sectorHint = item.openJobsHere.map((j: any) => `${j.title}`).join(" ").toLowerCase();
      if (!sectorHint) return [] as any[];
      const tokens = sectorHint.split(/\W+/).filter((t) => t.length > 3);
      return allCandidates
        .filter((c: any) => {
          const blob = `${c.job_title || ""} ${c.summary || ""}`.toLowerCase();
          return tokens.some((t) => blob.includes(t));
        })
        .filter((c: any) => ["Active", "New", "Open to Move", "Interviewing"].includes(c.status))
        .slice(0, 5);
    };

    // Mark pending / clear old alerts + persist non-AI fields
    for (const item of items) {
      const key = `${item.entity_type}:${item.entity_id}`;
      const existing = existingByKey.get(key);

      // Healthy -> clear alert if any
      if (item.status === "pending" && item.daysSince < item.threshold) {
        if (existing && existing.status !== "resolved") {
          upserts.push({ ...existing, status: "resolved", resolved_at: new Date().toISOString(), last_scanned_at: new Date().toISOString() });
        }
        continue;
      }
      // Respect snooze
      if (existing?.snoozed_until && existing.snoozed_until > todayDate) continue;

      // Default upsert without surfacing yet
      const row: any = {
        owner_user_id: userId,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        relationship_kind: item.kind,
        status: existing?.reason ? existing.status : "pending",
        days_since_contact: item.daysSince,
        threshold_days: item.threshold,
        reason: existing?.reason ?? null,
        reason_source: existing?.reason_source ?? null,
        suggested_approach: existing?.suggested_approach ?? null,
        channel_suggestion: existing?.channel_suggestion ?? null,
        reason_generated_at: existing?.reason_generated_at ?? null,
        snoozed_until: existing?.snoozed_until ?? null,
        last_scanned_at: new Date().toISOString(),
        surfaced_at: existing?.surfaced_at ?? null,
      };
      if (existing?.id) row.id = existing.id;
      upserts.push(row);
    }

    // Try to generate a reason for each candidate (AI optional — heuristic fallback first)
    for (const item of candidatesNeedingReason) {
      const key = `${item.entity_type}:${item.entity_id}`;
      const existing = existingByKey.get(key);
      const matches = matchingCandidatesFor(item);
      const lastNote = item.lastNotes[0]?.content?.slice(0, 600) || "";
      const channelHints = item.lastNotes
        .map((n: any) => n.activity_type)
        .filter(Boolean)
        .slice(0, 3);

      let reason = "";
      let source: string | null = null;
      let approach = "";
      let channel = "";

      // Source 1: matching candidates
      if (matches.length >= 1 && item.openJobsHere.length > 0) {
        source = "matching_candidates";
        const titles = Array.from(new Set(matches.map((m: any) => m.job_title).filter(Boolean))).slice(0, 2).join(" / ");
        reason = `You have ${matches.length} active candidate${matches.length > 1 ? "s" : ""}${titles ? ` (${titles})` : ""} who could fit ${item.company || "their"} hiring profile. Worth checking if there's a live need right now.`;
        approach = `Lead with the ${titles || "candidates"} — ask whether the role is still live and where they are with hiring this quarter.`;
      }

      // Source 5 / 4: recent signals or candidate intel mentioning company
      if (!reason) {
        const mentioning = recentSignals.find((s: any) => {
          const blob = `${s.trigger_phrase || ""} ${s.explanation || ""}`.toLowerCase();
          return item.company && blob.includes(item.company.toLowerCase());
        });
        if (mentioning) {
          source = "bd_signal";
          reason = `A recent call signal flagged ${item.company}: "${(mentioning.trigger_phrase || "").slice(0, 140)}". That's a genuine conversation starter.`;
          approach = `Open with the signal context — keep it light, frame it as market intel you wanted to share.`;
        }
      }

      // If still no reason and we have an AI key + last note, ask AI to find one in the previous context
      if (!reason && apiKey && lastNote) {
        try {
          const sys = "You read a recruiter's CRM notes and decide whether there is a SPECIFIC, GENUINE reason to make contact again now (not a generic check-in). If yes, return JSON: {\"reason\":\"...\",\"approach\":\"...\",\"channel\":\"...\",\"source\":\"previous_context|market_intel|candidate_intel\"}. If not, return {\"reason\":null}. Never invent facts. Be concise.";
          const user = [
            `Person: ${item.entity_name}${item.company ? ` at ${item.company}` : ""}`,
            `Days since last contact: ${item.daysSince}`,
            `Last note: ${lastNote}`,
            channelHints.length ? `Recent channels used: ${channelHints.join(", ")}` : "",
            "Return JSON only.",
          ].filter(Boolean).join("\n");
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "system", content: sys }, { role: "user", content: user }],
              response_format: { type: "json_object" },
            }),
          });
          if (aiRes.ok) {
            const data = await aiRes.json();
            const txt = data?.choices?.[0]?.message?.content?.trim() || "{}";
            const parsed = JSON.parse(txt);
            if (parsed?.reason) {
              reason = parsed.reason;
              approach = parsed.approach || "";
              channel = parsed.channel || "";
              source = parsed.source || "previous_context";
            }
          }
        } catch (_) {
          // AI failure → leave as pending
        }
      }

      // Channel suggestion fallback
      if (!channel) {
        const lastChannel = channelHints[0];
        if (lastChannel === "WhatsApp") channel = "WhatsApp works for a quick update — call if you want a substantive conversation.";
        else if (lastChannel === "Call") channel = "Call — that's how you've engaged before.";
        else if (lastChannel === "Email") channel = "Email — keep tone direct, reference the specific reason above.";
        else channel = "Email or LinkedIn for the opener — call once they reply.";
      }

      const idx = upserts.findIndex(
        (u) => u.entity_type === item.entity_type && u.entity_id === item.entity_id,
      );
      const target = idx >= 0 ? upserts[idx] : null;

      if (reason && target) {
        target.status = item.status; // due / at_risk / critical
        target.reason = reason;
        target.reason_source = source;
        target.suggested_approach = approach || target.suggested_approach;
        target.channel_suggestion = channel;
        target.reason_generated_at = new Date().toISOString();
        target.surfaced_at = target.surfaced_at || new Date().toISOString();
        surfaced.push({ ...target, entity_name: item.entity_name, company: item.company });
      }
    }

    // Persist
    if (upserts.length > 0) {
      // Strip server-managed columns so PostgREST doesn't send explicit NULLs
      // for rows that don't spread an existing DB row (batched upserts unify
      // the column list, so a missing created_at on one row becomes NULL for all).
      const cleaned = upserts.map(({ created_at, updated_at, ...rest }) => rest);
      const { error: upErr } = await sb
        .from("decay_alerts")
        .upsert(cleaned, { onConflict: "owner_user_id,entity_type,entity_id" });
      if (upErr) return json({ error: upErr.message }, 500);
    }

    return json({ ok: true, surfaced_count: surfaced.length, scanned: items.length });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});
