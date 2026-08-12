-- Portal feature: self-contained schema (prefixed portal_*)

CREATE TABLE public.portal_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  desky_job_id uuid,
  title text NOT NULL,
  client_name text,
  status text NOT NULL DEFAULT 'Open',
  job_description_file text,
  notify_candidate_on_interview boolean NOT NULL DEFAULT false,
  notify_candidate_on_reject boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_jobs TO authenticated;
GRANT ALL ON public.portal_jobs TO service_role;
ALTER TABLE public.portal_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages portal jobs" ON public.portal_jobs FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

CREATE TABLE public.portal_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.portal_jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  cv_file text,
  stage text NOT NULL DEFAULT 'Application Submitted',
  rejected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_candidates TO authenticated;
GRANT ALL ON public.portal_candidates TO service_role;
ALTER TABLE public.portal_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages portal candidates" ON public.portal_candidates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_jobs j WHERE j.id = job_id AND j.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_jobs j WHERE j.id = job_id AND j.owner_user_id = auth.uid()));

CREATE TABLE public.portal_client_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.portal_jobs(id) ON DELETE CASCADE,
  access_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  client_email text,
  calendly_url text,
  availability_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_client_portals TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.portal_client_portals TO authenticated;
ALTER TABLE public.portal_client_portals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages client portals" ON public.portal_client_portals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_jobs j WHERE j.id = job_id AND j.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_jobs j WHERE j.id = job_id AND j.owner_user_id = auth.uid()));

CREATE TABLE public.portal_candidate_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  access_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_candidate_portals TO service_role;
GRANT SELECT, INSERT ON public.portal_candidate_portals TO authenticated;
ALTER TABLE public.portal_candidate_portals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages candidate portals" ON public.portal_candidate_portals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_candidates c JOIN public.portal_jobs j ON j.id = c.job_id WHERE c.id = candidate_id AND j.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_candidates c JOIN public.portal_jobs j ON j.id = c.job_id WHERE c.id = candidate_id AND j.owner_user_id = auth.uid()));

CREATE TABLE public.portal_job_stage_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.portal_jobs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  prep_content text,
  interview_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, stage)
);
GRANT ALL ON public.portal_job_stage_content TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_job_stage_content TO authenticated;
ALTER TABLE public.portal_job_stage_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages job stage content" ON public.portal_job_stage_content FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_jobs j WHERE j.id = job_id AND j.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_jobs j WHERE j.id = job_id AND j.owner_user_id = auth.uid()));

CREATE TABLE public.portal_candidate_stage_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  stage text NOT NULL,
  prep_content text,
  interview_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, stage)
);
GRANT ALL ON public.portal_candidate_stage_overrides TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_candidate_stage_overrides TO authenticated;
ALTER TABLE public.portal_candidate_stage_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages candidate overrides" ON public.portal_candidate_stage_overrides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_candidates c JOIN public.portal_jobs j ON j.id = c.job_id WHERE c.id = candidate_id AND j.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_candidates c JOIN public.portal_jobs j ON j.id = c.job_id WHERE c.id = candidate_id AND j.owner_user_id = auth.uid()));

CREATE TABLE public.portal_job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.portal_jobs(id) ON DELETE CASCADE,
  author text NOT NULL DEFAULT 'client',
  note_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_job_notes TO service_role;
GRANT SELECT, INSERT ON public.portal_job_notes TO authenticated;
ALTER TABLE public.portal_job_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads job notes" ON public.portal_job_notes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_jobs j WHERE j.id = job_id AND j.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_jobs j WHERE j.id = job_id AND j.owner_user_id = auth.uid()));

CREATE TABLE public.portal_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  client_email text,
  stage text NOT NULL,
  comment text NOT NULL,
  rating integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_feedback TO service_role;
GRANT SELECT, INSERT ON public.portal_feedback TO authenticated;
ALTER TABLE public.portal_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads feedback" ON public.portal_feedback FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_candidates c JOIN public.portal_jobs j ON j.id = c.job_id WHERE c.id = candidate_id AND j.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_candidates c JOIN public.portal_jobs j ON j.id = c.job_id WHERE c.id = candidate_id AND j.owner_user_id = auth.uid()));

CREATE TABLE public.portal_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by text NOT NULL DEFAULT 'agency',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_stage_history TO service_role;
GRANT SELECT, INSERT ON public.portal_stage_history TO authenticated;
ALTER TABLE public.portal_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads stage history" ON public.portal_stage_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_candidates c JOIN public.portal_jobs j ON j.id = c.job_id WHERE c.id = candidate_id AND j.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_candidates c JOIN public.portal_jobs j ON j.id = c.job_id WHERE c.id = candidate_id AND j.owner_user_id = auth.uid()));

CREATE TABLE public.portal_interview_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  slot_or_booking_ref text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_interview_bookings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.portal_interview_bookings TO authenticated;
ALTER TABLE public.portal_interview_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages bookings" ON public.portal_interview_bookings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.portal_candidates c JOIN public.portal_jobs j ON j.id = c.job_id WHERE c.id = candidate_id AND j.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.portal_candidates c JOIN public.portal_jobs j ON j.id = c.job_id WHERE c.id = candidate_id AND j.owner_user_id = auth.uid()));

CREATE TABLE public.portal_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  notification_email text,
  webhook_url text,
  default_notify_candidate_on_interview boolean NOT NULL DEFAULT false,
  default_notify_candidate_on_reject boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.portal_settings TO authenticated;
GRANT ALL ON public.portal_settings TO service_role;
ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages portal settings" ON public.portal_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.portal_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  api_key text NOT NULL UNIQUE DEFAULT 'dkp_' || replace(gen_random_uuid()::text, '-', ''),
  scope text NOT NULL DEFAULT 'read',
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_api_keys TO authenticated;
GRANT ALL ON public.portal_api_keys TO service_role;
ALTER TABLE public.portal_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages api keys" ON public.portal_api_keys FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- store the created portal job id on the Desky job (unused for now)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS portal_job_id uuid;

-- updated_at triggers
CREATE TRIGGER trg_portal_jobs_updated BEFORE UPDATE ON public.portal_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_candidates_updated BEFORE UPDATE ON public.portal_candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_client_portals_updated BEFORE UPDATE ON public.portal_client_portals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_job_stage_content_updated BEFORE UPDATE ON public.portal_job_stage_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_cand_overrides_updated BEFORE UPDATE ON public.portal_candidate_stage_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_bookings_updated BEFORE UPDATE ON public.portal_interview_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_settings_updated BEFORE UPDATE ON public.portal_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- helpful indexes
CREATE INDEX idx_portal_candidates_job ON public.portal_candidates(job_id);
CREATE INDEX idx_portal_feedback_candidate ON public.portal_feedback(candidate_id);
CREATE INDEX idx_portal_stage_history_candidate ON public.portal_stage_history(candidate_id);
CREATE INDEX idx_portal_job_notes_job ON public.portal_job_notes(job_id);