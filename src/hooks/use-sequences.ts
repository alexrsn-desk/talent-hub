import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Sequence = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SequenceStep = {
  id: string;
  sequence_id: string;
  step_number: number;
  day_offset: number;
  channel: string;
  message_prompt: string | null;
  note: string | null;
};

export type SequenceEnrollment = {
  id: string;
  sequence_id: string;
  candidate_id: string | null;
  client_id: string | null;
  job_id: string | null;
  start_date: string;
  status: string;
  current_step: number;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  candidates?: { id: string; name: string } | null;
  jobs?: { id: string; title: string } | null;
};

export type SequenceTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  steps: Array<{
    step_number: number;
    day_offset: number;
    channel: string;
    message_prompt: string;
    note?: string;
  }>;
};

export function useSequences() {
  return useQuery({
    queryKey: ["sequences"],
    queryFn: async (): Promise<Sequence[]> => {
      const { data, error } = await supabase
        .from("sequences")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSequenceSteps(sequenceId: string | null) {
  return useQuery({
    queryKey: ["sequence_steps", sequenceId],
    enabled: !!sequenceId,
    queryFn: async (): Promise<SequenceStep[]> => {
      const { data, error } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", sequenceId!)
        .order("step_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSequenceEnrollments(sequenceId: string | null) {
  return useQuery({
    queryKey: ["sequence_enrollments", sequenceId],
    enabled: !!sequenceId,
    queryFn: async (): Promise<SequenceEnrollment[]> => {
      const { data, error } = await supabase
        .from("sequence_enrollments")
        .select("*, candidates(id,name), jobs(id,title)")
        .eq("sequence_id", sequenceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useSequenceTemplates() {
  return useQuery({
    queryKey: ["sequence_templates"],
    queryFn: async (): Promise<SequenceTemplate[]> => {
      const { data, error } = await supabase
        .from("sequence_templates")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useCreateSequenceFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; template?: SequenceTemplate | null }) => {
      const { data: seq, error } = await supabase
        .from("sequences")
        .insert({ name: input.name, description: input.description ?? null, type: "personal", status: "active" })
        .select()
        .single();
      if (error) throw error;

      if (input.template) {
        const rows = input.template.steps.map((s) => ({
          sequence_id: seq.id,
          step_number: s.step_number,
          day_offset: s.day_offset,
          channel: s.channel,
          message_prompt: s.message_prompt,
          note: s.note ?? null,
        }));
        const { error: stepErr } = await supabase.from("sequence_steps").insert(rows);
        if (stepErr) throw stepErr;
      }
      return seq;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sequences"] }),
  });
}

export function useDeleteSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sequences"] }),
  });
}

export type CandidateEnrollment = {
  id: string;
  sequence_id: string;
  candidate_id: string | null;
  job_id: string | null;
  start_date: string;
  status: string;
  current_step: number;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  sequences: {
    id: string;
    name: string;
    type: string;
  } | null;
  total_steps?: number;
};

export function useCandidateEnrollments(candidateId: string | null) {
  return useQuery({
    queryKey: ["candidate_enrollments", candidateId],
    enabled: !!candidateId,
    queryFn: async (): Promise<CandidateEnrollment[]> => {
      const { data, error } = await supabase
        .from("sequence_enrollments")
        .select("*, sequences(id,name,type)")
        .eq("candidate_id", candidateId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const enrollments = (data ?? []) as any[];
      // Fetch step counts per sequence
      const seqIds = Array.from(new Set(enrollments.map((e) => e.sequence_id)));
      if (seqIds.length === 0) return [];
      const { data: stepCounts } = await supabase
        .from("sequence_steps")
        .select("sequence_id")
        .in("sequence_id", seqIds);
      const counts = new Map<string, number>();
      (stepCounts ?? []).forEach((s: any) => {
        counts.set(s.sequence_id, (counts.get(s.sequence_id) ?? 0) + 1);
      });
      return enrollments.map((e) => ({ ...e, total_steps: counts.get(e.sequence_id) ?? 0 }));
    },
  });
}

/**
 * Active enrollments for any entity type (candidate / contact / client).
 * Returns the same shape as useCandidateEnrollments so the same UI can render it.
 */
export function useEntityEnrollments(entityType: EntityType | null, entityId: string | null) {
  return useQuery({
    queryKey: ["entity_enrollments", entityType, entityId],
    enabled: !!entityType && !!entityId,
    queryFn: async (): Promise<CandidateEnrollment[]> => {
      const column =
        entityType === "candidate" ? "candidate_id" :
        entityType === "client" ? "client_id" : "contact_id";
      const { data, error } = await supabase
        .from("sequence_enrollments")
        .select("*, sequences(id,name,type)")
        .eq(column, entityId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const enrollments = (data ?? []) as any[];
      const seqIds = Array.from(new Set(enrollments.map((e) => e.sequence_id)));
      if (seqIds.length === 0) return [];
      const { data: stepCounts } = await supabase
        .from("sequence_steps")
        .select("sequence_id")
        .in("sequence_id", seqIds);
      const counts = new Map<string, number>();
      (stepCounts ?? []).forEach((s: any) => {
        counts.set(s.sequence_id, (counts.get(s.sequence_id) ?? 0) + 1);
      });
      return enrollments.map((e) => ({ ...e, total_steps: counts.get(e.sequence_id) ?? 0 }));
    },
  });
}

export function useSequenceEnrollmentCounts() {
  return useQuery({
    queryKey: ["sequence_enrollment_counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("sequence_enrollments")
        .select("sequence_id")
        .eq("status", "active");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((e: any) => {
        counts[e.sequence_id] = (counts[e.sequence_id] ?? 0) + 1;
      });
      return counts;
    },
  });
}

export function useSequenceStepCounts() {
  return useQuery({
    queryKey: ["sequence_step_counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("sequence_steps").select("sequence_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((s: any) => {
        counts[s.sequence_id] = (counts[s.sequence_id] ?? 0) + 1;
      });
      return counts;
    },
  });
}

export function useRemoveEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("sequence_enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate_enrollments"] });
      qc.invalidateQueries({ queryKey: ["entity_enrollments"] });
      qc.invalidateQueries({ queryKey: ["sequence_enrollment_counts"] });
      qc.invalidateQueries({ queryKey: ["personal_sequence_steps_due"] });
    },
  });
}

export function useEnrollCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sequence_id: string;
      candidate_id: string;
      job_id?: string | null;
      start_date?: string;
    }) => {
      const startDate = input.start_date ?? new Date().toISOString().slice(0, 10);

      // Create enrollment
      const { data: enrollment, error } = await supabase
        .from("sequence_enrollments")
        .insert({
          sequence_id: input.sequence_id,
          candidate_id: input.candidate_id,
          job_id: input.job_id ?? null,
          start_date: startDate,
          status: "active",
          current_step: 1,
        })
        .select()
        .single();
      if (error) throw error;

      // Generate step logs from the sequence steps
      const { data: steps } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", input.sequence_id)
        .order("step_number", { ascending: true });

      if (steps && steps.length > 0) {
        const start = new Date(startDate);
        const logs = steps.map((s) => {
          const due = new Date(start);
          due.setDate(due.getDate() + (s.day_offset ?? 0));
          return {
            enrollment_id: enrollment.id,
            step_number: s.step_number,
            status: "pending",
            due_date: due.toISOString().slice(0, 10),
          };
        });
        await supabase.from("sequence_step_logs").insert(logs);
      }
      return enrollment;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["sequence_enrollments", vars.sequence_id] });
      qc.invalidateQueries({ queryKey: ["candidate_enrollments", vars.candidate_id] });
      qc.invalidateQueries({ queryKey: ["sequence_enrollment_counts"] });
      qc.invalidateQueries({ queryKey: ["personal_sequence_steps_due"] });
    },
  });
}

