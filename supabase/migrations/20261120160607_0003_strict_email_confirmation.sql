-- EL MATBA5 (المطبخ) — Phase 2A.1.1 Strict Email Confirmation Hardening
-- Migration: 0003_strict_email_confirmation.sql
-- Ordered corrective migration applied AFTER:
--   0001_initial_schema.sql
--   0002_phase_2a1_security_hardening.sql
--
-- Purpose:
--   Require `auth.users.email_confirmed_at IS NOT NULL` strictly before allowing
--   organization invitation acceptance. Do NOT substitute `confirmed_at` (which in
--   Supabase Auth can reflect non-email confirmation channels such as phone auth).

CREATE OR REPLACE FUNCTION public.phase_2a1_1_strict_email_confirmation_ready()
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_raw_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_email_confirmed_at TIMESTAMPTZ;
  v_user_name TEXT;
  v_user_locale TEXT;
  v_token_hash TEXT;
  v_inv public.organization_invitations%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_max_members INTEGER;
  v_current_members INTEGER;
  v_already_member BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to accept invitation';
  END IF;

  IF p_raw_token IS NULL OR LENGTH(TRIM(p_raw_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;

  -- Authoritative server-side lookup from auth.users.
  -- Strictly require `u.email_confirmed_at` (never fall back to `u.confirmed_at`).
  SELECT
    LOWER(TRIM(COALESCE(u.email, ''))),
    u.email_confirmed_at,
    COALESCE(u.raw_user_meta_data->>'full_name', ''),
    CASE WHEN u.raw_user_meta_data->>'preferred_locale' = 'ar' THEN 'ar' ELSE 'en' END
  INTO v_user_email, v_email_confirmed_at, v_user_name, v_user_locale
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF NOT FOUND OR v_user_email = '' THEN
    RAISE EXCEPTION 'Authenticated account must have a valid email address';
  END IF;

  IF v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Email address must be confirmed before accepting an invitation';
  END IF;

  v_token_hash := encode(digest(TRIM(p_raw_token), 'sha256'), 'hex');

  SELECT *
  INTO v_inv
  FROM public.organization_invitations
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or invalid';
  END IF;

  IF v_inv.status = 'accepted' THEN
    RAISE EXCEPTION 'This invitation has already been accepted';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'This invitation is no longer active';
  END IF;

  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'This invitation has expired';
  END IF;

  IF LOWER(TRIM(v_inv.email)) <> v_user_email THEN
    RAISE EXCEPTION 'This invitation was issued for a different email address';
  END IF;

  -- Lock parent organization row to serialize concurrent team member quota checks
  SELECT *
  INTO v_org
  FROM public.organizations
  WHERE id = v_inv.organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_inv.organization_id AND user_id = v_user_id
  ) INTO v_already_member;

  IF NOT v_already_member THEN
    SELECT p.max_team_members INTO v_max_members
    FROM public.plans p
    WHERE p.id = v_org.plan_id;

    SELECT COUNT(*) INTO v_current_members
    FROM public.organization_members
    WHERE organization_id = v_inv.organization_id;

    IF v_max_members IS NOT NULL AND v_current_members >= v_max_members THEN
      RAISE EXCEPTION 'Organization team member quota reached';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, preferred_locale)
  VALUES (v_user_id, v_user_email, v_user_name, v_user_locale)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_inv.organization_id, v_user_id, v_inv.role)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  UPDATE public.organization_invitations
  SET status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = NOW()
  WHERE id = v_inv.id;

  INSERT INTO public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    v_inv.organization_id,
    v_user_id,
    'invitation.accepted',
    'organization_invitation',
    v_inv.id::TEXT,
    jsonb_build_object('email', v_user_email, 'role', v_inv.role)
  );

  RETURN jsonb_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'slug', v_org.slug,
    'businessType', v_org.business_type,
    'billingCountryCode', v_org.billing_country_code,
    'planId', v_org.plan_id,
    'subscriptionStatus', v_org.subscription_status,
    'role', v_inv.role,
    'createdAt', v_org.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.phase_2a1_1_strict_email_confirmation_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phase_2a1_1_strict_email_confirmation_ready() TO authenticated;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(TEXT) TO authenticated;
