ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS priority_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_reason text,
  ADD COLUMN IF NOT EXISTS priority_flagged_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS priority_followup_date date;