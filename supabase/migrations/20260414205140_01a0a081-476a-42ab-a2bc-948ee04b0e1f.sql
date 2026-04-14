
ALTER TABLE public.call_signals
  ADD COLUMN feedback_rating text,
  ADD COLUMN feedback_at timestamp with time zone,
  ADD COLUMN feedback_user_id uuid;
