-- Webhook settings (one row per user)
CREATE TABLE public.webhook_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  secret_key text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  auto_create_clients boolean NOT NULL DEFAULT true,
  run_signal_detection boolean NOT NULL DEFAULT true,
  show_in_activity_feed boolean NOT NULL DEFAULT true,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on webhook_settings" ON public.webhook_settings FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_webhook_settings_updated_at
BEFORE UPDATE ON public.webhook_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Webhook call log
CREATE TABLE public.webhook_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  entity_type text NOT NULL,
  action text NOT NULL,
  status text NOT NULL,
  record_id uuid,
  record_name text,
  error_message text,
  processing_ms integer,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on webhook_logs" ON public.webhook_logs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX webhook_logs_user_created_idx ON public.webhook_logs (user_id, created_at DESC);