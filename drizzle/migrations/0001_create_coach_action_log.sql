CREATE TABLE public.coach_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  user_request TEXT,
  action TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  affected_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  success BOOLEAN NOT NULL,
  error TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coach_action_log_owner_idx ON public.coach_action_log (owner_user_id, created_at DESC);

GRANT SELECT, INSERT ON public.coach_action_log TO authenticated;
GRANT ALL ON public.coach_action_log TO service_role;

ALTER TABLE public.coach_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own coach action log"
ON public.coach_action_log FOR SELECT TO authenticated
USING (public.can_access_owner(owner_user_id));

CREATE POLICY "Users can insert own coach action log"
ON public.coach_action_log FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid());