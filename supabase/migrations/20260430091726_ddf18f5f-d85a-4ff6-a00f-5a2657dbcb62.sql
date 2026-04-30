
-- Quick Notes inbox
CREATE TABLE public.quick_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'inbox', -- 'inbox' | 'done'
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access quick_notes"
ON public.quick_notes
FOR ALL
TO authenticated
USING (public.can_access_owner(owner_user_id))
WITH CHECK (public.can_access_owner(owner_user_id));

CREATE TRIGGER quick_notes_updated
BEFORE UPDATE ON public.quick_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_quick_notes_owner_status ON public.quick_notes(owner_user_id, status);

-- Mark records as needing profile completion (created via Quick Add)
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS incomplete_profile boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS incomplete_profile boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS incomplete_profile boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS incomplete_profile boolean NOT NULL DEFAULT false;
