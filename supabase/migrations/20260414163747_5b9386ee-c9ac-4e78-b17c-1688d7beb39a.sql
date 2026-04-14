
CREATE TABLE public.interview_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_job_id uuid NOT NULL REFERENCES public.candidate_jobs(id) ON DELETE CASCADE,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'available',
  selected_by_client boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.interview_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on interview_slots" ON public.interview_slots
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_interview_slots_cj ON public.interview_slots(candidate_job_id);
