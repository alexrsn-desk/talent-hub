ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS spott_person_id text;
CREATE INDEX IF NOT EXISTS contacts_spott_person_idx ON public.contacts(owner_user_id, spott_person_id);