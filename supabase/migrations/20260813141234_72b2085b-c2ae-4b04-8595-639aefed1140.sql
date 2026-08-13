ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS portal_job_id uuid REFERENCES public.portal_jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS jobs_portal_job_id_idx ON public.jobs(portal_job_id);