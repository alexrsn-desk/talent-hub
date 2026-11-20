import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Channel = "sms" | "whatsapp" | "email";
export type ThreadState = "needs_action" | "waiting" | "handled";

export type HubMessage = {
  id: string;
  channel: Channel | "logged";
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
  label?: string;
};

export type HubThread = {
  key: string;
  kind: "candidate" | "client";
  id: string;
  name: string;
  subtitle: string | null;
  phone: string | null;
  email: string | null;
  dnc: boolean;
  messages: HubMessage[];
  last: HubMessage | null;
  state: ThreadState;
  lastChannel: Channel | "logged" | null;
};

const LOGGED_CHANNEL: Record<string, Channel | "logged"> = {
  "Text Message": "sms", WhatsApp: "whatsapp", Email: "email",
};
const COMMS_TYPES = ["Text Message", "WhatsApp", "Email", "Call", "LinkedIn Message", "Follow-up"];

/** Ball in our court if the latest message is an inbound actionable one. */
export function threadState(messages: { direction: string; needs_action?: boolean }[]): ThreadState {
  const last = messages[messages.length - 1];
  if (!last) return "handled";
  if (last.direction === "inbound") return last.needs_action === false ? "handled" : "needs_action";
  return "waiting";
}

export function useConversationHub() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`conv-hub-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["conversation-hub"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return useQuery({
    queryKey: ["conversation-hub"],
    queryFn: async (): Promise<HubThread[]> => {
      const since = new Date(Date.now() - 90 * 864e5).toISOString();
      const [msgRes, notesRes] = await Promise.all([
        supabase.from("conversation_messages").select("*").gte("created_at", since).order("created_at", { ascending: true }).limit(2000),
        supabase.from("notes").select("id,candidate_id,client_id,activity_type,content,created_at")
          .in("activity_type", COMMS_TYPES).gte("created_at", since).order("created_at", { ascending: true }).limit(2000),
      ]);
      if (msgRes.error) throw msgRes.error;
      const msgs = msgRes.data ?? [];
      const notes = notesRes.data ?? [];
      // Skip notes that just mirror a message we already have.
      const mirrored = (c: string) => c.startsWith("Text sent") || c.startsWith("Reply received") || c.startsWith("WhatsApp sent") || c.startsWith("Email sent via Desky");

      const candIds = new Set<string>(), clientIds = new Set<string>();
      for (const m of msgs) { if (m.candidate_id) candIds.add(m.candidate_id); else if (m.client_id) clientIds.add(m.client_id); }
      for (const n of notes) { if (n.candidate_id) candIds.add(n.candidate_id); else if (n.client_id) clientIds.add(n.client_id); }

      const [cands, clients] = await Promise.all([
        candIds.size ? supabase.from("candidates").select("id,name,job_title,current_employer,phone,email,do_not_contact,gdpr_deleted,status").in("id", [...candIds].slice(0, 500)) : Promise.resolve({ data: [] as any[] }),
        clientIds.size ? supabase.from("clients").select("id,company_name,contact_name,phone,email").in("id", [...clientIds].slice(0, 500)) : Promise.resolve({ data: [] as any[] }),
      ]);

      const threads = new Map<string, HubThread & { raw: { direction: string; needs_action?: boolean }[] }>();
      for (const c of cands.data ?? []) {
        if (c.gdpr_deleted) continue;
        threads.set(`candidate:${c.id}`, {
          key: `candidate:${c.id}`, kind: "candidate", id: c.id, name: c.name,
          subtitle: [c.job_title, c.current_employer].filter(Boolean).join(" · ") || null,
          phone: c.phone, email: c.email, dnc: !!c.do_not_contact || c.status === "Do Not Contact",
          messages: [], last: null, state: "handled", lastChannel: null, raw: [],
        });
      }
      for (const c of clients.data ?? []) {
        threads.set(`client:${c.id}`, {
          key: `client:${c.id}`, kind: "client", id: c.id, name: c.contact_name || c.company_name,
          subtitle: c.contact_name ? c.company_name : null, phone: c.phone, email: c.email, dnc: false,
          messages: [], last: null, state: "handled", lastChannel: null, raw: [],
        });
      }

      type Item = { at: string; msg: HubMessage; raw: { direction: string; needs_action?: boolean }; key: string };
      const items: Item[] = [];
      for (const m of msgs) {
        const key = m.candidate_id ? `candidate:${m.candidate_id}` : `client:${m.client_id}`;
        items.push({ at: m.created_at, key, raw: m, msg: { id: m.id, channel: m.channel as Channel, direction: m.direction as any, body: m.body, created_at: m.created_at } });
      }
      for (const n of notes) {
        if (mirrored(n.content)) continue;
        const key = n.candidate_id ? `candidate:${n.candidate_id}` : `client:${n.client_id}`;
        items.push({ at: n.created_at, key, raw: { direction: "outbound" }, msg: { id: `note-${n.id}`, channel: LOGGED_CHANNEL[n.activity_type] ?? "logged", direction: "outbound", body: n.content, created_at: n.created_at, label: `Logged ${n.activity_type.toLowerCase()}` } });
      }
      items.sort((a, b) => a.at.localeCompare(b.at));
      for (const it of items) {
        const t = threads.get(it.key);
        if (!t) continue;
        t.messages.push(it.msg); t.raw.push(it.raw);
      }
      const out: HubThread[] = [];
      for (const t of threads.values()) {
        if (!t.messages.length) continue;
        t.last = t.messages[t.messages.length - 1];
        t.lastChannel = t.last.channel;
        t.state = threadState(t.raw);
        const { raw: _r, ...rest } = t;
        out.push(rest);
      }
      return out.sort((a, b) => (b.last!.created_at).localeCompare(a.last!.created_at));
    },
  });
}
