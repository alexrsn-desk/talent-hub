-- 1. Settings
CREATE TABLE IF NOT EXISTS public.signal_score_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weights jsonb NOT NULL DEFAULT '{"placed":30,"client":30,"touchpoints":20,"hiring_manager":20,"revenue":20,"replied":10,"recent_contact":10,"linkedin_only":2}'::jsonb,
  monitor_top_percent integer NOT NULL DEFAULT 20,
  monitor_min_score integer NOT NULL DEFAULT 40,
  going_cold_days integer NOT NULL DEFAULT 180,
  anniversary_lookahead_days integer NOT NULL DEFAULT 30,
  anniversary_months integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_score_settings TO authenticated;
GRANT ALL ON public.signal_score_settings TO service_role;
ALTER TABLE public.signal_score_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own signal score settings" ON public.signal_score_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2. Signals
CREATE TABLE IF NOT EXISTS public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid,
  person_type text CHECK (person_type IN ('candidate','contact')),
  company_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  signal_type text NOT NULL,
  previous_value text,
  new_value text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL DEFAULT 'internal',
  confidence text NOT NULL DEFAULT 'high',
  relationship_score integer NOT NULL DEFAULT 0,
  opportunity_score integer NOT NULL DEFAULT 0,
  reason_for_recommendation text,
  suggested_action text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','viewed','actioned','snoozed','dismissed')),
  assigned_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signals_user_status_idx ON public.signals(user_id, status, opportunity_score DESC);
