-- Agency replies on feedback (portal_feedback)
ALTER TABLE public.portal_feedback
  ADD COLUMN IF NOT EXISTS author_role text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.portal_feedback(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS portal_feedback_reply_to_idx ON public.portal_feedback(reply_to);

-- Editable comments
ALTER TABLE public.portal_feedback
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Rejection email mode per job (portal_jobs)
ALTER TABLE public.portal_jobs
  ADD COLUMN IF NOT EXISTS rejection_email_mode text NOT NULL DEFAULT 'template';

ALTER TABLE public.portal_jobs
  ADD CONSTRAINT portal_jobs_rejection_email_mode_check
  CHECK (rejection_email_mode IN ('template','ai'));