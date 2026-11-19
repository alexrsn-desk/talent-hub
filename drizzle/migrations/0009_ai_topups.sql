CREATE TABLE public.ai_topup_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL UNIQUE,
  credits integer NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_topup_purchases TO authenticated;
GRANT ALL ON public.ai_topup_purchases TO service_role;
ALTER TABLE public.ai_topup_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency members view topups" ON public.ai_topup_purchases FOR SELECT TO authenticated USING (agency_id = public.current_agency_id());

CREATE OR REPLACE FUNCTION public.consume_ai_credit(_user uuid, _amount integer DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.agencies%ROWTYPE; _allow integer;
BEGIN
  SELECT ag.* INTO a FROM public.agencies ag JOIN public.agency_members m ON m.agency_id = ag.id WHERE m.user_id = _user FOR UPDATE OF ag;
  IF NOT FOUND THEN RETURN true; END IF;
  _allow := a.monthly_ai_credits * a.seats;
  IF a.credits_reset_at <= now() THEN
    a.bonus_ai_credits := GREATEST(0, a.bonus_ai_credits - GREATEST(0, a.used_ai_credits - _allow));
    a.used_ai_credits := 0;
    UPDATE public.agencies SET used_ai_credits = 0, bonus_ai_credits = a.bonus_ai_credits,
      credits_reset_at = date_trunc('month', now()) + interval '1 month' WHERE id = a.id;
  END IF;
  IF a.used_ai_credits + _amount > _allow + a.bonus_ai_credits THEN RETURN false; END IF;
  UPDATE public.agencies SET used_ai_credits = used_ai_credits + _amount WHERE id = a.id;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.consume_ai_credit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid, integer) TO service_role;