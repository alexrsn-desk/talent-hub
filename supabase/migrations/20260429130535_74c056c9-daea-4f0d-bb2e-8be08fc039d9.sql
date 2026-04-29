
-- Add confidence and priority scoring to call_signals
ALTER TABLE public.call_signals 
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS priority_score integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS first_shown_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS days_unactioned integer NOT NULL DEFAULT 0;

-- Per-user signal configuration
CREATE TABLE IF NOT EXISTS public.signal_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  daily_limit integer NOT NULL DEFAULT 8,
  -- Object: { "Hiring Signal": true, "Counter Offer Risk": false, ... }
  enabled_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Object: { "revenue": true, "pipeline": true, "bd": true, "admin": false, "missing_action": true }
  enabled_categories jsonb NOT NULL DEFAULT '{"revenue":true,"pipeline":true,"bd":true,"admin":false,"missing_action":true}'::jsonb,
  show_low_confidence boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signal_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own signal preferences" ON public.signal_preferences;
CREATE POLICY "Users view own signal preferences" ON public.signal_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own signal preferences" ON public.signal_preferences;
CREATE POLICY "Users insert own signal preferences" ON public.signal_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own signal preferences" ON public.signal_preferences;
CREATE POLICY "Users update own signal preferences" ON public.signal_preferences
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own signal preferences" ON public.signal_preferences;
CREATE POLICY "Users delete own signal preferences" ON public.signal_preferences
  FOR DELETE USING (auth.uid() = user_id);
