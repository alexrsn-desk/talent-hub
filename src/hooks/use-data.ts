import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { upsertCallRefNote } from "@/lib/call-reference";

// Types
export type Candidate = {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  current_employer: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  status: string;
  source: string | null;
  salary_current: number | null;
  salary_expectation: number | null;
  availability: string | null;
  summary?: string | null;
  priority_flag: boolean;
  priority_reason: string | null;
  priority_flagged_at: string | null;
  priority_followup_date: string | null;
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: string;
  company_name: string;
  contact_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  sector: string | null;
  status: string;
  location: string | null;
  website: string | null;
  summary?: string | null;
  last_activity_date: string | null;
  next_action: string | null;
  next_action_due_date: string | null;
  next_followup_date: string | null;
  created_at: string;
  updated_at: string;
};

export type Job = {
  id: string;
  title: string;
  client_id: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  job_type: string;
  status: string;
  fee_type: string | null;
  fee_value: number | null;
  date_opened: string;
  created_at: string;
  updated_at: string;
  clients?: Client | null;
};

export type CandidateJob = {
  id: string;
  candidate_id: string;
  job_id: string;
  stage: string;
  source: string; // 'ai' | 'manual'
  stage_changed_at: string;
  rejection_reason: string | null;
  interview_date: string | null;
  created_at: string;
  candidates?: Candidate;
  jobs?: Job & { clients?: Client | null };
};

export type Note = {
  id: string;
  candidate_id: string | null;
  client_id: string | null;
  job_id: string | null;
  content: string;
  activity_type: string;
  outcome: string | null;
  follow_up_date: string | null;
  duration: number | null;
  transcript: string | null;
  created_at: string;
};

// Candidates
export function useCandidates() {
  return useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Candidate[];
    },
  });
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: ["candidates", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Candidate;
    },
    enabled: !!id,
  });
}

export function useCreateCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidate: Omit<Candidate, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("candidates").insert(candidate).select().single();
      if (error) throw error;
      await logActivity({ action_type: "candidate_created", candidate_id: data.id, metadata: { name: data.name } });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

