CREATE TABLE public.brief_item_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  fingerprint TEXT NOT NULL,
  first_surfaced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_shown_at TIMESTAMPTZ,
  times_shown INTEGER NOT NULL DEFAULT 0,
  suppressed BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brief_item_history TO authenticated;
GRANT ALL ON public.brief_item_history TO service_role;

ALTER TABLE public.brief_item_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own brief history"
ON public.brief_item_history FOR ALL TO authenticated
USING (public.can_access_owner(user_id))
WITH CHECK (public.can_access_owner(user_id));

CREATE TRIGGER update_brief_item_history_updated_at
BEFORE UPDATE ON public.brief_item_history
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_brief_item_history_user_open ON public.brief_item_history (user_id, suppressed, resolved_at);