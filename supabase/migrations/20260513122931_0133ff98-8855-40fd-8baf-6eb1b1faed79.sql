
CREATE TABLE public.saved_searches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  scope text NOT NULL,
  name text NOT NULL,
  query text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access saved_searches"
ON public.saved_searches FOR ALL TO authenticated
USING (public.can_access_owner(owner_user_id))
WITH CHECK (public.can_access_owner(owner_user_id));

CREATE INDEX saved_searches_owner_scope_idx ON public.saved_searches(owner_user_id, scope);

CREATE TRIGGER saved_searches_updated_at
BEFORE UPDATE ON public.saved_searches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