CREATE INDEX IF NOT EXISTS signals_person_idx ON public.signals(person_type, person_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signals TO authenticated;
GRANT ALL ON public.signals TO service_role;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team can access signals" ON public.signals
  FOR ALL TO authenticated USING (public.can_access_owner(user_id)) WITH CHECK (public.can_access_owner(user_id));

-- 3. Score columns
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS relationship_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relationship_score_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS monitored boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suggested_reengage_date date;
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS relationship_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relationship_score_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS monitored boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suggested_reengage_date date;

-- 4. Helpers
CREATE OR REPLACE FUNCTION public.desky_is_senior_title(_title text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(_title, '') ~* '(head of|vp\b|vice president|director|chief|c-level|cto|ceo|cfo|coo|cpo|founder|partner|managing)';
$$;

CREATE OR REPLACE FUNCTION public.desky_last_touchpoint(_person_type text, _person_id uuid)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a timestamptz; b timestamptz;
BEGIN
  SELECT max(occurred_at) INTO a FROM activity_events
   WHERE (_person_type = 'candidate' AND candidate_id = _person_id)
      OR (_person_type = 'contact' AND contact_id = _person_id);
  IF _person_type = 'candidate' THEN
    SELECT max(created_at) INTO b FROM notes WHERE candidate_id = _person_id;
  ELSE
    SELECT bd_last_touch_date::timestamptz INTO b FROM contacts WHERE id = _person_id;
  END IF;
  RETURN greatest(coalesce(a, '-infinity'::timestamptz), coalesce(b, '-infinity'::timestamptz));
END;
$$;

CREATE OR REPLACE FUNCTION public.desky_relationship_score(_person_type text, _person_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w jsonb; s integer := 0; _owner uuid; _title text; _li text; _client uuid;
  tp integer := 0; last_tp timestamptz; _replied boolean := false;
BEGIN
  IF _person_type = 'candidate' THEN
    SELECT owner_user_id, job_title, linkedin_url, NULL::uuid
      INTO _owner, _title, _li, _client FROM candidates WHERE id = _person_id;
  ELSE
    SELECT owner_user_id, job_title, linkedin_url, client_id
      INTO _owner, _title, _li, _client FROM contacts WHERE id = _person_id;
  END IF;

  SELECT coalesce(weights, '{}'::jsonb) INTO w FROM signal_score_settings WHERE user_id = _owner;
  w := coalesce(w, '{}'::jsonb);

  SELECT count(*) INTO tp FROM activity_events
   WHERE (_person_type = 'candidate' AND candidate_id = _person_id)
      OR (_person_type = 'contact' AND contact_id = _person_id);
  IF _person_type = 'candidate' THEN
    tp := tp + (SELECT count(*) FROM notes WHERE candidate_id = _person_id);
  END IF;
  last_tp := public.desky_last_touchpoint(_person_type, _person_id);

  IF _person_type = 'candidate' THEN
    IF EXISTS (SELECT 1 FROM placements WHERE candidate_id = _person_id) THEN
      s := s + coalesce((w->>'placed')::int, 30);
    END IF;
    IF EXISTS (SELECT 1 FROM placements WHERE candidate_id = _person_id AND coalesce(fee_amount,0) > 0) THEN
      s := s + coalesce((w->>'revenue')::int, 20);
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM notes WHERE candidate_id = _person_id AND coalesce(outcome,'') ILIKE '%replied%'
    ) OR EXISTS (
      SELECT 1 FROM candidates WHERE id = _person_id
        AND (coalesce(bd_outcome,'') ILIKE '%repl%' OR coalesce(bd_outcome,'') ILIKE '%positive%')
    ) INTO _replied;
  ELSE
    IF _client IS NOT NULL AND EXISTS (
      SELECT 1 FROM clients WHERE id = _client AND coalesce(status,'') ILIKE '%client%'
    ) THEN
      s := s + coalesce((w->>'client')::int, 30);
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM contacts WHERE id = _person_id
        AND (coalesce(bd_outcome,'') ILIKE '%repl%' OR coalesce(bd_outcome,'') ILIKE '%positive%')
    ) INTO _replied;
  END IF;

  IF tp >= 3 THEN s := s + coalesce((w->>'touchpoints')::int, 20); END IF;
  IF public.desky_is_senior_title(_title)
     OR (_person_type = 'contact' AND _client IS NOT NULL AND EXISTS (SELECT 1 FROM jobs WHERE client_id = _client)) THEN
    s := s + coalesce((w->>'hiring_manager')::int, 20);
  END IF;
  IF _replied THEN s := s + coalesce((w->>'replied')::int, 10); END IF;
  IF last_tp > now() - interval '12 months' THEN s := s + coalesce((w->>'recent_contact')::int, 10); END IF;
  IF s = 0 AND tp = 0 AND _li IS NOT NULL THEN s := s + coalesce((w->>'linkedin_only')::int, 2); END IF;

  RETURN least(s, 200);
END;
$$;

CREATE OR REPLACE FUNCTION public.desky_recalc_person(_person_type text, _person_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sc integer;
BEGIN
  IF _person_id IS NULL THEN RETURN; END IF;
  sc := public.desky_relationship_score(_person_type, _person_id);
  IF _person_type = 'candidate' THEN
    UPDATE candidates SET relationship_score = sc, relationship_score_updated_at = now()
     WHERE id = _person_id AND relationship_score IS DISTINCT FROM sc;
  ELSE
    UPDATE contacts SET relationship_score = sc, relationship_score_updated_at = now()
     WHERE id = _person_id AND relationship_score IS DISTINCT FROM sc;
  END IF;
END;
$$;

-- 5. Triggers keeping scores fresh
CREATE OR REPLACE FUNCTION public.desky_score_from_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.desky_recalc_person('candidate', coalesce(NEW.candidate_id, OLD.candidate_id));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS notes_recalc_score ON public.notes;
CREATE TRIGGER notes_recalc_score AFTER INSERT OR UPDATE OR DELETE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.desky_score_from_note();

CREATE OR REPLACE FUNCTION public.desky_score_from_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.desky_recalc_person('candidate', coalesce(NEW.candidate_id, OLD.candidate_id));
  PERFORM public.desky_recalc_person('contact', coalesce(NEW.contact_id, OLD.contact_id));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS activity_recalc_score ON public.activity_events;
CREATE TRIGGER activity_recalc_score AFTER INSERT OR UPDATE OR DELETE ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.desky_score_from_activity();

CREATE OR REPLACE FUNCTION public.desky_score_from_placement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.desky_recalc_person('candidate', coalesce(NEW.candidate_id, OLD.candidate_id));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS placements_recalc_score ON public.placements;
CREATE TRIGGER placements_recalc_score AFTER INSERT OR UPDATE OR DELETE ON public.placements
  FOR EACH ROW EXECUTE FUNCTION public.desky_score_from_placement();

-- 6. Seniority change signal
CREATE OR REPLACE FUNCTION public.desky_detect_seniority_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; sc integer; _company uuid;
BEGIN
  IF coalesce(NEW.job_title,'') = coalesce(OLD.job_title,'') THEN RETURN NEW; END IF;
  IF NOT public.desky_is_senior_title(NEW.job_title) OR public.desky_is_senior_title(OLD.job_title) THEN
    RETURN NEW;
  END IF;
  _owner := NEW.owner_user_id;
  IF _owner IS NULL THEN RETURN NEW; END IF;
  sc := coalesce(NEW.relationship_score, 0);
  IF TG_TABLE_NAME = 'contacts' THEN _company := NEW.client_id; ELSE _company := NULL; END IF;
  INSERT INTO signals (user_id, person_id, person_type, company_id, signal_type, previous_value, new_value,
                       relationship_score, opportunity_score, reason_for_recommendation, suggested_action, assigned_user)
  VALUES (_owner, NEW.id, CASE WHEN TG_TABLE_NAME = 'contacts' THEN 'contact' ELSE 'candidate' END, _company,
          'seniority_change', OLD.job_title, NEW.job_title, sc, least(100, round(sc * 1.2)),
          'Job title changed from ' || coalesce(OLD.job_title,'unknown') || ' to ' || NEW.job_title || ' — likely gained hiring authority.',
          'Worth reaching out — they may now be hiring or influence hiring decisions.', _owner);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS candidates_seniority_signal ON public.candidates;
CREATE TRIGGER candidates_seniority_signal AFTER UPDATE OF job_title ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.desky_detect_seniority_change();
DROP TRIGGER IF EXISTS contacts_seniority_signal ON public.contacts;
CREATE TRIGGER contacts_seniority_signal AFTER UPDATE OF job_title ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.desky_detect_seniority_change();

-- 7. Scan: refresh scores, monitoring flags, generate signals
CREATE OR REPLACE FUNCTION public.desky_signals_scan()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  st record; cutoff integer; pct_cut integer; created integer := 0; monitored_count integer := 0;
  r record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  INSERT INTO signal_score_settings (user_id) VALUES (_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO st FROM signal_score_settings WHERE user_id = _uid;

  FOR r IN SELECT id FROM candidates WHERE owner_user_id = _uid AND coalesce(gdpr_deleted,false) = false LOOP
    PERFORM public.desky_recalc_person('candidate', r.id);
  END LOOP;
  FOR r IN SELECT id FROM contacts WHERE owner_user_id = _uid AND coalesce(gdpr_deleted,false) = false LOOP
    PERFORM public.desky_recalc_person('contact', r.id);
  END LOOP;

  SELECT coalesce(percentile_disc(1 - (st.monitor_top_percent::numeric / 100))
           WITHIN GROUP (ORDER BY score), 0)::int INTO pct_cut
  FROM (
    SELECT relationship_score AS score FROM candidates WHERE owner_user_id = _uid AND relationship_score > 0
    UNION ALL
    SELECT relationship_score FROM contacts WHERE owner_user_id = _uid AND relationship_score > 0
  ) q;
  cutoff := greatest(coalesce(pct_cut, 0), st.monitor_min_score);

  UPDATE candidates SET monitored = (relationship_score >= cutoff AND relationship_score > 0)
   WHERE owner_user_id = _uid;
  UPDATE contacts SET monitored = (relationship_score >= cutoff AND relationship_score > 0)
   WHERE owner_user_id = _uid;
  SELECT (SELECT count(*) FROM candidates WHERE owner_user_id = _uid AND monitored)
       + (SELECT count(*) FROM contacts WHERE owner_user_id = _uid AND monitored) INTO monitored_count;

  FOR r IN
    SELECT 'candidate'::text AS ptype, c.id, c.relationship_score, NULL::uuid AS company,
           public.desky_last_touchpoint('candidate', c.id) AS last_tp
      FROM candidates c WHERE c.owner_user_id = _uid AND c.monitored
    UNION ALL
    SELECT 'contact', ct.id, ct.relationship_score, ct.client_id,
           public.desky_last_touchpoint('contact', ct.id)
      FROM contacts ct WHERE ct.owner_user_id = _uid AND ct.monitored
  LOOP
    IF r.last_tp > now() - (st.going_cold_days || ' days')::interval THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM signals s WHERE s.user_id = _uid AND s.person_id = r.id
        AND s.signal_type = 'going_cold' AND s.detected_at > r.last_tp
    ) THEN CONTINUE; END IF;
    INSERT INTO signals (user_id, person_id, person_type, company_id, signal_type, relationship_score,
                         opportunity_score, reason_for_recommendation, suggested_action, assigned_user)
    VALUES (_uid, r.id, r.ptype, r.company, 'going_cold', r.relationship_score,
            least(100, round(r.relationship_score * 1.3)),
            'Strong relationship — no contact for ' ||
              CASE WHEN r.last_tp = '-infinity'::timestamptz THEN 'ever'
                   ELSE extract(day FROM now() - r.last_tp)::int || ' days' END || '.',
            'Reach out — worth a check-in call.', _uid);
    created := created + 1;
  END LOOP;

  FOR r IN
    SELECT p.candidate_id AS id, p.client_id AS company, c.relationship_score,
           coalesce(p.start_date, p.offer_accepted_date) AS sd
      FROM placements p JOIN candidates c ON c.id = p.candidate_id
     WHERE p.owner_user_id = _uid AND coalesce(p.start_date, p.offer_accepted_date) IS NOT NULL
  LOOP
    IF (r.sd + (st.anniversary_months || ' months')::interval)::date
        BETWEEN current_date AND current_date + st.anniversary_lookahead_days THEN
      IF NOT EXISTS (
        SELECT 1 FROM signals s WHERE s.user_id = _uid AND s.person_id = r.id
          AND s.signal_type = 'placement_anniversary' AND s.detected_at > now() - interval '90 days'
      ) THEN
        INSERT INTO signals (user_id, person_id, person_type, company_id, signal_type, relationship_score,
                             opportunity_score, reason_for_recommendation, suggested_action, assigned_user)
        VALUES (_uid, r.id, 'candidate', r.company, 'placement_anniversary', coalesce(r.relationship_score,0),
                least(100, coalesce(r.relationship_score,0)),
                'Candidate placed ' || st.anniversary_months || ' months ago — anniversary approaching.',
                'Check in — strong moment for a referral ask or catch-up.', _uid);
        created := created + 1;
      END IF;
    END IF;
  END LOOP;

  FOR r IN
    SELECT 'candidate'::text AS ptype, id, relationship_score, NULL::uuid AS company, suggested_reengage_date AS d
      FROM candidates WHERE owner_user_id = _uid AND suggested_reengage_date IS NOT NULL
        AND suggested_reengage_date BETWEEN current_date - 7 AND current_date + 7
    UNION ALL
    SELECT 'contact', id, relationship_score, client_id, suggested_reengage_date
      FROM contacts WHERE owner_user_id = _uid AND suggested_reengage_date IS NOT NULL
        AND suggested_reengage_date BETWEEN current_date - 7 AND current_date + 7
  LOOP
    IF EXISTS (
      SELECT 1 FROM signals s WHERE s.user_id = _uid AND s.person_id = r.id
        AND s.signal_type = 'follow_up_due' AND s.new_value = r.d::text
    ) THEN CONTINUE; END IF;
    INSERT INTO signals (user_id, person_id, person_type, company_id, signal_type, new_value, relationship_score,
                         opportunity_score, reason_for_recommendation, suggested_action, assigned_user)
    VALUES (_uid, r.id, r.ptype, r.company, 'follow_up_due', r.d::text, coalesce(r.relationship_score,0),
            least(100, round(coalesce(r.relationship_score,0) * 1.4)),
            'They said to check back around ' || to_char(r.d, 'Mon YYYY') || ' — that time has come.',
            'Reach out now — timing matches what they told you.', _uid);
    created := created + 1;
  END LOOP;

  RETURN jsonb_build_object('monitored', monitored_count, 'created', created, 'cutoff', cutoff);
END;
$$;
GRANT EXECUTE ON FUNCTION public.desky_signals_scan() TO authenticated;