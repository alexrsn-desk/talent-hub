
-- Weekly Standards config per user
CREATE TABLE public.weekly_standards_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('marketing','bd','candidates','jobs')),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  target_value NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'count' CHECK (unit IN ('count','percent','boolean')),
  tracking_mode TEXT NOT NULL DEFAULT 'manual' CHECK (tracking_mode IN ('auto','manual')),
  auto_source TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_standards_targets TO authenticated;
GRANT ALL ON public.weekly_standards_targets TO service_role;
ALTER TABLE public.weekly_standards_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own targets" ON public.weekly_standards_targets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_wst_updated BEFORE UPDATE ON public.weekly_standards_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Weekly manual/auto snapshots per user per week per target
CREATE TABLE public.weekly_standards_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  target_key TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start, target_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_standards_checkins TO authenticated;
GRANT ALL ON public.weekly_standards_checkins TO service_role;
ALTER TABLE public.weekly_standards_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own checkins" ON public.weekly_standards_checkins FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_wsc_updated BEFORE UPDATE ON public.weekly_standards_checkins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_wsc_user_week ON public.weekly_standards_checkins(user_id, week_start);
