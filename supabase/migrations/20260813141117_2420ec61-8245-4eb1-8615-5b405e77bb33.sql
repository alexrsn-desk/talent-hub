-- ============================================================
-- PORTAL: agency settings + jobs (user-owned roots)
-- ============================================================
CREATE TABLE public.portal_agency_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My Agency',
  notification_email text,
  notify_candidate_interview boolean NOT NULL DEFAULT false,
  notify_candidate_rejection boolean NOT NULL DEFAULT false,
  from_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_agency_settings TO authenticated;
GRANT ALL ON public.portal_agency_settings TO service_role;
ALTER TABLE public.portal_agency_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_agency_settings owner access" ON public.portal_agency_settings
  FOR ALL TO authenticated
  USING (public.can_access_owner(user_id))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.portal_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  client_name text NOT NULL,
  company_info text,
  job_spec text,
  job_spec_path text,
  job_spec_filename text,
  status text NOT NULL DEFAULT 'open',
  stages text[] NOT NULL DEFAULT ARRAY['Submitted','Reviewed','Interview','Offer','Placed'],
  notify_candidate_interview boolean,
  notify_candidate_rejection boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_jobs_user_id_idx ON public.portal_jobs(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_jobs TO authenticated;
GRANT ALL ON public.portal_jobs TO service_role;
ALTER TABLE public.portal_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_jobs owner access" ON public.portal_jobs
  FOR ALL TO authenticated
  USING (public.can_access_owner(user_id))
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- Ownership helper functions (join-based RLS for dependent tables)
-- ============================================================
CREATE OR REPLACE FUNCTION public.portal_can_access_job(_job_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_jobs j
    WHERE j.id = _job_id AND public.can_access_owner(j.user_id)
  )
$$;

-- ============================================================
-- Candidates (inherit ownership via job)
-- ============================================================
CREATE TABLE public.portal_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.portal_jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  headline text,
  cv_path text,
  client_notes text,
  current_stage text NOT NULL DEFAULT 'Submitted',
  rejected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_candidates_job_id_idx ON public.portal_candidates(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_candidates TO authenticated;
GRANT ALL ON public.portal_candidates TO service_role;
ALTER TABLE public.portal_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_candidates owner access" ON public.portal_candidates
  FOR ALL TO authenticated
  USING (public.portal_can_access_job(job_id))
  WITH CHECK (public.portal_can_access_job(job_id));

CREATE OR REPLACE FUNCTION public.portal_can_access_candidate(_candidate_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.portal_candidates c
    JOIN public.portal_jobs j ON j.id = c.job_id
    WHERE c.id = _candidate_id AND public.can_access_owner(j.user_id)
  )
$$;

-- ============================================================
-- Portals
-- ============================================================
CREATE TABLE public.portal_client_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.portal_jobs(id) ON DELETE CASCADE,
  access_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  calendly_url text,
  availability_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_client_portals TO authenticated;
GRANT ALL ON public.portal_client_portals TO service_role;
ALTER TABLE public.portal_client_portals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_client_portals owner access" ON public.portal_client_portals
  FOR ALL TO authenticated
  USING (public.portal_can_access_job(job_id))
  WITH CHECK (public.portal_can_access_job(job_id));

CREATE TABLE public.portal_candidate_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  access_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  job_pack text,
  prep_material text,
  interview_details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_candidate_portals TO authenticated;
GRANT ALL ON public.portal_candidate_portals TO service_role;
ALTER TABLE public.portal_candidate_portals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_candidate_portals owner access" ON public.portal_candidate_portals
  FOR ALL TO authenticated
  USING (public.portal_can_access_candidate(candidate_id))
  WITH CHECK (public.portal_can_access_candidate(candidate_id));

-- ============================================================
-- Candidate-scoped tables
-- ============================================================
CREATE TABLE public.portal_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  client_email text,
  stage_at_time text,
  comment text NOT NULL,
  rating int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_feedback_candidate_id_idx ON public.portal_feedback(candidate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_feedback TO authenticated;
GRANT ALL ON public.portal_feedback TO service_role;
ALTER TABLE public.portal_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_feedback owner access" ON public.portal_feedback
  FOR ALL TO authenticated
  USING (public.portal_can_access_candidate(candidate_id))
  WITH CHECK (public.portal_can_access_candidate(candidate_id));

CREATE TABLE public.portal_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_stage_history_candidate_id_idx ON public.portal_stage_history(candidate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_stage_history TO authenticated;
GRANT ALL ON public.portal_stage_history TO service_role;
ALTER TABLE public.portal_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_stage_history owner access" ON public.portal_stage_history
  FOR ALL TO authenticated
  USING (public.portal_can_access_candidate(candidate_id))
  WITH CHECK (public.portal_can_access_candidate(candidate_id));

CREATE TABLE public.portal_interview_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  slot text,
  external_reference text,
  status text NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_interview_bookings_candidate_id_idx ON public.portal_interview_bookings(candidate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_interview_bookings TO authenticated;
GRANT ALL ON public.portal_interview_bookings TO service_role;
ALTER TABLE public.portal_interview_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_interview_bookings owner access" ON public.portal_interview_bookings
  FOR ALL TO authenticated
  USING (public.portal_can_access_candidate(candidate_id))
  WITH CHECK (public.portal_can_access_candidate(candidate_id));

CREATE TABLE public.portal_candidate_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  kind text NOT NULL,
  to_email text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_candidate_emails_candidate_id_idx ON public.portal_candidate_emails(candidate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_candidate_emails TO authenticated;
GRANT ALL ON public.portal_candidate_emails TO service_role;
ALTER TABLE public.portal_candidate_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_candidate_emails owner access" ON public.portal_candidate_emails
  FOR ALL TO authenticated
  USING (public.portal_can_access_candidate(candidate_id))
  WITH CHECK (public.portal_can_access_candidate(candidate_id));

-- ============================================================
-- Job-scoped tables
-- ============================================================
CREATE TABLE public.portal_job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.portal_jobs(id) ON DELETE CASCADE,
  author_role text NOT NULL DEFAULT 'agency',
  author_email text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_job_notes_job_id_idx ON public.portal_job_notes(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_job_notes TO authenticated;
GRANT ALL ON public.portal_job_notes TO service_role;
ALTER TABLE public.portal_job_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_job_notes owner access" ON public.portal_job_notes
  FOR ALL TO authenticated
  USING (public.portal_can_access_job(job_id))
  WITH CHECK (public.portal_can_access_job(job_id));

CREATE TABLE public.portal_job_stage_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.portal_jobs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  prep_material text,
  interview_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, stage)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_job_stage_content TO authenticated;
GRANT ALL ON public.portal_job_stage_content TO service_role;
ALTER TABLE public.portal_job_stage_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_job_stage_content owner access" ON public.portal_job_stage_content
  FOR ALL TO authenticated
  USING (public.portal_can_access_job(job_id))
  WITH CHECK (public.portal_can_access_job(job_id));

CREATE TABLE public.portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  job_id uuid REFERENCES public.portal_jobs(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.portal_candidates(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_notifications_job_id_idx ON public.portal_notifications(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_notifications TO authenticated;
GRANT ALL ON public.portal_notifications TO service_role;
ALTER TABLE public.portal_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_notifications owner access" ON public.portal_notifications
  FOR ALL TO authenticated
  USING (job_id IS NOT NULL AND public.portal_can_access_job(job_id))
  WITH CHECK (job_id IS NOT NULL AND public.portal_can_access_job(job_id));

-- ============================================================
-- API keys + webhooks (user-owned)
-- ============================================================
CREATE TABLE public.portal_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_api_keys_user_id_idx ON public.portal_api_keys(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_api_keys TO authenticated;
GRANT ALL ON public.portal_api_keys TO service_role;
ALTER TABLE public.portal_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_api_keys owner access" ON public.portal_api_keys
  FOR ALL TO authenticated
  USING (public.can_access_owner(user_id))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.portal_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  url text NOT NULL,
  secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  events text[] NOT NULL DEFAULT ARRAY['candidate.created','candidate.stage_changed','feedback.created','interview.booked','candidate.rejected'],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_webhooks_user_id_idx ON public.portal_webhooks(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_webhooks TO authenticated;
GRANT ALL ON public.portal_webhooks TO service_role;
ALTER TABLE public.portal_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_webhooks owner access" ON public.portal_webhooks
  FOR ALL TO authenticated
  USING (public.can_access_owner(user_id))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.portal_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.portal_webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  status_code integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_webhook_deliveries_webhook_id_idx ON public.portal_webhook_deliveries(webhook_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_webhook_deliveries TO authenticated;
GRANT ALL ON public.portal_webhook_deliveries TO service_role;
ALTER TABLE public.portal_webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_webhook_deliveries owner access" ON public.portal_webhook_deliveries
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.portal_webhooks w
    WHERE w.id = webhook_id AND public.can_access_owner(w.user_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.portal_webhooks w
    WHERE w.id = webhook_id AND w.user_id = auth.uid()
  ));

-- ============================================================
-- Notification triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.portal_notify_stage_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; j record;
BEGIN
  SELECT * INTO c FROM public.portal_candidates WHERE id = NEW.candidate_id;
  SELECT * INTO j FROM public.portal_jobs WHERE id = c.job_id;
  INSERT INTO public.portal_notifications (kind, title, body, job_id, candidate_id)
  VALUES ('stage_change',
    c.name || ' moved to ' || NEW.to_stage,
    j.title || ' (' || j.client_name || ') - ' || coalesce(NEW.from_stage, 'new') || ' to ' || NEW.to_stage || ' by ' || coalesce(NEW.changed_by, 'client'),
    c.job_id, c.id);
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.portal_notify_stage_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_portal_notify_stage_change AFTER INSERT ON public.portal_stage_history
FOR EACH ROW EXECUTE FUNCTION public.portal_notify_stage_change();

CREATE OR REPLACE FUNCTION public.portal_notify_feedback()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; j record;
BEGIN
  SELECT * INTO c FROM public.portal_candidates WHERE id = NEW.candidate_id;
  SELECT * INTO j FROM public.portal_jobs WHERE id = c.job_id;
  INSERT INTO public.portal_notifications (kind, title, body, job_id, candidate_id)
  VALUES ('feedback',
    'New feedback on ' || c.name,
    j.title || ' (' || j.client_name || ') - ' || coalesce(NEW.client_email, 'client') || ': ' || NEW.comment,
    c.job_id, c.id);
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.portal_notify_feedback() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_portal_notify_feedback AFTER INSERT ON public.portal_feedback
FOR EACH ROW EXECUTE FUNCTION public.portal_notify_feedback();

CREATE OR REPLACE FUNCTION public.portal_notify_booking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; j record;
BEGIN
  SELECT * INTO c FROM public.portal_candidates WHERE id = NEW.candidate_id;
  SELECT * INTO j FROM public.portal_jobs WHERE id = c.job_id;
  INSERT INTO public.portal_notifications (kind, title, body, job_id, candidate_id)
  VALUES ('booking',
    c.name || ' requested an interview slot',
    j.title || ' (' || j.client_name || ') - slot: ' || coalesce(NEW.slot, NEW.external_reference, 'unspecified'),
    c.job_id, c.id);
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.portal_notify_booking() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_portal_notify_booking AFTER INSERT ON public.portal_interview_bookings
FOR EACH ROW EXECUTE FUNCTION public.portal_notify_booking();

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER trg_portal_jobs_updated BEFORE UPDATE ON public.portal_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_candidates_updated BEFORE UPDATE ON public.portal_candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_agency_settings_updated BEFORE UPDATE ON public.portal_agency_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_api_keys_updated BEFORE UPDATE ON public.portal_api_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_webhooks_updated BEFORE UPDATE ON public.portal_webhooks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_portal_stage_content_updated BEFORE UPDATE ON public.portal_job_stage_content
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();