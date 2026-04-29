
CREATE OR REPLACE FUNCTION public.claim_team_invite(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.team_invites%ROWTYPE;
  v_user uuid := auth.uid();
  v_member_id uuid;
  v_display_name text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.team_invites WHERE code = _code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite code not found';
  END IF;
  IF v_invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already used';
  END IF;
  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite expired';
  END IF;
  IF v_invite.manager_user_id = v_user THEN
    RAISE EXCEPTION 'You cannot join your own team';
  END IF;

  -- Resolve a display name for the membership row
  SELECT COALESCE(rp.display_name, v_invite.name, 'Team member')
    INTO v_display_name
  FROM public.recruiter_profiles rp
  WHERE rp.user_id = v_user
  LIMIT 1;

  IF v_display_name IS NULL THEN
    v_display_name := COALESCE(v_invite.name, 'Team member');
  END IF;

  -- Create membership
  INSERT INTO public.team_members (manager_user_id, member_user_id, name, email, joined_date, active)
  VALUES (v_invite.manager_user_id, v_user, v_display_name, v_invite.email, now(), true)
  RETURNING id INTO v_member_id;

  -- Mark invite used
  UPDATE public.team_invites
  SET used_at = now(), used_by_user_id = v_user
  WHERE id = v_invite.id;

  -- Grant consultant role (idempotent)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user, 'consultant'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Grant manager role to inviter (idempotent)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_invite.manager_user_id, 'manager'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_team_invite(text) TO authenticated;
