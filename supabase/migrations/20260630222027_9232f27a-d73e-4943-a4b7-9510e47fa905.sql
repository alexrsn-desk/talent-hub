
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS launch_hook text,
  ADD COLUMN IF NOT EXISTS ideal_candidate_line text,
  ADD COLUMN IF NOT EXISTS search_launched_at timestamptz,
  ADD COLUMN IF NOT EXISTS launch_summary jsonb;

ALTER TABLE public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS linkedin_post_template text,
  ADD COLUMN IF NOT EXISTS personal_candidate_template text,
  ADD COLUMN IF NOT EXISTS li_connection_template text,
  ADD COLUMN IF NOT EXISTS campaign_outreach_template text,
  ADD COLUMN IF NOT EXISTS client_confirmation_template text;

CREATE TABLE IF NOT EXISTS public.job_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  launched_at timestamptz NOT NULL DEFAULT now(),
  known_count integer NOT NULL DEFAULT 0,
  li_count integer NOT NULL DEFAULT 0,
  post_text text,
  campaign_subject text,
  campaign_body text,
  client_email_sent boolean NOT NULL DEFAULT false,
  outputs jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_launches TO authenticated;
GRANT ALL ON public.job_launches TO service_role;

ALTER TABLE public.job_launches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_launches owner access"
  ON public.job_launches FOR ALL
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_job_launches_job_id ON public.job_launches(job_id);
CREATE INDEX IF NOT EXISTS idx_job_launches_owner ON public.job_launches(owner_user_id);
