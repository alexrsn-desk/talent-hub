
CREATE TABLE public.screening_framework_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  section smallint NOT NULL CHECK (section BETWEEN 1 AND 9),
  item_key text NOT NULL,
  value text,
  notes text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','transcript','import')),
  source_note_id uuid,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, item_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.screening_framework_items TO authenticated;
GRANT ALL ON public.screening_framework_items TO service_role;

ALTER TABLE public.screening_framework_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or team can manage screening framework items"
  ON public.screening_framework_items
  FOR ALL
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

CREATE INDEX idx_sfi_candidate ON public.screening_framework_items(candidate_id);
CREATE INDEX idx_sfi_owner_section ON public.screening_framework_items(owner_user_id, section, captured_at DESC);

CREATE TRIGGER update_sfi_updated_at
  BEFORE UPDATE ON public.screening_framework_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
