ALTER TABLE public.call_signals
  ADD COLUMN IF NOT EXISTS signal_category text NOT NULL DEFAULT 'opportunity',
  ADD COLUMN IF NOT EXISTS suggested_date text;