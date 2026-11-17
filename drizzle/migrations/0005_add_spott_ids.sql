ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS spott_id text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS spott_id text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS spott_id text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS spott_id text;
ALTER TABLE public.candidate_jobs ADD COLUMN IF NOT EXISTS spott_id text;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS spott_id text;
ALTER TABLE public.placements ADD COLUMN IF NOT EXISTS spott_id text;
ALTER TABLE public.call_transcripts ADD COLUMN IF NOT EXISTS spott_id text;
CREATE INDEX IF NOT EXISTS candidates_spott_idx ON public.candidates(owner_user_id, spott_id);
CREATE INDEX IF NOT EXISTS clients_spott_idx ON public.clients(owner_user_id, spott_id);
CREATE INDEX IF NOT EXISTS contacts_spott_idx ON public.contacts(owner_user_id, spott_id);
CREATE INDEX IF NOT EXISTS jobs_spott_idx ON public.jobs(owner_user_id, spott_id);
CREATE INDEX IF NOT EXISTS candidate_jobs_spott_idx ON public.candidate_jobs(owner_user_id, spott_id);
CREATE INDEX IF NOT EXISTS notes_spott_idx ON public.notes(owner_user_id, spott_id);
CREATE INDEX IF NOT EXISTS placements_spott_idx ON public.placements(owner_user_id, spott_id);
CREATE INDEX IF NOT EXISTS call_transcripts_spott_idx ON public.call_transcripts(user_id, spott_id);

CREATE TABLE public.spott_sync_state (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'idle',
  entity text,
  cursor text,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spott_sync_state TO authenticated;
GRANT ALL ON public.spott_sync_state TO service_role;
ALTER TABLE public.spott_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own spott sync state" ON public.spott_sync_state FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.spott_replace_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  table_name text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.spott_replace_backup TO authenticated;
GRANT ALL ON public.spott_replace_backup TO service_role;
ALTER TABLE public.spott_replace_backup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own spott backup" ON public.spott_replace_backup FOR SELECT TO authenticated USING (owner_user_id = auth.uid());