// ===== Personal Sequences =====

export type EntityType = "candidate" | "contact" | "client";

export function useEnrollEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sequence_id: string;
      entity_type: EntityType;
      entity_id: string;
      start_date?: string;
    }) => {
      const startDate = input.start_date ?? new Date().toISOString().slice(0, 10);
      const row: any = {
        sequence_id: input.sequence_id,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        start_date: startDate,
        status: "active",
        current_step: 1,
      };
      if (input.entity_type === "candidate") row.candidate_id = input.entity_id;
      if (input.entity_type === "client") row.client_id = input.entity_id;
      if (input.entity_type === "contact") row.contact_id = input.entity_id;

      const { data: enrollment, error } = await supabase
        .from("sequence_enrollments")
        .insert(row)
        .select()
        .single();
      if (error) throw error;

      const { data: steps } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("sequence_id", input.sequence_id)
        .order("step_number", { ascending: true });

      if (steps && steps.length > 0) {
        const start = new Date(startDate);
        const logs = steps.map((s) => {
          const due = new Date(start);
          due.setDate(due.getDate() + (s.day_offset ?? 0));
          return {
            enrollment_id: enrollment.id,
            step_number: s.step_number,
            status: "pending",
            due_date: due.toISOString().slice(0, 10),
          };
        });
        await supabase.from("sequence_step_logs").insert(logs);
      }
      return enrollment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal_sequence_steps_due"] });
      qc.invalidateQueries({ queryKey: ["sequence_enrollment_counts"] });
      qc.invalidateQueries({ queryKey: ["candidate_enrollments"] });
      qc.invalidateQueries({ queryKey: ["entity_enrollments"] });
    },
  });
}

