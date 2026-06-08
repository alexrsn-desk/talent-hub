import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LiveCandidateRow = {
  kind: "candidate";
  id: string;
  name: string;
  job_title: string | null;
  current_employer: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  last_touchpoint: { type: string; date: string; content: string } | null;
  next_follow_up: string | null;
  reasons: string[];
};

export type LiveContactRow = {
  kind: "client";
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_id?: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  bd_stage: string | null;
  heat: string | null;
  last_touchpoint: { type: string; date: string; content: string } | null;
  next_follow_up: string | null;
  reasons: string[];
};

export type LiveConversationsData = {
  candidates: LiveCandidateRow[];
  clients: LiveContactRow[];
  overdueCount: number;
};

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function inDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const PIPELINE_BEYOND = new Set([
  "Submitted",
  "Client Review",
  "First Interview",
  "Second Interview",
  "Final Interview",
  "Offer",
  "Placed",
]);

export function useLiveConversations(timeframeDays: number = 30) {
  return useQuery({
    queryKey: ["live-conversations", timeframeDays],
    queryFn: async (): Promise<LiveConversationsData> => {
      const since = daysAgoISO(Math.max(timeframeDays, 14));
      const today = todayISO();
      const in7 = inDaysISO(7);

      const [notesRes, candidatesRes, clientsRes, contactsRes, cjRes] = await Promise.all([
        supabase
          .from("notes")
          .select("id,candidate_id,client_id,activity_type,content,created_at,follow_up_date")
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
        supabase
          .from("candidates")
          .select("id,name,job_title,current_employer,email,phone,status,reengage_date,priority_followup_date")
          .in("status", ["Active", "Passive"]),
        supabase
          .from("clients")
          .select("id,company_name,contact_name,job_title,email,phone,status,heat,next_action_due_date,next_followup_date"),
        supabase
          .from("contacts")
          .select("id,client_id,name,job_title,email,phone"),
        supabase
          .from("candidate_jobs")
          .select("candidate_id,stage"),
      ]);

      const notes = notesRes.data || [];
      const candidates = candidatesRes.data || [];
      const clients = clientsRes.data || [];
      const contacts = contactsRes.data || [];
      const cjs = cjRes.data || [];

      // Build "beyond submitted" candidate set
      const beyondSubmittedCandidates = new Set<string>();
      for (const cj of cjs) {
        if (PIPELINE_BEYOND.has(cj.stage)) beyondSubmittedCandidates.add(cj.candidate_id);
      }

      // Group latest note per candidate / per client
      const latestCandNote = new Map<string, any>();
      const latestClientNote = new Map<string, any>();
      // Track latest follow_up_date per entity (most recent note's follow_up_date)
      for (const n of notes) {
        if (n.candidate_id && !latestCandNote.has(n.candidate_id)) latestCandNote.set(n.candidate_id, n);
        if (n.client_id && !latestClientNote.has(n.client_id)) latestClientNote.set(n.client_id, n);
      }

      // Map contacts by client
      const primaryContactByClient = new Map<string, any>();
      for (const c of contacts) {
        if (!primaryContactByClient.has(c.client_id)) primaryContactByClient.set(c.client_id, c);
      }

      // --- Candidate rows ---
      const sinceTouch = daysAgoISO(30);
      const candidateRows: LiveCandidateRow[] = [];
      for (const c of candidates) {
        const note = latestCandNote.get(c.id);
        const reasons: string[] = [];
        const beyond = beyondSubmittedCandidates.has(c.id);

        const recent = note && note.created_at >= sinceTouch && !beyond;
        if (recent) reasons.push("Recent touchpoint");

        const fud = note?.follow_up_date || c.priority_followup_date || null;
        if (fud && fud <= in7) reasons.push("Follow-up due");

        if (c.reengage_date && c.reengage_date <= today) reasons.push("Re-engage date reached");

        if (reasons.length === 0) continue;

        candidateRows.push({
          kind: "candidate",
          id: c.id,
          name: c.name,
          job_title: c.job_title,
          current_employer: c.current_employer,
          email: c.email,
          phone: c.phone,
          status: c.status,
          last_touchpoint: note
            ? { type: note.activity_type, date: note.created_at, content: note.content }
            : null,
          next_follow_up: fud,
          reasons,
        });
      }

      // --- Client/contact rows ---
      const since14 = daysAgoISO(14);
      const ACTIVE_BD_STAGES = new Set(["Conversation Started", "Meeting Booked", "Terms Sent"]);
      const clientRows: LiveContactRow[] = [];
      for (const cl of clients) {
        const note = latestClientNote.get(cl.id);
        const reasons: string[] = [];
        const recent = note && note.created_at >= since14;
        const fud = note?.follow_up_date || cl.next_followup_date || cl.next_action_due_date || null;
        const inActiveBD = ACTIVE_BD_STAGES.has(cl.status);

        if (recent && fud) reasons.push("Recent touchpoint + follow-up");
        if (inActiveBD) reasons.push(`In BD: ${cl.status}`);

        if (reasons.length === 0) continue;

        const primary = primaryContactByClient.get(cl.id);
        clientRows.push({
          kind: "client",
          id: cl.id,
          company_name: cl.company_name,
          contact_name: primary?.name || cl.contact_name || null,
          contact_id: primary?.id || null,
          job_title: primary?.job_title || cl.job_title,
          email: primary?.email || cl.email,
          phone: primary?.phone || cl.phone,
          bd_stage: cl.status,
          heat: cl.heat,
          last_touchpoint: note
            ? { type: note.activity_type, date: note.created_at, content: note.content }
            : null,
          next_follow_up: fud,
          reasons,
        });
      }

      const overdueCount =
        candidateRows.filter((r) => r.next_follow_up && r.next_follow_up < today).length +
        clientRows.filter((r) => r.next_follow_up && r.next_follow_up < today).length;

      return { candidates: candidateRows, clients: clientRows, overdueCount };
    },
    staleTime: 60_000,
  });
}

export function useLiveConversationsOverdueCount() {
  const { data } = useLiveConversations(30);
  return data?.overdueCount ?? 0;
}
