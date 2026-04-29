
-- Settings per user for decay sensitivity per relationship type
CREATE TABLE public.decay_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  threshold_key INTEGER NOT NULL DEFAULT 21,
  threshold_active INTEGER NOT NULL DEFAULT 14,
  threshold_bd INTEGER NOT NULL DEFAULT 30,
  threshold_general INTEGER NOT NULL DEFAULT 60,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.decay_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own decay settings"
  ON public.decay_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_decay_settings_updated_at
  BEFORE UPDATE ON public.decay_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Decay alerts: one per (entity_type, entity_id, owner) at a time, only surfaced once a contact reason exists
CREATE TABLE public.decay_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client','contact')),
  entity_id UUID NOT NULL,
  -- relationship sensitivity bucket
  relationship_kind TEXT NOT NULL CHECK (relationship_kind IN ('key','active','bd','general')),
  -- decay severity surfaced to user
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','due','at_risk','critical','resolved','dismissed')),
  days_since_contact INTEGER NOT NULL DEFAULT 0,
  threshold_days INTEGER NOT NULL DEFAULT 30,
  -- Genuine reason to make contact (required to surface)
  reason TEXT,
  reason_source TEXT CHECK (reason_source IN ('matching_candidates','previous_context','market_intel','candidate_intel','bd_signal')),
  suggested_approach TEXT,
  channel_suggestion TEXT,
  reason_generated_at TIMESTAMPTZ,
  -- Snooze
  snoozed_until DATE,
  -- Lifecycle
  last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  surfaced_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, entity_type, entity_id)
);

CREATE INDEX idx_decay_alerts_owner_status ON public.decay_alerts(owner_user_id, status);
CREATE INDEX idx_decay_alerts_entity ON public.decay_alerts(entity_type, entity_id);

ALTER TABLE public.decay_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access decay_alerts"
  ON public.decay_alerts FOR ALL TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

CREATE TRIGGER update_decay_alerts_updated_at
  BEFORE UPDATE ON public.decay_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