export type PersonalStepDue = {
  log_id: string;
  enrollment_id: string;
  step_number: number;
  due_date: string;
  status: string;
  // sequence
  sequence_id: string;
  sequence_name: string;
  total_steps: number;
  // step definition
  channel: string;
  message_prompt: string | null;
  // entity
  entity_type: EntityType;
  entity_id: string;
  entity_name: string;
  company: string | null;
};

/**
 * Returns all pending step logs across all personal sequence enrollments,
 * resolved with sequence name, channel/prompt, and entity display info.
 * Excludes paused/completed enrollments.
 */
export function usePersonalSequenceStepsDue() {
  return useQuery({
    queryKey: ["personal_sequence_steps_due"],
    queryFn: async (): Promise<PersonalStepDue[]> => {
      // Pull all pending logs joined to active enrollment + personal sequence
      const { data: logs, error } = await supabase
        .from("sequence_step_logs")
        .select(
          `id, enrollment_id, step_number, due_date, status,
           sequence_enrollments!inner(
             id, sequence_id, status, entity_type, entity_id,
             candidate_id, client_id, contact_id,
             sequences!inner(id, name, type)
           )`
        )
        .eq("status", "pending")
        .order("due_date", { ascending: true });
      if (error) throw error;

      const rows = (logs ?? []).filter((l: any) => {
        const enr = l.sequence_enrollments;
        return enr && enr.status === "active" && enr.sequences && enr.sequences.type !== "auto";
      });
      if (rows.length === 0) return [];

      // Collect ids for batch lookups
      const seqIds = Array.from(new Set(rows.map((r: any) => r.sequence_enrollments.sequence_id)));
      const candIds = Array.from(new Set(rows.map((r: any) => r.sequence_enrollments.candidate_id).filter(Boolean)));
      const clientIds = Array.from(new Set(rows.map((r: any) => r.sequence_enrollments.client_id).filter(Boolean)));
      const contactIds = Array.from(new Set(rows.map((r: any) => r.sequence_enrollments.contact_id).filter(Boolean)));

      const [stepsRes, candRes, clientRes, contactRes] = await Promise.all([
        supabase.from("sequence_steps").select("sequence_id, step_number, channel, message_prompt").in("sequence_id", seqIds),
        candIds.length ? supabase.from("candidates").select("id, name, current_employer").in("id", candIds) : Promise.resolve({ data: [] as any[] }),
        clientIds.length ? supabase.from("clients").select("id, company_name, contact_name").in("id", clientIds) : Promise.resolve({ data: [] as any[] }),
        contactIds.length ? supabase.from("contacts").select("id, name, client_id").in("id", contactIds) : Promise.resolve({ data: [] as any[] }),
      ]);

      const stepMap = new Map<string, { channel: string; message_prompt: string | null }>();
      const totalsBySeq = new Map<string, number>();
      (stepsRes.data ?? []).forEach((s: any) => {
        stepMap.set(`${s.sequence_id}:${s.step_number}`, { channel: s.channel, message_prompt: s.message_prompt });
        totalsBySeq.set(s.sequence_id, (totalsBySeq.get(s.sequence_id) ?? 0) + 1);
      });

      const candMap = new Map((candRes.data ?? []).map((c: any) => [c.id, c]));
      const clientMap = new Map((clientRes.data ?? []).map((c: any) => [c.id, c]));
      const contactsList = (contactRes.data ?? []) as any[];
      const contactClientIds = Array.from(new Set(contactsList.map((c) => c.client_id).filter(Boolean)));
      const { data: contactClients } = contactClientIds.length
        ? await supabase.from("clients").select("id, company_name").in("id", contactClientIds)
        : { data: [] as any[] };
      const contactClientMap = new Map((contactClients ?? []).map((c: any) => [c.id, c.company_name]));
      const contactMap = new Map(
        contactsList.map((c) => [c.id, { name: c.name, company: contactClientMap.get(c.client_id) ?? null }])
      );

      return rows.map((l: any) => {
        const enr = l.sequence_enrollments;
        const stepDef = stepMap.get(`${enr.sequence_id}:${l.step_number}`);
        let entityName = "Unknown";
        let company: string | null = null;
        let entity_type: EntityType = "candidate";
        let entity_id = "";
        if (enr.candidate_id) {
          entity_type = "candidate";
          entity_id = enr.candidate_id;
          const c = candMap.get(enr.candidate_id);
          if (c) { entityName = c.name; company = c.current_employer ?? null; }
        } else if (enr.contact_id) {
          entity_type = "contact";
          entity_id = enr.contact_id;
          const c = contactMap.get(enr.contact_id);
          if (c) { entityName = c.name; company = c.company; }
        } else if (enr.client_id) {
          entity_type = "client";
          entity_id = enr.client_id;
          const c = clientMap.get(enr.client_id);
          if (c) { entityName = c.contact_name ?? c.company_name; company = c.company_name; }
        }
        return {
          log_id: l.id,
          enrollment_id: enr.id,
          step_number: l.step_number,
          due_date: l.due_date,
          status: l.status,
          sequence_id: enr.sequence_id,
          sequence_name: enr.sequences.name,
          total_steps: totalsBySeq.get(enr.sequence_id) ?? 0,
          channel: stepDef?.channel ?? "Email",
          message_prompt: stepDef?.message_prompt ?? null,
          entity_type,
          entity_id,
          entity_name: entityName,
          company,
        };
      });
    },
  });
}

