ALTER TABLE public.portal_candidates
  ADD COLUMN IF NOT EXISTS desky_candidate_id uuid,
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS portal_candidates_job_desky_unique
  ON public.portal_candidates (job_id, desky_candidate_id)
  WHERE desky_candidate_id IS NOT NULL;