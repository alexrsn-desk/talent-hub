REVOKE ALL ON FUNCTION public.desky_relationship_score(text, uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.desky_last_touchpoint(text, uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.desky_recalc_person(text, uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.desky_score_from_note() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.desky_score_from_activity() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.desky_score_from_placement() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.desky_detect_seniority_change() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.desky_signals_scan() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.desky_signals_scan() TO authenticated;