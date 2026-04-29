
CREATE TABLE public.job_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  owner_user_id uuid,
  score integer NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  positives jsonb NOT NULL DEFAULT '[]'::jsonb,
  negatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, snapshot_date)
);

CREATE INDEX idx_job_score_history_job ON public.job_score_history(job_id, snapshot_date DESC);
CREATE INDEX idx_job_score_history_owner ON public.job_score_history(owner_user_id);

ALTER TABLE public.job_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access job_score_history"
ON public.job_score_history
FOR ALL
TO authenticated
USING (public.can_access_owner(owner_user_id))
WITH CHECK (public.can_access_owner(owner_user_id));
