
CREATE TABLE public.talent_pools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  target_size INTEGER NOT NULL DEFAULT 5,
  checkin_frequency_days INTEGER NOT NULL DEFAULT 28,
  warning_threshold_days INTEGER NOT NULL DEFAULT 28,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_pools TO authenticated;
GRANT ALL ON public.talent_pools TO service_role;

ALTER TABLE public.talent_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access their own or team's pools"
  ON public.talent_pools FOR ALL
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (owner_user_id = auth.uid());

CREATE TRIGGER trg_talent_pools_updated_at
  BEFORE UPDATE ON public.talent_pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.candidate_talent_pools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  pool_id UUID NOT NULL REFERENCES public.talent_pools(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID,
  UNIQUE (candidate_id, pool_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_talent_pools TO authenticated;
GRANT ALL ON public.candidate_talent_pools TO service_role;

ALTER TABLE public.candidate_talent_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access their own or team's pool memberships"
  ON public.candidate_talent_pools FOR ALL
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (owner_user_id = auth.uid());

CREATE INDEX idx_ctp_pool ON public.candidate_talent_pools(pool_id);
CREATE INDEX idx_ctp_candidate ON public.candidate_talent_pools(candidate_id);
