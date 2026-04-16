-- Wipe existing pipeline data as requested
DELETE FROM public.candidate_jobs;

-- Add new columns
ALTER TABLE public.candidate_jobs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Update default stage
ALTER TABLE public.candidate_jobs
  ALTER COLUMN stage SET DEFAULT 'AI Suggested';

-- Trigger to auto-update stage_changed_at when stage changes
CREATE OR REPLACE FUNCTION public.update_stage_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidate_jobs_stage_changed ON public.candidate_jobs;
CREATE TRIGGER trg_candidate_jobs_stage_changed
  BEFORE UPDATE ON public.candidate_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stage_changed_at();