ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS sourcewhale_candidate_id text,
  ADD COLUMN IF NOT EXISTS sourcewhale_campaign_id text,
  ADD COLUMN IF NOT EXISTS sourcewhale_campaign_name text,
  ADD COLUMN IF NOT EXISTS sourcewhale_stage text,
  ADD COLUMN IF NOT EXISTS sourcewhale_status text,
  ADD COLUMN IF NOT EXISTS sourcewhale_last_contacted timestamptz,
  ADD COLUMN IF NOT EXISTS sourcewhale_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS candidates_sourcewhale_candidate_id_idx
  ON public.candidates (sourcewhale_candidate_id);
CREATE INDEX IF NOT EXISTS candidates_sourcewhale_campaign_id_idx
  ON public.candidates (sourcewhale_campaign_id);