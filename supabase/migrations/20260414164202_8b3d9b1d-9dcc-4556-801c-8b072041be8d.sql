
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  candidate_id UUID,
  client_id UUID,
  job_id UUID,
  candidate_job_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Anyone can read (solo user CRM, open policies)
CREATE POLICY "Allow select on activity_log" ON public.activity_log FOR SELECT USING (true);

-- Anyone can insert
CREATE POLICY "Allow insert on activity_log" ON public.activity_log FOR INSERT WITH CHECK (true);

-- No update or delete policies — permanent log

-- Indexes for common queries
CREATE INDEX idx_activity_log_action_type ON public.activity_log (action_type);
CREATE INDEX idx_activity_log_created_at ON public.activity_log (created_at DESC);
CREATE INDEX idx_activity_log_candidate_id ON public.activity_log (candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX idx_activity_log_client_id ON public.activity_log (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_activity_log_job_id ON public.activity_log (job_id) WHERE job_id IS NOT NULL;
