ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS launch_ignored_at timestamptz,
  ADD COLUMN IF NOT EXISTS launch_ignored_reason text,
  ADD COLUMN IF NOT EXISTS launch_ignored_by uuid;