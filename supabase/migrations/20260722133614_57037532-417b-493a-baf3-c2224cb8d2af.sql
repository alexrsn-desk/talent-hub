
CREATE TABLE public.job_launch_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','done')),
  completed_via text CHECK (completed_via IN ('wizard','manual')),
  completed_at timestamptz,
  completed_by uuid,
  note text,
  launch_id uuid REFERENCES public.job_launches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, item_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_launch_items TO authenticated;
GRANT ALL ON public.job_launch_items TO service_role;

ALTER TABLE public.job_launch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_launch_items select owner or team"
  ON public.job_launch_items FOR SELECT
  USING (public.can_access_owner(owner_user_id));

CREATE POLICY "job_launch_items insert own"
  ON public.job_launch_items FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "job_launch_items update own"
  ON public.job_launch_items FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "job_launch_items delete own"
  ON public.job_launch_items FOR DELETE
  USING (owner_user_id = auth.uid());

CREATE INDEX idx_job_launch_items_job_id ON public.job_launch_items(job_id);
CREATE INDEX idx_job_launch_items_owner ON public.job_launch_items(owner_user_id);
CREATE INDEX idx_job_launch_items_status ON public.job_launch_items(status, completed_via);

CREATE TRIGGER update_job_launch_items_updated_at
  BEFORE UPDATE ON public.job_launch_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
