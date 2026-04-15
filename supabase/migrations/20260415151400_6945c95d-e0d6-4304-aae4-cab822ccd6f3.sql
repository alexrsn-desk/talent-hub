
-- Usage logs table
CREATE TABLE public.usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  feature_type text NOT NULL,
  month_year text NOT NULL,
  token_count integer DEFAULT 0,
  is_grace_extension boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_user_month ON public.usage_logs (user_id, month_year, feature_type);

ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on usage_logs" ON public.usage_logs FOR ALL USING (true) WITH CHECK (true);

-- User plans table
CREATE TABLE public.user_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  plan_type text NOT NULL DEFAULT 'solo',
  billing_start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_reset_date date NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month')::date,
  status text NOT NULL DEFAULT 'trial',
  trial_ends_at timestamp with time zone DEFAULT (now() + interval '14 days'),
  grace_used_this_month boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on user_plans" ON public.user_plans FOR ALL USING (true) WITH CHECK (true);

-- Auto-create plan for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_plans (user_id, plan_type, status, trial_ends_at)
  VALUES (NEW.id, 'solo', 'trial', now() + interval '14 days')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_plan
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_plan();

-- Update trigger for user_plans
CREATE TRIGGER update_user_plans_updated_at
BEFORE UPDATE ON public.user_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
