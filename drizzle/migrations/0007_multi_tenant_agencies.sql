CREATE TABLE public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Agency',
  plan text NOT NULL DEFAULT 'trial',
  subscription_status text NOT NULL DEFAULT 'trialing',
  seats integer NOT NULL DEFAULT 1,
  monthly_ai_credits integer NOT NULL DEFAULT 300,
  bonus_ai_credits integer NOT NULL DEFAULT 0,
  used_ai_credits integer NOT NULL DEFAULT 0,
  credits_reset_at timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.agencies TO authenticated;
GRANT ALL ON public.agencies TO service_role;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.agency_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'consultant' CHECK (role IN ('owner','admin','consultant')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agency_members TO authenticated;
GRANT ALL ON public.agency_members TO service_role;
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_agency_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT agency_id FROM public.agency_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_agency_admin(_agency uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.agency_members WHERE user_id = auth.uid() AND agency_id = _agency AND role IN ('owner','admin'))
$$;

CREATE POLICY "Members view own agency" ON public.agencies FOR SELECT TO authenticated USING (id = public.current_agency_id());
CREATE POLICY "Admins rename agency" ON public.agencies FOR UPDATE TO authenticated USING (public.is_agency_admin(id)) WITH CHECK (public.is_agency_admin(id));
CREATE POLICY "Members view agency members" ON public.agency_members FOR SELECT TO authenticated USING (agency_id = public.current_agency_id());

-- Prevent client tampering with billing fields
CREATE OR REPLACE FUNCTION public.agencies_protect_billing()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    NEW.plan := OLD.plan; NEW.subscription_status := OLD.subscription_status; NEW.seats := OLD.seats;
    NEW.monthly_ai_credits := OLD.monthly_ai_credits; NEW.bonus_ai_credits := OLD.bonus_ai_credits;
    NEW.used_ai_credits := OLD.used_ai_credits; NEW.credits_reset_at := OLD.credits_reset_at; NEW.trial_ends_at := OLD.trial_ends_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER agencies_protect_billing BEFORE UPDATE ON public.agencies FOR EACH ROW EXECUTE FUNCTION public.agencies_protect_billing();

-- Create an agency for a user if they have none
CREATE OR REPLACE FUNCTION public.ensure_user_agency(_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _a uuid;
BEGIN
  SELECT agency_id INTO _a FROM public.agency_members WHERE user_id = _user;
  IF _a IS NULL THEN
    INSERT INTO public.agencies DEFAULT VALUES RETURNING id INTO _a;
    INSERT INTO public.agency_members (agency_id, user_id, role) VALUES (_a, _user, 'owner');
  END IF;
  RETURN _a;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user_agency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ensure_user_agency(NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_agency AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_agency();

-- Backfill: managers' team members join the manager's agency
DO $$ DECLARE r record; _a uuid; BEGIN
  FOR r IN SELECT id FROM auth.users LOOP
    IF NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.member_user_id = r.id AND tm.active) THEN
      PERFORM public.ensure_user_agency(r.id);
    END IF;
  END LOOP;
  FOR r IN SELECT DISTINCT manager_user_id, member_user_id FROM public.team_members WHERE active AND member_user_id IS NOT NULL LOOP
    _a := public.ensure_user_agency(r.manager_user_id);
    INSERT INTO public.agency_members (agency_id, user_id, role) VALUES (_a, r.member_user_id, 'consultant') ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_agency_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.agency_id IS NULL THEN
    NEW.agency_id := COALESCE(
      (SELECT agency_id FROM public.agency_members WHERE user_id = NEW.owner_user_id),
      (SELECT agency_id FROM public.agency_members WHERE user_id = auth.uid()));
  END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['candidates','jobs','clients','contacts','notes','candidate_jobs','placements','todo_tasks'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='owner_user_id') THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(agency_id)', t||'_agency_id_idx', t);
      EXECUTE format('UPDATE public.%I x SET agency_id = am.agency_id FROM public.agency_members am WHERE am.user_id = x.owner_user_id AND x.agency_id IS NULL', t);
      EXECUTE format('CREATE TRIGGER set_agency_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_agency_id()', t);
      EXECUTE format('CREATE POLICY "Agency isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (agency_id IS NULL OR agency_id = public.current_agency_id()) WITH CHECK (agency_id IS NULL OR agency_id = public.current_agency_id())', t);
    END IF;
  END LOOP;
END $$;

-- AI credit consumption (called by backend functions)
CREATE OR REPLACE FUNCTION public.consume_ai_credit(_user uuid, _amount integer DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.agencies%ROWTYPE;
BEGIN
  SELECT ag.* INTO a FROM public.agencies ag JOIN public.agency_members m ON m.agency_id = ag.id WHERE m.user_id = _user FOR UPDATE OF ag;
  IF NOT FOUND THEN RETURN true; END IF;
  IF a.credits_reset_at <= now() THEN
    UPDATE public.agencies SET used_ai_credits = 0, credits_reset_at = date_trunc('month', now()) + interval '1 month' WHERE id = a.id;
    a.used_ai_credits := 0;
  END IF;
  IF a.used_ai_credits + _amount > a.monthly_ai_credits * a.seats + a.bonus_ai_credits THEN RETURN false; END IF;
  UPDATE public.agencies SET used_ai_credits = used_ai_credits + _amount WHERE id = a.id;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.consume_ai_credit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid, integer) TO service_role;