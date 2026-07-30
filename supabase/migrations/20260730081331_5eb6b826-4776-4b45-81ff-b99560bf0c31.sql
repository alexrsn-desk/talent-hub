ALTER TABLE public.candidate_jobs DROP CONSTRAINT IF EXISTS candidate_jobs_stage_check;

ALTER TABLE public.candidate_jobs
  ADD COLUMN IF NOT EXISTS withdrawn boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS withdrawn_reason text,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

-- Convert Rejected / Withdrawn stages into the flag
UPDATE public.candidate_jobs
SET withdrawn = true,
    withdrawn_at = COALESCE(withdrawn_at, now()),
    stage = 'Shortlist'
WHERE stage IN ('Rejected', 'Withdrawn', 'Rejected/Withdrawn');

-- Rename stages
UPDATE public.candidate_jobs SET stage = 'Shortlist' WHERE stage = 'Longlist';
UPDATE public.candidate_jobs SET stage = 'Sent CV' WHERE stage IN ('Submitted', 'Client Review');
UPDATE public.candidate_jobs SET stage = 'First Stage' WHERE stage = 'First Interview';
UPDATE public.candidate_jobs SET stage = 'Second Stage' WHERE stage = 'Second Interview';
UPDATE public.candidate_jobs SET stage = 'Final Stage' WHERE stage = 'Third Interview';

ALTER TABLE public.candidate_jobs
  ADD CONSTRAINT candidate_jobs_stage_check
  CHECK (stage IN (
    'AI Suggested',
    'Shortlist',
    'Sent CV',
    'First Stage',
    'Second Stage',
    'Final Stage',
    'Offer',
    'Placed'
  ));