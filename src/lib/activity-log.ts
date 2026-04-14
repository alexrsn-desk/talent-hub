import { supabase } from "@/integrations/supabase/client";

export type ActivityAction =
  | "candidate_created" | "candidate_updated" | "candidate_deleted"
  | "client_created" | "client_updated" | "client_deleted"
  | "job_created" | "job_updated" | "job_deleted"
  | "candidate_job_linked" | "candidate_job_unlinked" | "stage_change"
  | "note_created" | "touchpoint_logged"
  | "contact_created" | "contact_deleted"
  | "interview_scheduled" | "interview_slot_added"
  | "cv_sent" | "bd_contact_made"
  | "portal_link_generated" | "client_feedback_received";

interface LogParams {
  action_type: ActivityAction | string;
  candidate_id?: string | null;
  client_id?: string | null;
  job_id?: string | null;
  candidate_job_id?: string | null;
  metadata?: Record<string, any>;
}

export async function logActivity(params: LogParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("activity_log" as any).insert({
      user_id: user?.id ?? null,
      action_type: params.action_type,
      candidate_id: params.candidate_id ?? null,
      client_id: params.client_id ?? null,
      job_id: params.job_id ?? null,
      candidate_job_id: params.candidate_job_id ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (e) {
    // Never block the main action if logging fails
    console.warn("Activity log failed:", e);
  }
}
