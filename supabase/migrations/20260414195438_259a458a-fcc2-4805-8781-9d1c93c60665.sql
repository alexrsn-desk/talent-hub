
CREATE TABLE public.weekly_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

ALTER TABLE public.weekly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on weekly_summaries" ON public.weekly_summaries FOR SELECT USING (true);
CREATE POLICY "Allow insert on weekly_summaries" ON public.weekly_summaries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update on weekly_summaries" ON public.weekly_summaries FOR UPDATE USING (true);

CREATE INDEX idx_weekly_summaries_week ON public.weekly_summaries (week_start DESC);
