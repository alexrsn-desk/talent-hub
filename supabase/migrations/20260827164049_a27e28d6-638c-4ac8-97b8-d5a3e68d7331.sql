-- Judgement layer: generic transcript ingestion, impact claims, judgement summaries and per-role judgement scores

CREATE TABLE IF NOT EXISTS public.call_transcripts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  content text NOT NULL,
  duration_minutes integer,
  call_date timestamptz NOT NULL DEFAULT now(),
  extraction_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_transcripts_candidate_idx ON public.call_transcripts(candidate_id, call_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_transcripts TO authenticated;
GRANT ALL ON public.call_transcripts TO service_role;
ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_transcripts_owner_all" ON public.call_transcripts FOR ALL TO authenticated
  USING (public.can_access_owner(user_id)) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.candidate_impact_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  transcript_id uuid REFERENCES public.call_transcripts(id) ON DELETE CASCADE,
  what_they_did text NOT NULL,
  claimed_impact text,
  specificity text NOT NULL DEFAULT 'low',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_impact_claims_candidate_idx ON public.candidate_impact_claims(candidate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_impact_claims TO authenticated;
GRANT ALL ON public.candidate_impact_claims TO service_role;
ALTER TABLE public.candidate_impact_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidate_impact_claims_owner_all" ON public.candidate_impact_claims FOR ALL TO authenticated
  USING (public.can_access_owner(user_id)) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.candidate_judgements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  summary text,
  evidence_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  low_specificity_flag boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_judgements TO authenticated;
GRANT ALL ON public.candidate_judgements TO service_role;
ALTER TABLE public.candidate_judgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidate_judgements_owner_all" ON public.candidate_judgements FOR ALL TO authenticated
  USING (public.can_access_owner(user_id)) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.candidate_job_judgements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  score integer,
  reasoning text,
  evidence_level text NOT NULL DEFAULT 'none',
  dealbreaker text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, job_id)
);
CREATE INDEX IF NOT EXISTS candidate_job_judgements_job_idx ON public.candidate_job_judgements(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_job_judgements TO authenticated;
GRANT ALL ON public.candidate_job_judgements TO service_role;
ALTER TABLE public.candidate_job_judgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidate_job_judgements_owner_all" ON public.candidate_job_judgements FOR ALL TO authenticated
  USING (public.can_access_owner(user_id)) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS additional_context text;

-- fix: decay_alerts.id had no default
ALTER TABLE public.decay_alerts ALTER COLUMN id SET DEFAULT gen_random_uuid();