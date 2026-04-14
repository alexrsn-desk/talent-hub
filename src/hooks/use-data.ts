import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Types
export type Candidate = {
  id: string;
  name: string;
  job_title: string | null;
  current_employer: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  status: string;
  source: string | null;
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
  last_activity_date: string | null;
  next_action: string | null;
  next_action_due_date: string | null;
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
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
  });
}

export function useDeleteCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
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
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      const { data, error } = await supabase.from("clients").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
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
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
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
    mutationFn: async (link: { candidate_id: string; job_id: string; stage?: string }) => {
      const { data, error } = await supabase.from("candidate_jobs").insert(link).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidate_jobs"] }),
  });
}

export function useUpdateCandidateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { data, error } = await supabase.from("candidate_jobs").update({ stage }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidate_jobs"] }),
  });
}

export function useDeleteCandidateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
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
    mutationFn: async (note: { content: string; candidate_id?: string; client_id?: string; job_id?: string }) => {
      const { data, error } = await supabase.from("notes").insert(note).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
  });
}

// Contacts
export type Contact = {
  id: string;
  client_id: string;
  name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
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
    mutationFn: async (contact: Omit<Contact, "id" | "created_at">) => {
      const { data, error } = await supabase.from("contacts").insert(contact).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}