/**
 * Marks a step log as done, logs a touchpoint note on the entity, and
 * advances the enrollment's current_step. Does NOT send anything.
 */
export function useLogStepDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      log_id: string;
      enrollment_id: string;
      entity_type: EntityType;
      entity_id: string;
      step_number: number;
      sequence_name: string;
      channel: string;
      note?: string;
    }) => {
      const channel = input.channel;
      // 1. update log
      const { error: logErr } = await supabase
        .from("sequence_step_logs")
        .update({ status: "done", channel_used: channel, note: input.note ?? null, logged_at: new Date().toISOString() })
        .eq("id", input.log_id);
      if (logErr) throw logErr;

      // 2. advance enrollment
      const { data: nextLogs } = await supabase
        .from("sequence_step_logs")
        .select("step_number, status")
        .eq("enrollment_id", input.enrollment_id)
        .eq("status", "pending")
        .order("step_number", { ascending: true })
        .limit(1);
      const nextStep = nextLogs && nextLogs.length > 0 ? nextLogs[0].step_number : null;
      const enrollUpdate: any = {};
      if (nextStep) enrollUpdate.current_step = nextStep;
      else { enrollUpdate.status = "completed"; enrollUpdate.completed_at = new Date().toISOString(); }
      await supabase.from("sequence_enrollments").update(enrollUpdate).eq("id", input.enrollment_id);

      // 3. log touchpoint on entity
      const noteRow: any = {
        activity_type: channel,
        content: `${input.sequence_name} — Step ${input.step_number} completed${input.note ? `: ${input.note}` : ""}`,
      };
      if (input.entity_type === "candidate") noteRow.candidate_id = input.entity_id;
      if (input.entity_type === "client") noteRow.client_id = input.entity_id;
      // Contacts don't have direct notes — link via client
      if (input.entity_type === "contact") {
        const { data: contact } = await supabase.from("contacts").select("client_id").eq("id", input.entity_id).single();
        if (contact?.client_id) noteRow.client_id = contact.client_id;
      }
      await supabase.from("notes").insert(noteRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal_sequence_steps_due"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useSkipStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { log_id: string; enrollment_id: string }) => {
      await supabase
        .from("sequence_step_logs")
        .update({ status: "skipped", logged_at: new Date().toISOString() })
        .eq("id", input.log_id);
      const { data: nextLogs } = await supabase
        .from("sequence_step_logs")
        .select("step_number")
        .eq("enrollment_id", input.enrollment_id)
        .eq("status", "pending")
        .order("step_number", { ascending: true })
        .limit(1);
      const enrollUpdate: any = {};
      if (nextLogs && nextLogs.length > 0) enrollUpdate.current_step = nextLogs[0].step_number;
      else { enrollUpdate.status = "completed"; enrollUpdate.completed_at = new Date().toISOString(); }
      await supabase.from("sequence_enrollments").update(enrollUpdate).eq("id", input.enrollment_id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal_sequence_steps_due"] }),
  });
}

