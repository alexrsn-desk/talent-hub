CREATE TABLE public.sourcewhale_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  subscription_type TEXT NOT NULL CHECK (subscription_type IN ('candidateCreated','candidateUpdated')),
  subscription_id TEXT NOT NULL,
  target_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, subscription_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sourcewhale_subscriptions TO authenticated;
GRANT ALL ON public.sourcewhale_subscriptions TO service_role;

ALTER TABLE public.sourcewhale_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own sourcewhale subscriptions"
ON public.sourcewhale_subscriptions
FOR ALL
TO authenticated
USING (auth.uid() = owner_user_id)
WITH CHECK (auth.uid() = owner_user_id);

CREATE TRIGGER update_sourcewhale_subscriptions_updated_at
BEFORE UPDATE ON public.sourcewhale_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();