
CREATE TABLE public.buckets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX buckets_owner_name_idx ON public.buckets(owner_user_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.buckets TO authenticated;
GRANT ALL ON public.buckets TO service_role;
ALTER TABLE public.buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own buckets"
ON public.buckets FOR ALL
USING (auth.uid() = owner_user_id)
WITH CHECK (auth.uid() = owner_user_id);

CREATE TRIGGER buckets_updated_at
BEFORE UPDATE ON public.buckets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.bucket_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket_id UUID NOT NULL REFERENCES public.buckets(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('candidate','contact','client')),
  entity_id UUID NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, entity_type, entity_id)
);
CREATE INDEX bucket_items_entity_idx ON public.bucket_items(entity_type, entity_id);
CREATE INDEX bucket_items_owner_idx ON public.bucket_items(owner_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bucket_items TO authenticated;
GRANT ALL ON public.bucket_items TO service_role;
ALTER TABLE public.bucket_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bucket items"
ON public.bucket_items FOR ALL
USING (auth.uid() = owner_user_id)
WITH CHECK (auth.uid() = owner_user_id);

ALTER TABLE public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS pinned_candidate_sections TEXT[] NOT NULL DEFAULT '{}'::text[];
