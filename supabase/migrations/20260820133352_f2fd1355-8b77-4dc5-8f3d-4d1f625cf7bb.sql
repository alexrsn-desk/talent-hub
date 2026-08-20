alter table public.portal_jobs
  add column if not exists pack_extra text,
  add column if not exists rejection_send_mode text not null default 'approve',
  add column if not exists rejection_template text,
  add column if not exists rejection_ai_guidance text,
  add column if not exists briefing_notes text;

do $$ begin
  alter table public.portal_jobs
    add constraint portal_jobs_rejection_send_mode_check
    check (rejection_send_mode in ('auto','approve'));
exception when duplicate_object then null; end $$;

alter table public.portal_candidate_portals
  add column if not exists include_job_spec boolean not null default true;