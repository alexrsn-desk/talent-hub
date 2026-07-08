ALTER TABLE public.candidate_jobs
  ADD COLUMN IF NOT EXISTS ai_suggested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_suggested_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_suggested_score integer,
  ADD COLUMN IF NOT EXISTS ai_suggested_reason text,
  ADD COLUMN IF NOT EXISTS ai_suggestion_dismissed_reason text;

CREATE INDEX IF NOT EXISTS idx_candidate_jobs_ai_suggested ON public.candidate_jobs (job_id) WHERE ai_suggested = true;