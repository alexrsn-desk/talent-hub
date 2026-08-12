-- 1. Table
CREATE TABLE public.job_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  stage_order integer NOT NULL DEFAULT 0,
  is_system_stage boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, stage_name)
);

CREATE INDEX idx_job_stages_job ON public.job_stages(job_id, stage_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_stages TO authenticated;
GRANT ALL ON public.job_stages TO service_role;

ALTER TABLE public.job_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage stages for accessible jobs"
ON public.job_stages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_stages.job_id AND public.can_access_owner(j.owner_user_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_stages.job_id AND public.can_access_owner(j.owner_user_id)));

-- 2. Backfill existing jobs with their current live stage list
INSERT INTO public.job_stages (job_id, stage_name, stage_order, is_system_stage)
SELECT j.id, s.name, s.ord, s.sys
FROM public.jobs j
CROSS JOIN (VALUES
  ('AI Suggested', 0, true),
  ('Shortlist', 1, false),
  ('Sent CV', 2, false),
  ('First Stage', 3, false),
  ('Second Stage', 4, false),
  ('Final Stage', 5, false),
  ('Offer', 6, false),
  ('Placed', 7, false),
  ('Rejected / Withdrawn', 999, true)
) AS s(name, ord, sys)
ON CONFLICT (job_id, stage_name) DO NOTHING;

-- Also make sure any stage value already in use exists as a stage for that job
INSERT INTO public.job_stages (job_id, stage_name, stage_order, is_system_stage)
SELECT DISTINCT cj.job_id, cj.stage, 500, false
FROM public.candidate_jobs cj
WHERE cj.job_id IS NOT NULL AND cj.stage IS NOT NULL
ON CONFLICT (job_id, stage_name) DO NOTHING;

-- 3. Default template for new jobs
CREATE OR REPLACE FUNCTION public.jobs_seed_default_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.job_stages (job_id, stage_name, stage_order, is_system_stage)
  VALUES
    (NEW.id, 'AI Suggested', 0, true),
    (NEW.id, 'Longlist', 1, false),
    (NEW.id, 'Shortlist', 2, false),
    (NEW.id, 'Submitted', 3, false),
    (NEW.id, 'First Interview', 4, false),
    (NEW.id, 'Second Interview', 5, false),
    (NEW.id, 'Offer', 6, false),
    (NEW.id, 'Placed', 7, false),
    (NEW.id, 'Rejected / Withdrawn', 999, true)
  ON CONFLICT (job_id, stage_name) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jobs_seed_default_stages
AFTER INSERT ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.jobs_seed_default_stages();

-- 4. Custom stage names must be allowed
ALTER TABLE public.candidate_jobs DROP CONSTRAINT IF EXISTS candidate_jobs_stage_check;
