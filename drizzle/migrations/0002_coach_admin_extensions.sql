ALTER TABLE public.coach_action_log
  ADD COLUMN IF NOT EXISTS before_state jsonb,
  ADD COLUMN IF NOT EXISTS risk text,
  ADD COLUMN IF NOT EXISTS approval_status text,
  ADD COLUMN IF NOT EXISTS proposal_id uuid;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS work_preference text;

CREATE INDEX IF NOT EXISTS coach_action_log_owner_created_idx ON public.coach_action_log (owner_user_id, created_at DESC);