CREATE TABLE public.conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid,
  owner_user_id uuid,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'sms',
  direction text NOT NULL DEFAULT 'outbound',
  from_address text,
  to_address text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  needs_action boolean NOT NULL DEFAULT false,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversation_messages_candidate_idx ON public.conversation_messages(candidate_id, created_at DESC);
CREATE INDEX conversation_messages_client_idx ON public.conversation_messages(client_id, created_at DESC);
CREATE INDEX conversation_messages_agency_idx ON public.conversation_messages(agency_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_messages TO authenticated;
GRANT ALL ON public.conversation_messages TO service_role;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER set_agency_id BEFORE INSERT ON public.conversation_messages FOR EACH ROW EXECUTE FUNCTION public.set_agency_id();
CREATE POLICY "Agency isolation" ON public.conversation_messages AS RESTRICTIVE FOR ALL TO authenticated
  USING (agency_id IS NULL OR agency_id = public.current_agency_id())
  WITH CHECK (agency_id IS NULL OR agency_id = public.current_agency_id());
CREATE POLICY "Team members access messages" ON public.conversation_messages FOR ALL TO authenticated
  USING (owner_user_id IS NULL OR public.can_access_owner(owner_user_id))
  WITH CHECK (owner_user_id = auth.uid());
ALTER TABLE public.recruiter_profiles ADD COLUMN IF NOT EXISTS booking_url text;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;