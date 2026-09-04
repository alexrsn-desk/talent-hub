-- Additive foundations for the Desky Action Layer.

-- 1) Notes can attach to a contact (the MCP/action layer already exposes contact notes).
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS notes_contact_id_idx ON public.notes(contact_id);

-- 2) Structured follow-ups on the existing task table (no second task model).
ALTER TABLE public.todo_tasks ADD COLUMN IF NOT EXISTS candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE;
ALTER TABLE public.todo_tasks ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE;
ALTER TABLE public.todo_tasks ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.todo_tasks ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE;
ALTER TABLE public.todo_tasks ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.todo_tasks ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'task';
ALTER TABLE public.todo_tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE public.todo_tasks ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ui';
CREATE INDEX IF NOT EXISTS todo_tasks_followup_idx ON public.todo_tasks(owner_user_id, status, due_date);

-- 3) Centrally managed email templates for automations.
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL DEFAULT auth.uid(),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved BOOLEAN NOT NULL DEFAULT true,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_templates owner access" ON public.email_templates
  FOR ALL TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Proposed (prepare-then-approve) actions for AI agents.
CREATE TABLE IF NOT EXISTS public.action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL DEFAULT auth.uid(),
  action TEXT NOT NULL,
  requested_by TEXT NOT NULL DEFAULT 'ui',
  intent TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  affected JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_count INTEGER NOT NULL DEFAULT 0,
  requires_external_send BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  error TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_proposals TO authenticated;
GRANT ALL ON public.action_proposals TO service_role;
ALTER TABLE public.action_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_proposals owner access" ON public.action_proposals
  FOR ALL TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

CREATE TRIGGER action_proposals_updated_at BEFORE UPDATE ON public.action_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS action_proposals_owner_status_idx ON public.action_proposals(owner_user_id, status, created_at DESC);
