
ALTER TABLE public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS reactivation_email_template TEXT;

CREATE TABLE IF NOT EXISTS public.reactivation_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  name TEXT,
  source_trigger TEXT,
  total_contacts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  flagged_count INTEGER NOT NULL DEFAULT 0,
  followup_days INTEGER,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reactivation_campaigns TO authenticated;
GRANT ALL ON public.reactivation_campaigns TO service_role;
ALTER TABLE public.reactivation_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their reactivation campaigns"
  ON public.reactivation_campaigns FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE TABLE IF NOT EXISTS public.reactivation_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.reactivation_campaigns(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL,
  contact_kind TEXT NOT NULL,
  contact_id UUID,
  contact_name TEXT,
  contact_company TEXT,
  contact_email TEXT,
  message_type TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  followup_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reactivation_messages TO authenticated;
GRANT ALL ON public.reactivation_messages TO service_role;
ALTER TABLE public.reactivation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their reactivation messages"
  ON public.reactivation_messages FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE INDEX IF NOT EXISTS idx_reactivation_messages_campaign ON public.reactivation_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_campaigns_owner ON public.reactivation_campaigns(owner_user_id, created_at DESC);
