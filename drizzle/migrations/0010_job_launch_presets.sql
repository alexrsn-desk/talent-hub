CREATE TABLE public.job_launch_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid,
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  launch_hook text,
  ideal_candidate_line text,
  similar_titles text[] NOT NULL DEFAULT '{}',
  key_skills text[] NOT NULL DEFAULT '{}',
  campaign_subject text,
  campaign_body text,
  linkedin_post text,
  send_client_email boolean NOT NULL DEFAULT true,
  source_job_id uuid,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_launch_presets TO authenticated;
GRANT ALL ON public.job_launch_presets TO service_role;
ALTER TABLE public.job_launch_presets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER job_launch_presets_set_agency BEFORE INSERT ON public.job_launch_presets FOR EACH ROW EXECUTE FUNCTION public.set_agency_id();
CREATE TRIGGER job_launch_presets_updated BEFORE UPDATE ON public.job_launch_presets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Agency members manage presets" ON public.job_launch_presets FOR ALL TO authenticated
  USING (agency_id = public.current_agency_id())
  WITH CHECK (agency_id = public.current_agency_id() AND owner_user_id = auth.uid());
CREATE INDEX job_launch_presets_agency_idx ON public.job_launch_presets(agency_id);