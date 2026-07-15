
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS similar_titles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS key_skills text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.role_type_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  similar_titles text[] NOT NULL DEFAULT '{}',
  key_skills text[] NOT NULL DEFAULT '{}',
  ideal_candidate_line text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_type_templates TO authenticated;
GRANT ALL ON public.role_type_templates TO service_role;

ALTER TABLE public.role_type_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage role type templates"
  ON public.role_type_templates
  FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE TRIGGER role_type_templates_touch
  BEFORE UPDATE ON public.role_type_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS role_type_templates_owner_idx
  ON public.role_type_templates(owner_user_id);
