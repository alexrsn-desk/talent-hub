
-- 1. Drop restrictive CHECK constraints (validated in app instead)
ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_status_check;
ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_source_check;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_fee_type_check;
ALTER TABLE public.candidate_jobs DROP CONSTRAINT IF EXISTS candidate_jobs_stage_check;

-- 2. Fresh start: wipe all record data (preserve settings/templates/profiles/roles/teams)
TRUNCATE TABLE
  public.call_signals,
  public.call_insights,
  public.candidate_summaries,
  public.screening_notes,
  public.screening_framework_items,
  public.client_feedback,
  public.interview_slots,
  public.interview_feedback,
  public.interviews,
  public.offer_milestones,
  public.counter_offers,
  public.offers,
  public.placement_checkins,
  public.placement_tracking_events,
  public.placements,
  public.decay_alerts,
  public.quick_notes,
  public.todo_tasks,
  public.notifications,
  public.reactivation_messages,
  public.reactivation_campaigns,
  public.sequence_step_logs,
  public.sequence_enrollments,
  public.candidate_tags,
  public.candidate_talent_pools,
  public.job_tags,
  public.job_score_history,
  public.job_launches,
  public.company_intel,
  public.client_portal_access,
  public.compliance_audits,
  public.compliance_log,
  public.enrichment_usage,
  public.usage_logs,
  public.webhook_logs,
  public.import_history,
  public.weekly_summaries,
  public.activity_log,
  public.notes,
  public.candidate_jobs,
  public.contacts,
  public.candidates,
  public.jobs,
  public.clients
RESTART IDENTITY CASCADE;