export function usePauseEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enrollment_id: string) => {
      await supabase
        .from("sequence_enrollments")
        .update({ status: "paused", paused_at: new Date().toISOString() })
        .eq("id", enrollment_id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal_sequence_steps_due"] }),
  });
}

export function useResumeEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enrollment_id: string) => {
      await supabase
        .from("sequence_enrollments")
        .update({ status: "active", paused_at: null })
        .eq("id", enrollment_id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal_sequence_steps_due"] }),
  });
}

/**
 * Per-template performance: enrolled count and per-step completion rate.
 */
export function useTemplatePerformance() {
  return useQuery({
    queryKey: ["template_performance"],
    queryFn: async () => {
      // Match sequences whose name equals a template name
      const [tplRes, seqRes] = await Promise.all([
        supabase.from("sequence_templates").select("id, name, steps"),
        supabase.from("sequences").select("id, name, type"),
      ]);
      const templates = (tplRes.data ?? []) as any[];
      const sequences = (seqRes.data ?? []) as any[];
      const result: Array<{
        template_name: string;
        total_steps: number;
        enrolled: number;
        per_step: Array<{ step_number: number; done: number; pending: number; skipped: number }>;
      }> = [];

      for (const t of templates) {
        const matchingSeqs = sequences.filter((s) => s.name === t.name);
        const seqIds = matchingSeqs.map((s) => s.id);
        if (seqIds.length === 0) {
          result.push({ template_name: t.name, total_steps: (t.steps as any[]).length, enrolled: 0, per_step: [] });
          continue;
        }
        const { data: enrollments } = await supabase
          .from("sequence_enrollments")
          .select("id, status")
          .in("sequence_id", seqIds);
        const activeEnrollments = (enrollments ?? []).filter((e: any) => e.status === "active");
        const enrollmentIds = (enrollments ?? []).map((e: any) => e.id);
        const { data: logs } = enrollmentIds.length
          ? await supabase.from("sequence_step_logs").select("step_number, status").in("enrollment_id", enrollmentIds)
          : { data: [] as any[] };
        const perStepMap = new Map<number, { done: number; pending: number; skipped: number }>();
        ((t.steps as any[]) ?? []).forEach((s: any) => {
          perStepMap.set(s.step_number, { done: 0, pending: 0, skipped: 0 });
        });
        (logs ?? []).forEach((l: any) => {
          const cur = perStepMap.get(l.step_number) ?? { done: 0, pending: 0, skipped: 0 };
          if (l.status === "done") cur.done += 1;
          else if (l.status === "skipped") cur.skipped += 1;
          else cur.pending += 1;
          perStepMap.set(l.step_number, cur);
        });
        result.push({
          template_name: t.name,
          total_steps: (t.steps as any[]).length,
          enrolled: activeEnrollments.length,
          per_step: Array.from(perStepMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([step_number, v]) => ({ step_number, ...v })),
        });
      }
      return result;
    },
  });
}

