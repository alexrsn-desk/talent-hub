
-- ============================================
-- 1. ROLES INFRASTRUCTURE
-- ============================================

CREATE TYPE public.app_role AS ENUM ('manager', 'consultant', 'solo');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- 2. TEAM MEMBERS
-- ============================================

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  joined_date timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage own team" ON public.team_members
  FOR ALL USING (auth.uid() = manager_user_id) WITH CHECK (auth.uid() = manager_user_id);

CREATE POLICY "Members see own membership" ON public.team_members
  FOR SELECT USING (auth.uid() = member_user_id);

CREATE TRIGGER team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3. TEAM INVITES
-- ============================================

CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  email text,
  name text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at timestamptz,
  used_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage own invites" ON public.team_invites
  FOR ALL USING (auth.uid() = manager_user_id) WITH CHECK (auth.uid() = manager_user_id);

CREATE POLICY "Authenticated can lookup invite by code" ON public.team_invites
  FOR SELECT TO authenticated USING (true);

-- ============================================
-- 4. OWNERSHIP COLUMNS ON CORE TABLES
-- ============================================

ALTER TABLE public.candidates ADD COLUMN owner_user_id uuid;
ALTER TABLE public.jobs ADD COLUMN owner_user_id uuid;
ALTER TABLE public.clients ADD COLUMN owner_user_id uuid;
ALTER TABLE public.notes ADD COLUMN owner_user_id uuid;
ALTER TABLE public.candidate_jobs ADD COLUMN owner_user_id uuid;
ALTER TABLE public.todo_tasks ADD COLUMN owner_user_id uuid;

-- Backfill existing data to first existing user (the solo user)
DO $$
DECLARE
  first_user uuid;
BEGIN
  SELECT id INTO first_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
  IF first_user IS NOT NULL THEN
    UPDATE public.candidates SET owner_user_id = first_user WHERE owner_user_id IS NULL;
    UPDATE public.jobs SET owner_user_id = first_user WHERE owner_user_id IS NULL;
    UPDATE public.clients SET owner_user_id = first_user WHERE owner_user_id IS NULL;
    UPDATE public.notes SET owner_user_id = first_user WHERE owner_user_id IS NULL;
    UPDATE public.candidate_jobs SET owner_user_id = first_user WHERE owner_user_id IS NULL;
    UPDATE public.todo_tasks SET owner_user_id = first_user WHERE owner_user_id IS NULL OR user_id IS NULL;
  END IF;
END $$;

CREATE INDEX idx_candidates_owner ON public.candidates(owner_user_id);
CREATE INDEX idx_jobs_owner ON public.jobs(owner_user_id);
CREATE INDEX idx_clients_owner ON public.clients(owner_user_id);
CREATE INDEX idx_notes_owner ON public.notes(owner_user_id);
CREATE INDEX idx_candidate_jobs_owner ON public.candidate_jobs(owner_user_id);
CREATE INDEX idx_todo_tasks_owner ON public.todo_tasks(owner_user_id);

-- ============================================
-- 5. HELPER: is row owner or manager-of-owner
-- ============================================

CREATE OR REPLACE FUNCTION public.can_access_owner(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _owner IS NULL
    OR auth.uid() = _owner
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.manager_user_id = auth.uid()
        AND tm.member_user_id = _owner
        AND tm.active = true
    )
$$;

-- ============================================
-- 6. TIGHTEN RLS ON CORE TABLES
-- ============================================

-- candidates
DROP POLICY IF EXISTS "Allow all on candidates" ON public.candidates;
CREATE POLICY "Owner or manager access candidates" ON public.candidates
  FOR ALL TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

-- jobs
DROP POLICY IF EXISTS "Allow all on jobs" ON public.jobs;
CREATE POLICY "Owner or manager access jobs" ON public.jobs
  FOR ALL TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

-- clients
DROP POLICY IF EXISTS "Allow all on clients" ON public.clients;
CREATE POLICY "Owner or manager access clients" ON public.clients
  FOR ALL TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

-- notes
DROP POLICY IF EXISTS "Allow all on notes" ON public.notes;
CREATE POLICY "Owner or manager access notes" ON public.notes
  FOR ALL TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

-- candidate_jobs
DROP POLICY IF EXISTS "Allow all on candidate_jobs" ON public.candidate_jobs;
CREATE POLICY "Owner or manager access candidate_jobs" ON public.candidate_jobs
  FOR ALL TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

-- todo_tasks
DROP POLICY IF EXISTS "Allow all on todo_tasks" ON public.todo_tasks;
CREATE POLICY "Owner or manager access todo_tasks" ON public.todo_tasks
  FOR ALL TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));
