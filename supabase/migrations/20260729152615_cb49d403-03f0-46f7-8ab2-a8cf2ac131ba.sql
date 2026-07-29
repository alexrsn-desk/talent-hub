ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS medium text;

CREATE INDEX IF NOT EXISTS activity_events_contact_idx
  ON public.activity_events(contact_id, occurred_at DESC);

GRANT INSERT ON public.activity_events TO authenticated;

DROP POLICY IF EXISTS "Owners can insert their activity events" ON public.activity_events;
CREATE POLICY "Owners can insert their activity events"
  ON public.activity_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);