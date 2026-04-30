import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EntityType = "candidate" | "contact";

export type ComplianceLogRow = {
  id: string;
  owner_user_id: string;
  performed_by: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name_snapshot: string | null;
  reason: string | null;
  reason_other: string | null;
  channel: string | null;
  notes: string | null;
  created_at: string;
};

export type ComplianceAuditRow = {
  id: string;
  user_id: string;
  started_at: string;
  completed_at: string | null;
  records_reviewed: number;
  records_kept: number;
  records_archived: number;
  records_deleted: number;
  next_due_date: string;
  created_at: string;
};

export const DNC_REASONS = [
  "Requested by candidate/contact",
  "Unsubscribed from outreach",
  "Formal complaint made",
  "Deceased",
  "Other",
] as const;

export const DNC_CHANNELS = ["Email", "Phone", "LinkedIn", "Written request", "Other"] as const;

const tableFor = (t: EntityType) => (t === "candidate" ? "candidates" : "contacts");

export function useSetDoNotContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entityType: EntityType;
      entityId: string;
      entityName: string;
      reason: string;
      reasonOther?: string | null;
      channel: string;
      notes?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const updates: any = {
        do_not_contact: true,
        dnc_reason: input.reason,
        dnc_reason_other: input.reason === "Other" ? (input.reasonOther ?? null) : null,
        dnc_channel: input.channel,
        dnc_notes: input.notes ?? null,
        dnc_set_at: new Date().toISOString(),
        dnc_set_by: user.id,
      };
      const { error } = await supabase.from(tableFor(input.entityType) as any).update(updates).eq("id", input.entityId);
      if (error) throw error;

      await supabase.from("compliance_log").insert({
        owner_user_id: user.id,
        performed_by: user.id,
        action: "dnc_enabled",
        entity_type: input.entityType,
        entity_id: input.entityId,
        entity_name_snapshot: input.entityName,
        reason: input.reason,
        reason_other: input.reason === "Other" ? input.reasonOther ?? null : null,
        channel: input.channel,
        notes: input.notes ?? null,
      });
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: [v.entityType === "candidate" ? "candidates" : "contacts"] });
      qc.invalidateQueries({ queryKey: ["compliance_log"] });
    },
  });
}

export function useClearDoNotContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entityType: EntityType; entityId: string; entityName: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const updates: any = {
        do_not_contact: false,
        dnc_reason: null,
        dnc_reason_other: null,
        dnc_channel: null,
        dnc_notes: null,
        dnc_set_at: null,
        dnc_set_by: null,
      };
      const { error } = await supabase.from(tableFor(input.entityType) as any).update(updates).eq("id", input.entityId);
      if (error) throw error;
      await supabase.from("compliance_log").insert({
        owner_user_id: user.id,
        performed_by: user.id,
        action: "dnc_disabled",
        entity_type: input.entityType,
        entity_id: input.entityId,
        entity_name_snapshot: input.entityName,
      });
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: [v.entityType === "candidate" ? "candidates" : "contacts"] });
      qc.invalidateQueries({ queryKey: ["compliance_log"] });
    },
  });
}

export function useGdprDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entityType: EntityType; entityId: string; entityName: string; reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const stamp = new Date().toISOString();
      const stub = `[Deleted Contact] — ${stamp.slice(0, 10)}`;

      const baseUpdates: any = {
        name: stub,
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
        linkedin_url: null,
        gdpr_deleted: true,
        gdpr_deleted_at: stamp,
        do_not_contact: true,
        dnc_reason: "Requested by candidate/contact",
        dnc_channel: "Written request",
        dnc_notes: "GDPR deletion request",
        dnc_set_at: stamp,
        dnc_set_by: user.id,
      };

      if (input.entityType === "contact") {
        baseUpdates.personal_email = null;
        baseUpdates.mobile_phone = null;
        baseUpdates.direct_phone = null;
      } else {
        baseUpdates.summary = null;
        baseUpdates.current_employer = null;
        baseUpdates.location = null;
      }

      const { error } = await supabase.from(tableFor(input.entityType) as any).update(baseUpdates).eq("id", input.entityId);
      if (error) throw error;

      await supabase.from("compliance_log").insert({
        owner_user_id: user.id,
        performed_by: user.id,
        action: "gdpr_deleted",
        entity_type: input.entityType,
        entity_id: input.entityId,
        entity_name_snapshot: input.entityName,
        reason: input.reason ?? "GDPR deletion request",
      });
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: [v.entityType === "candidate" ? "candidates" : "contacts"] });
      qc.invalidateQueries({ queryKey: ["compliance_log"] });
    },
  });
}

export function useComplianceLog() {
  return useQuery({
    queryKey: ["compliance_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ComplianceLogRow[];
    },
  });
}

export function useComplianceAudits() {
  return useQuery({
    queryKey: ["compliance_audits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_audits")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComplianceAuditRow[];
    },
  });
}

export function useDncCounts() {
  return useQuery({
    queryKey: ["dnc_counts"],
    queryFn: async () => {
      const [{ count: candDnc }, { count: contDnc }, { count: deletions }] = await Promise.all([
        supabase.from("candidates").select("id", { count: "exact", head: true }).eq("do_not_contact", true),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("do_not_contact", true),
        supabase.from("compliance_log").select("id", { count: "exact", head: true }).eq("action", "gdpr_deleted"),
      ]);
      return {
        dncCandidates: candDnc ?? 0,
        dncContacts: contDnc ?? 0,
        dncTotal: (candDnc ?? 0) + (contDnc ?? 0),
        deletions: deletions ?? 0,
      };
    },
  });
}

export function useStaleCandidates() {
  return useQuery({
    queryKey: ["stale_candidates_24m"],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 24);
      const { data, error } = await supabase
        .from("candidates")
        .select("id, name, updated_at, gdpr_deleted")
        .lt("updated_at", cutoff.toISOString())
        .eq("gdpr_deleted", false)
        .order("updated_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}
