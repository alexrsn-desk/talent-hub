
-- Add tracking columns to placements
ALTER TABLE public.placements
  ADD COLUMN IF NOT EXISTS still_at_client BOOLEAN,
  ADD COLUMN IF NOT EXISTS settled_status TEXT,
  ADD COLUMN IF NOT EXISTS relationship_health TEXT,
  ADD COLUMN IF NOT EXISTS tracking_notes TEXT,
  ADD COLUMN IF NOT EXISTS new_company TEXT,
  ADD COLUMN IF NOT EXISTS new_job_title TEXT,
  ADD COLUMN IF NOT EXISTS new_manager_name TEXT,
  ADD COLUMN IF NOT EXISTS new_manager_linkedin TEXT,
  ADD COLUMN IF NOT EXISTS move_date DATE,
  ADD COLUMN IF NOT EXISTS reason_for_leaving TEXT,
  ADD COLUMN IF NOT EXISTS still_in_contact BOOLEAN,
  ADD COLUMN IF NOT EXISTS reengage_frequency_months INTEGER,
  ADD COLUMN IF NOT EXISTS last_tracking_checkin_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bd_new_company_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bd_new_manager_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bd_old_role_logged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bd_prompts_dismissed JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Allow 'settled' status in addition to existing values
ALTER TABLE public.placements DROP CONSTRAINT IF EXISTS placements_status_check;
ALTER TABLE public.placements
  ADD CONSTRAINT placements_status_check
  CHECK (status IN ('pre_start','active','guaranteed','settled','at_risk','fallen_through'));

-- Tracking events timeline
CREATE TABLE IF NOT EXISTS public.placement_tracking_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  placement_id UUID NOT NULL REFERENCES public.placements(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('check_in','moved','still_confirmed','note','bd_action','reengage_set')),
  title TEXT NOT NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.placement_tracking_events TO authenticated;
GRANT ALL ON public.placement_tracking_events TO service_role;

ALTER TABLE public.placement_tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and team can view tracking events"
  ON public.placement_tracking_events FOR SELECT
  TO authenticated
  USING (public.can_access_owner(owner_user_id));

CREATE POLICY "Owners can insert tracking events"
  ON public.placement_tracking_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owners can update tracking events"
  ON public.placement_tracking_events FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owners can delete tracking events"
  ON public.placement_tracking_events FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE INDEX IF NOT EXISTS idx_tracking_events_placement ON public.placement_tracking_events(placement_id, occurred_at DESC);
