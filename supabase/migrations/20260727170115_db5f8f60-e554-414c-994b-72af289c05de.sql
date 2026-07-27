
ALTER TABLE public.bucket_items
  ADD COLUMN IF NOT EXISTS note_text text;

ALTER TABLE public.bucket_items
  ALTER COLUMN entity_id DROP NOT NULL;

ALTER TABLE public.bucket_items
  DROP CONSTRAINT IF EXISTS bucket_items_entity_type_check;

ALTER TABLE public.bucket_items
  ADD CONSTRAINT bucket_items_entity_type_check
  CHECK (entity_type = ANY (ARRAY['candidate','contact','client','note']));

ALTER TABLE public.bucket_items
  ADD CONSTRAINT bucket_items_shape_check
  CHECK (
    (entity_type = 'note' AND entity_id IS NULL AND note_text IS NOT NULL AND length(btrim(note_text)) > 0)
    OR (entity_type <> 'note' AND entity_id IS NOT NULL)
  );
