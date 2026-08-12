CREATE TABLE public.portal_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_job_id uuid NOT NULL REFERENCES public.candidate_jobs(id) ON DELETE CASCADE,
  client_email text,
  stage_at_time text,
  comment text NOT NULL,
  rating integer CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_feedback TO authenticated;
GRANT ALL ON public.portal_feedback TO service_role;
ALTER TABLE public.portal_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage portal feedback" ON public.portal_feedback FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.candidate_jobs cj WHERE cj.id = candidate_job_id AND public.can_access_owner(cj.owner_user_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.candidate_jobs cj WHERE cj.id = candidate_job_id AND public.can_access_owner(cj.owner_user_id)));

CREATE TABLE public.portal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_portal_id uuid NOT NULL REFERENCES public.client_portals(id) ON DELETE CASCADE,
  author_email text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_notes TO authenticated;
GRANT ALL ON public.portal_notes TO service_role;
ALTER TABLE public.portal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage portal notes" ON public.portal_notes FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.client_portals cp WHERE cp.id = client_portal_id AND public.can_access_owner(cp.user_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.client_portals cp WHERE cp.id = client_portal_id AND public.can_access_owner(cp.user_id)));

CREATE TABLE public.portal_stage_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  prep_material text,
  interview_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, stage)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_stage_content TO authenticated;
GRANT ALL ON public.portal_stage_content TO service_role;
ALTER TABLE public.portal_stage_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage portal stage content" ON public.portal_stage_content FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_access_owner(j.owner_user_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_access_owner(j.owner_user_id)));
CREATE TRIGGER trg_portal_stage_content_updated BEFORE UPDATE ON public.portal_stage_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.portal_scheduling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  calendly_url text,
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_scheduling TO authenticated;
GRANT ALL ON public.portal_scheduling TO service_role;
ALTER TABLE public.portal_scheduling ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage portal scheduling" ON public.portal_scheduling FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_access_owner(j.owner_user_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_access_owner(j.owner_user_id)));
CREATE TRIGGER trg_portal_scheduling_updated BEFORE UPDATE ON public.portal_scheduling FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();