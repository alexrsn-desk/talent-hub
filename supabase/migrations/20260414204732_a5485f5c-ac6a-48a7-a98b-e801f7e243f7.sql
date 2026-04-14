
CREATE TABLE public.call_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id uuid NOT NULL,
  signal_type text NOT NULL,
  trigger_phrase text NOT NULL,
  explanation text NOT NULL,
  suggested_action text NOT NULL,
  status text NOT NULL DEFAULT 'unactioned',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on call_signals" ON public.call_signals FOR ALL USING (true) WITH CHECK (true);
