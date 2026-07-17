
-- 1. activity_events
CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created','updated','contacted','replied','note_logged','stage_changed')),
  source text NOT NULL,
  external_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX activity_events_source_external_id_key
  ON public.activity_events(source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX activity_events_candidate_idx ON public.activity_events(candidate_id, occurred_at DESC);
CREATE INDEX activity_events_owner_idx ON public.activity_events(owner_user_id, occurred_at DESC);

GRANT SELECT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their activity events"
  ON public.activity_events FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

-- 2. integration_sync_state (per-user cursor for polling)
CREATE TABLE public.integration_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  endpoint text NOT NULL,
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, source, endpoint)
);

GRANT SELECT ON public.integration_sync_state TO authenticated;
GRANT ALL ON public.integration_sync_state TO service_role;

ALTER TABLE public.integration_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their sync state"
  ON public.integration_sync_state FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE TRIGGER integration_sync_state_touch
  BEFORE UPDATE ON public.integration_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
