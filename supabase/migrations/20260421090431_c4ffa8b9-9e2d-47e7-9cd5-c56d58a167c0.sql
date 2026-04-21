-- SEQUENCES
CREATE TABLE public.sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'personal',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on sequences" ON public.sequences FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER update_sequences_updated_at BEFORE UPDATE ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SEQUENCE STEPS
CREATE TABLE public.sequence_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  day_offset INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'Email',
  message_prompt TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on sequence_steps" ON public.sequence_steps FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_sequence_steps_sequence ON public.sequence_steps(sequence_id, step_number);

-- ENROLLMENTS
CREATE TABLE public.sequence_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  candidate_id UUID,
  client_id UUID,
  job_id UUID,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active',
  current_step INTEGER NOT NULL DEFAULT 1,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on sequence_enrollments" ON public.sequence_enrollments FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_seq_enroll_candidate ON public.sequence_enrollments(candidate_id);
CREATE INDEX idx_seq_enroll_job ON public.sequence_enrollments(job_id);
CREATE INDEX idx_seq_enroll_status ON public.sequence_enrollments(status);
CREATE TRIGGER update_seq_enroll_updated_at BEFORE UPDATE ON public.sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- STEP LOGS
CREATE TABLE public.sequence_step_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID NOT NULL REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  channel_used TEXT,
  note TEXT,
  due_date DATE NOT NULL,
  logged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sequence_step_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on sequence_step_logs" ON public.sequence_step_logs FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_seq_step_logs_enrollment ON public.sequence_step_logs(enrollment_id);
CREATE INDEX idx_seq_step_logs_due ON public.sequence_step_logs(due_date, status);

-- TEMPLATES
CREATE TABLE public.sequence_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sequence_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Templates readable by all" ON public.sequence_templates FOR SELECT USING (true);

-- SEED 3 STARTER TEMPLATES
INSERT INTO public.sequence_templates (name, description, category, steps) VALUES
('Warm Follow-up', 'Re-engage candidates you have already spoken to. 4 touches over 2 weeks.', 'follow-up', '[
  {"step_number":1,"day_offset":0,"channel":"Email","message_prompt":"Send a friendly check-in referencing your last conversation. Ask if anything has changed on their side.","note":"Personal touch — reference last call"},
  {"step_number":2,"day_offset":4,"channel":"LinkedIn","message_prompt":"Drop a short LinkedIn message — share something relevant to their space (article, job, market insight).","note":"Add value, no ask"},
  {"step_number":3,"day_offset":9,"channel":"Call","message_prompt":"Quick call — ask if they have had any updates on other processes or are open to a chat.","note":"Voice touch builds trust"},
  {"step_number":4,"day_offset":14,"channel":"Email","message_prompt":"Final email for now — let them know you will park things and reach back out in a month unless they would prefer otherwise.","note":"Soft close, keep door open"}
]'::jsonb),
('Cold Outreach', 'New candidate or prospect. 5 touches over 3 weeks across multiple channels.', 'cold', '[
  {"step_number":1,"day_offset":0,"channel":"LinkedIn","message_prompt":"Send a personalised connection request. Mention something specific from their profile.","note":"No pitch yet"},
  {"step_number":2,"day_offset":3,"channel":"Email","message_prompt":"First email — short, lead with a specific reason you reached out. One clear ask: 15 min chat.","note":"Under 100 words"},
  {"step_number":3,"day_offset":7,"channel":"LinkedIn","message_prompt":"Follow-up DM — share a relevant role or insight. Keep it short.","note":"Value-first"},
  {"step_number":4,"day_offset":14,"channel":"Email","message_prompt":"Bump email — reply to your previous thread. One sentence: still keen to connect?","note":"Reply to original thread"},
  {"step_number":5,"day_offset":21,"channel":"Call","message_prompt":"Final attempt — quick call. If no answer, leave a short voicemail and close out.","note":"Last touch"}
]'::jsonb),
('Post-Interview Check-in', 'Stay close to a candidate after they have interviewed. 3 touches over 10 days.', 'post-interview', '[
  {"step_number":1,"day_offset":1,"channel":"Call","message_prompt":"Day-after debrief call. How did it go from their perspective? Any concerns?","note":"Capture their honest read"},
  {"step_number":2,"day_offset":4,"channel":"Email","message_prompt":"Update them on client-side status. Even if no news, acknowledge the wait.","note":"Silence kills deals"},
  {"step_number":3,"day_offset":10,"channel":"Call","message_prompt":"Check in on motivation and competing processes. Are they still all-in?","note":"Pre-empt counter-offers"}
]'::jsonb);