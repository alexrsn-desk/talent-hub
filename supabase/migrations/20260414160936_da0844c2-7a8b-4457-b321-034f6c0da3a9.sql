
-- Client portal access table
CREATE TABLE public.client_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  magic_link_token text UNIQUE,
  token_expires_at timestamp with time zone,
  last_accessed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.client_portal_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on client_portal_access" ON public.client_portal_access
  FOR ALL USING (true) WITH CHECK (true);

-- Candidate summaries table
CREATE TABLE public.candidate_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_job_id uuid NOT NULL REFERENCES public.candidate_jobs(id) ON DELETE CASCADE,
  ai_summary text,
  manual_summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(candidate_job_id)
);

ALTER TABLE public.candidate_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on candidate_summaries" ON public.candidate_summaries
  FOR ALL USING (true) WITH CHECK (true);

-- Client feedback table
CREATE TABLE public.client_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_job_id uuid NOT NULL REFERENCES public.candidate_jobs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  strengths text,
  concerns text,
  decision text,
  feedback_type text NOT NULL DEFAULT 'review',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on client_feedback" ON public.client_feedback
  FOR ALL USING (true) WITH CHECK (true);

-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  data jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on notifications" ON public.notifications
  FOR ALL USING (true) WITH CHECK (true);

-- Add interview_date to candidate_jobs
ALTER TABLE public.candidate_jobs ADD COLUMN IF NOT EXISTS interview_date timestamp with time zone;

-- Add updated_at triggers
CREATE TRIGGER update_client_portal_access_updated_at
  BEFORE UPDATE ON public.client_portal_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_candidate_summaries_updated_at
  BEFORE UPDATE ON public.candidate_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_feedback_updated_at
  BEFORE UPDATE ON public.client_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
