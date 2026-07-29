ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS bd_message_variant text,
  ADD COLUMN IF NOT EXISTS bd_status text,
  ADD COLUMN IF NOT EXISTS bd_date_first_contacted date,
  ADD COLUMN IF NOT EXISTS bd_last_touch_date date,
  ADD COLUMN IF NOT EXISTS bd_next_followup_date date,
  ADD COLUMN IF NOT EXISTS bd_trigger_notes text,
  ADD COLUMN IF NOT EXISTS bd_conversation_notes text,
  ADD COLUMN IF NOT EXISTS bd_outcome text;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS bd_message_variant text,
  ADD COLUMN IF NOT EXISTS bd_status text,
  ADD COLUMN IF NOT EXISTS bd_date_first_contacted date,
  ADD COLUMN IF NOT EXISTS bd_last_touch_date date,
  ADD COLUMN IF NOT EXISTS bd_next_followup_date date,
  ADD COLUMN IF NOT EXISTS bd_trigger_notes text,
  ADD COLUMN IF NOT EXISTS bd_conversation_notes text,
  ADD COLUMN IF NOT EXISTS bd_outcome text;

CREATE INDEX IF NOT EXISTS idx_candidates_bd_followup ON public.candidates (bd_next_followup_date) WHERE bd_next_followup_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_bd_followup ON public.contacts (bd_next_followup_date) WHERE bd_next_followup_date IS NOT NULL;