export function useUpdateCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Candidate> & { id: string }) => {
      const { data, error } = await supabase.from("candidates").update(updates).eq("id", id).select().single();
      if (error) throw error;
      await logActivity({ action_type: "candidate_updated", candidate_id: id, metadata: { fields_updated: Object.keys(updates) } });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

export function useDeleteCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await logActivity({ action_type: "candidate_deleted", candidate_id: id });
      const { error } = await supabase.from("candidates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

// Clients
export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: Omit<Client, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase.from("clients").insert(client).select().single();
      if (error) throw error;
      await logActivity({ action_type: "client_created", client_id: data.id, metadata: { company_name: data.company_name } });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      // Capture old status for BD stage changes
      const { data: old } = await supabase.from("clients").select("status").eq("id", id).single();
      const { data, error } = await supabase.from("clients").update(updates).eq("id", id).select().single();
      if (error) throw error;
      const meta: Record<string, any> = { fields_updated: Object.keys(updates) };
      if (updates.status && old && old.status !== updates.status) {
        meta.stage_from = old.status;
        meta.stage_to = updates.status;
      }
      await logActivity({ action_type: "client_updated", client_id: id, metadata: meta });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await logActivity({ action_type: "client_deleted", client_id: id });
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

// Jobs
export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*, clients(*)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Job[];
    },
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: Omit<Job, "id" | "created_at" | "updated_at" | "clients">) => {
      const { data, error } = await supabase.from("jobs").insert(job).select().single();
      if (error) throw error;
      await logActivity({ action_type: "job_created", job_id: data.id, client_id: data.client_id, metadata: { title: data.title } });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Job> & { id: string }) => {
      const { clients, ...cleanUpdates } = updates as any;
      const { data, error } = await supabase.from("jobs").update(cleanUpdates).eq("id", id).select().single();
      if (error) throw error;
      await logActivity({ action_type: "job_updated", job_id: id, metadata: { fields_updated: Object.keys(cleanUpdates) } });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await logActivity({ action_type: "job_deleted", job_id: id });
      const { error } = await supabase.from("jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

// Candidate Jobs
export function useCandidateJobs(candidateId?: string, jobId?: string) {
  return useQuery({
    queryKey: ["candidate_jobs", candidateId, jobId],
    queryFn: async () => {
      let query = supabase.from("candidate_jobs").select("*, candidates(*), jobs(*, clients(*))");
      if (candidateId) query = query.eq("candidate_id", candidateId);
      if (jobId) query = query.eq("job_id", jobId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data as CandidateJob[];
    },
  });
}

export function useCreateCandidateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (link: { candidate_id: string; job_id: string; stage?: string; source?: string }) => {
      const { data, error } = await supabase.from("candidate_jobs").insert(link as any).select().single();
      if (error) throw error;
      await logActivity({
        action_type: "candidate_job_linked",
        candidate_id: link.candidate_id,
        job_id: link.job_id,
        candidate_job_id: data.id,
        metadata: { stage: data.stage },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidate_jobs"] }),
  });
}

export function useUpdateCandidateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; stage?: string; interview_date?: string | null; rejection_reason?: string | null }) => {
      // Capture old stage for stage_change logging
      const { data: old } = await supabase.from("candidate_jobs").select("stage, candidate_id, job_id").eq("id", id).single();
      const { data, error } = await supabase.from("candidate_jobs").update(updates).eq("id", id).select().single();
      if (error) throw error;
      const actionType = updates.stage && old && old.stage !== updates.stage ? "stage_change" : "candidate_job_linked";
      await logActivity({
        action_type: actionType,
        candidate_id: old?.candidate_id,
        job_id: old?.job_id,
        candidate_job_id: id,
        metadata: {
          ...(updates.stage && old ? { stage_from: old.stage, stage_to: updates.stage } : {}),
          ...(updates.interview_date ? { interview_date: updates.interview_date } : {}),
        },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidate_jobs"] }),
  });
}

export function useDeleteCandidateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: old } = await supabase.from("candidate_jobs").select("candidate_id, job_id").eq("id", id).single();
      await logActivity({ action_type: "candidate_job_unlinked", candidate_id: old?.candidate_id, job_id: old?.job_id, candidate_job_id: id });
      const { error } = await supabase.from("candidate_jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidate_jobs"] }),
  });
}

