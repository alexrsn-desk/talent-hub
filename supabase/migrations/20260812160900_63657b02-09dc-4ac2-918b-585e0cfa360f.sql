ALTER TABLE public.client_portals
  ADD COLUMN IF NOT EXISTS notify_candidate_on_interview boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_candidate_on_reject boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS job_spec_synced_at timestamptz;

CREATE TABLE IF NOT EXISTS public.candidate_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_job_id uuid NOT NULL REFERENCES public.candidate_jobs(id) ON DELETE CASCADE,
  access_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_portals_candidate_job_unique UNIQUE (candidate_job_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_portals TO authenticated;
GRANT ALL ON public.candidate_portals TO service_role;

ALTER TABLE public.candidate_portals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage candidate portals"
ON public.candidate_portals
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.candidate_jobs cj
  WHERE cj.id = candidate_portals.candidate_job_id
    AND public.can_access_owner(cj.owner_user_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.candidate_jobs cj
  WHERE cj.id = candidate_portals.candidate_job_id
    AND public.can_access_owner(cj.owner_user_id)
));

CREATE TRIGGER trg_candidate_portals_updated_at
BEFORE UPDATE ON public.candidate_portals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();