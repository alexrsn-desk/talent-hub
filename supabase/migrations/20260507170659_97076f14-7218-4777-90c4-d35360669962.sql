ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS intake_notes jsonb,
  ADD COLUMN IF NOT EXISTS intake_summary text,
  ADD COLUMN IF NOT EXISTS intake_captured_at timestamp with time zone;