// Notes
export function useNotes(entityType: "candidate" | "client" | "job", entityId: string) {
  const column = entityType === "candidate" ? "candidate_id" : entityType === "client" ? "client_id" : "job_id";
  return useQuery({
    queryKey: ["notes", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase.from("notes").select("*").eq(column, entityId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Note[];
    },
    enabled: !!entityId,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: { content: string; activity_type?: string; outcome?: string; follow_up_date?: string; duration?: number | null; transcript?: string | null; candidate_id?: string; client_id?: string; job_id?: string; source?: string }) => {
      const { source, ...insertNote } = note as any;
      const { data, error } = await supabase.from("notes").insert(insertNote).select().single();
      if (error) throw error;
      await logActivity({
        action_type: note.activity_type && note.activity_type !== "Note" ? "touchpoint_logged" : "note_created",
        candidate_id: note.candidate_id,
        client_id: note.client_id,
        job_id: note.job_id,
        metadata: { activity_type: note.activity_type, outcome: note.outcome, follow_up_date: note.follow_up_date },
      });
      // Auto-create a Notes-tab reference entry for any Call record
      if (data && note.activity_type === "Call") {
        await upsertCallRefNote({
          callNoteId: data.id,
          source: source || (note.transcript ? "Recorded" : "Manual entry"),
          duration: note.duration ?? null,
          outcome: note.outcome ?? null,
          candidate_id: note.candidate_id ?? null,
          client_id: note.client_id ?? null,
          job_id: note.job_id ?? null,
          created_at: data.created_at,
        });
      }
      // Auto-trigger signal detection AND insight extraction on any saved content
      const scanText = (data?.transcript || "") + (data?.content || "");
      if (data && scanText.length >= 20) {
        supabase.functions.invoke("detect-signals", { body: { note_id: data.id } }).catch(console.error);
        // Field + tag extraction (only meaningful when linked to a candidate)
        if (data.candidate_id) {
          supabase.functions.invoke("extract-insights", { body: { note_id: data.id } }).catch(console.error);
        }
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      // Signals + insights populate async, invalidate after a delay
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["call-signals"] });
        qc.invalidateQueries({ queryKey: ["call-signal-counts"] });
        qc.invalidateQueries({ queryKey: ["call-signals-unactioned"] });
        qc.invalidateQueries({ queryKey: ["call-insights"] });
      }, 5000);
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; content?: string; outcome?: string; duration?: number | null; transcript?: string | null; follow_up_date?: string | null }) => {
      const { id, ...updates } = params;
      const { error } = await supabase.from("notes").update(updates).eq("id", id);
      if (error) throw error;
      // Re-run signal detection + insight extraction whenever content or transcript was touched
      if (updates.content !== undefined || updates.transcript !== undefined) {
        const scanText = (updates.transcript || "") + (updates.content || "");
        if (scanText.length >= 20) {
          supabase.functions.invoke("detect-signals", { body: { note_id: id } }).catch(console.error);
          supabase.functions.invoke("extract-insights", { body: { note_id: id } }).catch(console.error);
        }
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["call-signals"] });
        qc.invalidateQueries({ queryKey: ["call-signal-counts"] });
        qc.invalidateQueries({ queryKey: ["call-signals-unactioned"] });
        qc.invalidateQueries({ queryKey: ["call-insights", vars.id] });
      }, 5000);
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // If this is a call note, also delete any reference entries pointing to it
      await supabase.from("notes").delete().ilike("content", `[CALL_REF:${id}]%`);
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["call-signals"] });
      qc.invalidateQueries({ queryKey: ["call-signal-counts"] });
    },
  });
}

export function useTodayFollowUps() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["notes", "follow_ups", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, candidates(*), clients(*)")
        .eq("follow_up_date", today)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (Note & { candidates: any; clients: any })[];
    },
  });
}

export function useOverdueFollowUps() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["notes", "overdue", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, candidates(*), clients(*)")
        .not("follow_up_date", "is", null)
        .lt("follow_up_date", today)
        .order("follow_up_date", { ascending: true });
      if (error) throw error;
      return data as (Note & { candidates: any; clients: any })[];
    },
  });
}

export function useTodayInterviews() {
  return useQuery({
    queryKey: ["candidate_jobs", "interviews_today"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_jobs")
        .select("*, candidates(*), jobs(*, clients(*))")
        .eq("stage", "Interview");
      if (error) throw error;
      return data as CandidateJob[];
    },
  });
}

// Contacts
export type Contact = {
  id: string;
  client_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  status: string;
  personal_email: string | null;
  mobile_phone: string | null;
  direct_phone: string | null;
  summary?: string | null;
  created_at: string;
};

export function useContacts(clientId?: string) {
  return useQuery({
    queryKey: ["contacts", clientId],
    queryFn: async () => {
      let query = supabase.from("contacts").select("*").order("created_at", { ascending: true });
      if (clientId) query = query.eq("client_id", clientId);
      const { data, error } = await query;
      if (error) throw error;
      return data as Contact[];
    },
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contact: Omit<Contact, "id" | "created_at" | "status" | "personal_email" | "mobile_phone" | "direct_phone"> & Partial<Pick<Contact, "status" | "personal_email" | "mobile_phone" | "direct_phone">>) => {
      const { data, error } = await supabase.from("contacts").insert(contact).select().single();
      if (error) throw error;
      await logActivity({ action_type: "contact_created", client_id: contact.client_id, metadata: { name: contact.name } });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: old } = await supabase.from("contacts").select("client_id, name").eq("id", id).single();
      await logActivity({ action_type: "contact_deleted", client_id: old?.client_id, metadata: { name: old?.name } });
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}
