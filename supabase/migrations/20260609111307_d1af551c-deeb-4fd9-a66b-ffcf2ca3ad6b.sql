ALTER TABLE public.candidate_jobs DROP CONSTRAINT IF EXISTS candidate_jobs_stage_check;

-- Migrate legacy stage values to the new pipeline names
UPDATE public.candidate_jobs SET stage = 'Longlist' WHERE stage = 'Applied';
UPDATE public.candidate_jobs SET stage = 'First Interview' WHERE stage = 'Interviewing';
UPDATE public.candidate_jobs SET stage = 'Offer' WHERE stage = 'Offered';

ALTER TABLE public.candidate_jobs
  ADD CONSTRAINT candidate_jobs_stage_check
  CHECK (stage IN (
    'AI Suggested',
    'Longlist',
    'Contact',
    'Screening',
    'Shortlist',
    'Submitted',
    'Client Review',
    'First Interview',
    'Second Interview',
    'Offer',
    'Placed',
    'Rejected'
  ));