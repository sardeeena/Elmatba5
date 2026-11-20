-- EL MATBA5 (المطبخ) — Phase 2A.1 Security & Reliability Hardening
-- Migration: 0002_phase_2a1_security_hardening.sql
-- Ordered corrective migration applied AFTER 0001_initial_schema.sql.
-- Preserves 0001 migration history and idempotently hardens:
--   1. Verified/confirmed email enforcement on accept_organization_invitation
--   2. Parent-project organization consistency on child-table UPDATE/DELETE RLS + immutability triggers
--   3. Atomic complete_onboarding_atomic RPC (org + owner + usage + project + markets + competitors + audits)
--   4. Transactional organization-creation limit policy with per-user advisory locking

-- ============================================================================
-- 1. ORGANIZATION-CREATION LIMIT POLICY HELPER
-- ============================================================================
-- NOTE: In 0001_initial_schema.sql, billing plans (`public.plans`) attach to
-- `organizations.plan_id` rather than user profiles, and `plans` does not yet
-- include a `max_organizations` column. Until Phase 6 introduces account-level
-- Paymob subscriptions, EL MATBA5 enforces a deliberate transactional safety
-- limit of 3 owned organizations per authenticated user.
CREATE OR REPLACE FUNCTION public.max_owned_organizations_default()
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT 3;
$$;

-- ============================================================================
-- 2. MARKET PROVIDER RESOLUTION HELPER (PostgreSQL Side)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_market_target_meta(
  p_country_code TEXT,
  p_language_code TEXT,
  p_search_engine_code TEXT
)
RETURNS TABLE (
  country_code TEXT,
  language_code TEXT,
  search_engine_code TEXT,
  assigned_provider TEXT,
  coverage_status TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cc TEXT := UPPER(TRIM(COALESCE(p_country_code, '')));
  v_lc TEXT := LOWER(TRIM(COALESCE(p_language_code, '')));
  v_engine TEXT := LOWER(TRIM(COALESCE(p_search_engine_code, '')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.code = v_cc) THEN
    RAISE EXCEPTION 'Invalid market country code: %', v_cc;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.languages l WHERE l.code = v_lc) THEN
    RAISE EXCEPTION 'Invalid market language code: %', v_lc;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.search_engines se WHERE se.code = v_engine) THEN
    RAISE EXCEPTION 'Invalid search engine code: %', v_engine;
  END IF;

  IF v_cc = 'RU' THEN
    IF v_engine = 'yandex' THEN
      RETURN QUERY SELECT v_cc, v_lc, v_engine, 'yandex_search_api + yandex_webmaster'::TEXT, 'partial'::TEXT;
      RETURN;
    ELSIF v_engine = 'google' THEN
      RETURN QUERY SELECT v_cc, v_lc, v_engine, 'gsc_first_party_only'::TEXT, 'first_party_only'::TEXT;
      RETURN;
    ELSE
      RETURN QUERY SELECT v_cc, v_lc, v_engine, 'bing_webmaster_first_party'::TEXT, 'first_party_only'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_engine = 'yandex' THEN
    RAISE EXCEPTION 'Invalid market configuration: Yandex SERP is not supported for country % (select Google or Bing, or target RU for Yandex).', v_cc;
  END IF;

  IF v_engine = 'bing' THEN
    RETURN QUERY SELECT v_cc, v_lc, v_engine, 'bing_webmaster_api'::TEXT, 'first_party_only'::TEXT;
    RETURN;
  END IF;

  IF v_cc = ANY(ARRAY['EG', 'SA', 'AE', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'US']) THEN
    RETURN QUERY SELECT v_cc, v_lc, 'google'::TEXT, 'dataforseo + google_search_console'::TEXT, 'supported'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_cc, v_lc, 'google'::TEXT, 'google_search_console'::TEXT, 'first_party_only'::TEXT;
END;
$$;

-- ============================================================================
-- 3. TASK 1 — INVITATION ACCEPTANCE WITH CONFIRMED-EMAIL ENFORCEMENT
-- ============================================================================
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

  -- Trusted server-side lookup from auth.users (never trust client-supplied email/id)
  SELECT
    LOWER(TRIM(COALESCE(u.email, ''))),
    COALESCE(u.email_confirmed_at, u.confirmed_at),
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

-- ============================================================================
-- 4. TASK 4 — HARDENED create_organization_atomic WITH TRANSACTIONAL LIMIT & LOCK
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_organization_atomic(
  p_name TEXT,
  p_slug TEXT,
  p_business_type TEXT,
  p_billing_country_code TEXT DEFAULT 'EG'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_user_name TEXT;
  v_user_locale TEXT;
  v_org public.organizations%ROWTYPE;
  v_period TEXT;
  v_owned_count INTEGER;
  v_max_orgs INTEGER := public.max_owned_organizations_default();
  v_clean_name TEXT := TRIM(COALESCE(p_name, ''));
  v_clean_slug TEXT := TRIM(COALESCE(p_slug, ''));
  v_clean_country TEXT := UPPER(TRIM(COALESCE(p_billing_country_code, 'EG')));
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF LENGTH(v_clean_name) < 2 OR LENGTH(v_clean_name) > 80 THEN
    RAISE EXCEPTION 'Organization name must be between 2 and 80 characters';
  END IF;

  IF LENGTH(v_clean_slug) < 2 THEN
    RAISE EXCEPTION 'Organization slug is invalid';
  END IF;

  IF p_business_type NOT IN ('agency', 'consultant', 'business', 'ecommerce', 'other') THEN
    RAISE EXCEPTION 'Invalid business type';
  END IF;

  IF v_clean_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Invalid billing country code';
  END IF;

  -- Serialize organization creation per user within the transaction
  PERFORM pg_advisory_xact_lock(hashtext('org_create:' || v_user_id::TEXT));

  SELECT COUNT(*)
  INTO v_owned_count
  FROM public.organization_members om
  WHERE om.user_id = v_user_id
    AND om.role = 'owner';

  IF v_owned_count >= v_max_orgs THEN
    RAISE EXCEPTION 'Organization creation limit reached: maximum % owned organizations allowed per account under current plan policy', v_max_orgs;
  END IF;

  SELECT
    LOWER(TRIM(COALESCE(u.email, ''))),
    COALESCE(u.raw_user_meta_data->>'full_name', ''),
    CASE WHEN u.raw_user_meta_data->>'preferred_locale' = 'ar' THEN 'ar' ELSE 'en' END
  INTO v_user_email, v_user_name, v_user_locale
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user record not found';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, preferred_locale)
  VALUES (v_user_id, v_user_email, v_user_name, v_user_locale)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (
    name,
    slug,
    business_type,
    billing_country_code,
    plan_id,
    subscription_status,
    created_by
  )
  VALUES (
    v_clean_name,
    v_clean_slug,
    p_business_type,
    v_clean_country,
    'starter',
    'trialing',
    v_user_id
  )
  RETURNING * INTO v_org;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org.id, v_user_id, 'owner');

  v_period := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM');
  INSERT INTO public.usage_records (organization_id, period_ym)
  VALUES (v_org.id, v_period)
  ON CONFLICT (organization_id, period_ym) DO NOTHING;

  INSERT INTO public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    v_org.id,
    v_user_id,
    'organization.created',
    'organization',
    v_org.id::TEXT,
    jsonb_build_object('name', v_org.name, 'businessType', v_org.business_type)
  );

  RETURN jsonb_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'slug', v_org.slug,
    'businessType', v_org.business_type,
    'billingCountryCode', v_org.billing_country_code,
    'planId', v_org.plan_id,
    'subscriptionStatus', v_org.subscription_status,
    'role', 'owner',
    'createdAt', v_org.created_at
  );
END;
$$;

-- ============================================================================
-- 5. TASK 3 — ATOMIC ONBOARDING RPC (SINGLE TRANSACTION)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_onboarding_atomic(
  p_org_name TEXT,
  p_org_slug TEXT,
  p_business_type TEXT,
  p_billing_country_code TEXT DEFAULT 'EG',
  p_project_name TEXT DEFAULT '',
  p_website_url TEXT DEFAULT '',
  p_business_description TEXT DEFAULT '',
  p_industry TEXT DEFAULT '',
  p_target_audience TEXT DEFAULT '',
  p_primary_country_code TEXT DEFAULT 'EG',
  p_business_goals TEXT DEFAULT '',
  p_market_targets JSONB DEFAULT '[]'::jsonb,
  p_competitors JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_user_name TEXT;
  v_user_locale TEXT;
  v_has_existing_org BOOLEAN;
  v_owned_count INTEGER;
  v_max_orgs INTEGER := public.max_owned_organizations_default();
  v_org public.organizations%ROWTYPE;
  v_proj public.projects%ROWTYPE;
  v_period TEXT;
  v_clean_org_name TEXT := TRIM(COALESCE(p_org_name, ''));
  v_clean_org_slug TEXT := TRIM(COALESCE(p_org_slug, ''));
  v_clean_billing_cc TEXT := UPPER(TRIM(COALESCE(p_billing_country_code, 'EG')));
  v_clean_proj_name TEXT := TRIM(COALESCE(p_project_name, ''));
  v_clean_url TEXT := TRIM(COALESCE(p_website_url, ''));
  v_clean_primary_cc TEXT := UPPER(TRIM(COALESCE(p_primary_country_code, 'EG')));
  v_target_elem JSONB;
  v_resolved RECORD;
  v_device TEXT;
  v_inserted_target public.project_market_targets%ROWTYPE;
  v_targets_json JSONB := '[]'::jsonb;
  v_comp_elem JSONB;
  v_comp_domain TEXT;
  v_comp_label TEXT;
  v_inserted_comp public.project_competitors%ROWTYPE;
  v_competitors_json JSONB := '[]'::jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Serialize onboarding & org creation per user
  PERFORM pg_advisory_xact_lock(hashtext('org_create:' || v_user_id::TEXT));

  -- Prevent duplicate initial onboarding when user already belongs to an organization
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om WHERE om.user_id = v_user_id
  ) INTO v_has_existing_org;

  IF v_has_existing_org THEN
    RAISE EXCEPTION 'Initial onboarding has already been completed for this account';
  END IF;

  SELECT COUNT(*)
  INTO v_owned_count
  FROM public.organization_members om
  WHERE om.user_id = v_user_id
    AND om.role = 'owner';

  IF v_owned_count >= v_max_orgs THEN
    RAISE EXCEPTION 'Organization creation limit reached: maximum % owned organizations allowed per account under current plan policy', v_max_orgs;
  END IF;

  -- Validate organization fields
  IF LENGTH(v_clean_org_name) < 2 OR LENGTH(v_clean_org_name) > 80 THEN
    RAISE EXCEPTION 'Organization name must be between 2 and 80 characters';
  END IF;

  IF LENGTH(v_clean_org_slug) < 2 THEN
    RAISE EXCEPTION 'Organization slug is invalid';
  END IF;

  IF p_business_type NOT IN ('agency', 'consultant', 'business', 'ecommerce', 'other') THEN
    RAISE EXCEPTION 'Invalid business type';
  END IF;

  IF v_clean_billing_cc !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Invalid billing country code';
  END IF;

  -- Validate project fields
  IF LENGTH(v_clean_proj_name) < 2 OR LENGTH(v_clean_proj_name) > 100 THEN
    RAISE EXCEPTION 'Project name must be between 2 and 100 characters';
  END IF;

  IF v_clean_url !~* '^https?://[A-Za-z0-9.-]+(\.[A-Za-z]{2,}|:[0-9]+)(/[^[:space:]]*)?$' THEN
    RAISE EXCEPTION 'Project website URL must use http or https with a valid hostname';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.code = v_clean_primary_cc) THEN
    RAISE EXCEPTION 'Invalid primary country code: %', v_clean_primary_cc;
  END IF;

  IF p_market_targets IS NULL
     OR jsonb_typeof(p_market_targets) <> 'array'
     OR jsonb_array_length(p_market_targets) = 0 THEN
    RAISE EXCEPTION 'At least one target market configuration is required for onboarding';
  END IF;

  IF jsonb_array_length(p_market_targets) > 50 THEN
    RAISE EXCEPTION 'Too many target markets in onboarding payload';
  END IF;

  IF p_competitors IS NOT NULL THEN
    IF jsonb_typeof(p_competitors) <> 'array' THEN
      RAISE EXCEPTION 'Competitors payload must be an array';
    END IF;
    IF jsonb_array_length(p_competitors) > 20 THEN
      RAISE EXCEPTION 'Maximum 20 competitors allowed during onboarding';
    END IF;
  END IF;

  -- Resolve caller profile info from auth.users
  SELECT
    LOWER(TRIM(COALESCE(u.email, ''))),
    COALESCE(u.raw_user_meta_data->>'full_name', ''),
    CASE WHEN u.raw_user_meta_data->>'preferred_locale' = 'ar' THEN 'ar' ELSE 'en' END
  INTO v_user_email, v_user_name, v_user_locale
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user record not found';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, preferred_locale)
  VALUES (v_user_id, v_user_email, v_user_name, v_user_locale)
  ON CONFLICT (id) DO NOTHING;

  -- Create organization
  INSERT INTO public.organizations (
    name,
    slug,
    business_type,
    billing_country_code,
    plan_id,
    subscription_status,
    created_by
  )
  VALUES (
    v_clean_org_name,
    v_clean_org_slug,
    p_business_type,
    v_clean_billing_cc,
    'starter',
    'trialing',
    v_user_id
  )
  RETURNING * INTO v_org;

  -- Bind caller as owner
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org.id, v_user_id, 'owner');

  -- Initialize monthly usage record
  v_period := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM');
  INSERT INTO public.usage_records (organization_id, period_ym)
  VALUES (v_org.id, v_period)
  ON CONFLICT (organization_id, period_ym) DO NOTHING;

  -- Create initial project
  INSERT INTO public.projects (
    organization_id,
    name,
    website_url,
    business_description,
    industry,
    target_audience,
    primary_country_code,
    business_goals,
    created_by
  )
  VALUES (
    v_org.id,
    v_clean_proj_name,
    v_clean_url,
    TRIM(COALESCE(p_business_description, '')),
    TRIM(COALESCE(p_industry, '')),
    TRIM(COALESCE(p_target_audience, '')),
    v_clean_primary_cc,
    TRIM(COALESCE(p_business_goals, '')),
    v_user_id
  )
  RETURNING * INTO v_proj;

  -- Validate and insert market targets
  FOR v_target_elem IN SELECT * FROM jsonb_array_elements(p_market_targets)
  LOOP
    v_device := LOWER(TRIM(COALESCE(v_target_elem->>'device', 'both')));
    IF v_device NOT IN ('desktop', 'mobile', 'both') THEN
      RAISE EXCEPTION 'Invalid market target device: %', v_device;
    END IF;

    SELECT *
    INTO v_resolved
    FROM public.resolve_market_target_meta(
      v_target_elem->>'countryCode',
      v_target_elem->>'languageCode',
      v_target_elem->>'searchEngineCode'
    );

    INSERT INTO public.project_market_targets (
      organization_id,
      project_id,
      country_code,
      language_code,
      search_engine_code,
      device,
      assigned_provider,
      coverage_status,
      is_active
    )
    VALUES (
      v_org.id,
      v_proj.id,
      v_resolved.country_code,
      v_resolved.language_code,
      v_resolved.search_engine_code,
      v_device,
      v_resolved.assigned_provider,
      v_resolved.coverage_status,
      TRUE
    )
    RETURNING * INTO v_inserted_target;

    v_targets_json := v_targets_json || jsonb_build_array(
      jsonb_build_object(
        'id', v_inserted_target.id,
        'projectId', v_inserted_target.project_id,
        'countryCode', v_inserted_target.country_code,
        'languageCode', v_inserted_target.language_code,
        'searchEngineCode', v_inserted_target.search_engine_code,
        'device', v_inserted_target.device,
        'assignedProvider', v_inserted_target.assigned_provider,
        'coverageStatus', v_inserted_target.coverage_status,
        'isActive', v_inserted_target.is_active,
        'createdAt', v_inserted_target.created_at
      )
    );
  END LOOP;

  -- Validate and insert optional competitors
  IF p_competitors IS NOT NULL THEN
    FOR v_comp_elem IN SELECT * FROM jsonb_array_elements(p_competitors)
    LOOP
      v_comp_domain := LOWER(TRIM(COALESCE(v_comp_elem->>'domain', '')));
      IF v_comp_domain = '' THEN
        CONTINUE;
      END IF;
      v_comp_domain := regexp_replace(v_comp_domain, '^https?://', '');
      v_comp_domain := regexp_replace(v_comp_domain, '^www\.', '');
      v_comp_domain := split_part(v_comp_domain, '/', 1);

      IF v_comp_domain !~ '^[^/[:space:]]+\.[^/[:space:]]{2,}$' THEN
        RAISE EXCEPTION 'Invalid competitor domain: %', COALESCE(v_comp_elem->>'domain', '');
      END IF;

      v_comp_label := LEFT(TRIM(COALESCE(v_comp_elem->>'label', '')), 80);

      INSERT INTO public.project_competitors (
        organization_id,
        project_id,
        domain,
        label
      )
      VALUES (
        v_org.id,
        v_proj.id,
        v_comp_domain,
        v_comp_label
      )
      ON CONFLICT (project_id, domain) DO NOTHING
      RETURNING * INTO v_inserted_comp;

      IF FOUND THEN
        v_competitors_json := v_competitors_json || jsonb_build_array(
          jsonb_build_object(
            'id', v_inserted_comp.id,
            'projectId', v_inserted_comp.project_id,
            'domain', v_inserted_comp.domain,
            'label', v_inserted_comp.label,
            'createdAt', v_inserted_comp.created_at
          )
        );
      END IF;
    END LOOP;
  END IF;

  -- Record onboarding audit events atomically
  INSERT INTO public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES
    (
      v_org.id,
      v_user_id,
      'organization.created',
      'organization',
      v_org.id::TEXT,
      jsonb_build_object('name', v_org.name, 'businessType', v_org.business_type, 'source', 'onboarding')
    ),
    (
      v_org.id,
      v_user_id,
      'project.created',
      'project',
      v_proj.id::TEXT,
      jsonb_build_object('name', v_proj.name, 'targets', jsonb_array_length(v_targets_json), 'source', 'onboarding')
    );

  RETURN jsonb_build_object(
    'organization', jsonb_build_object(
      'id', v_org.id,
      'name', v_org.name,
      'slug', v_org.slug,
      'businessType', v_org.business_type,
      'billingCountryCode', v_org.billing_country_code,
      'planId', v_org.plan_id,
      'subscriptionStatus', v_org.subscription_status,
      'role', 'owner',
      'createdAt', v_org.created_at
    ),
    'project', jsonb_build_object(
      'id', v_proj.id,
      'organizationId', v_proj.organization_id,
      'name', v_proj.name,
      'websiteUrl', v_proj.website_url,
      'businessDescription', v_proj.business_description,
      'industry', v_proj.industry,
      'targetAudience', v_proj.target_audience,
      'primaryCountryCode', v_proj.primary_country_code,
      'businessGoals', v_proj.business_goals,
      'createdAt', v_proj.created_at,
      'updatedAt', v_proj.updated_at,
      'marketTargets', v_targets_json,
      'competitors', v_competitors_json
    )
  );
END;
$$;

-- Restrict RPC EXECUTE privileges strictly to authenticated users
REVOKE ALL ON FUNCTION public.max_owned_organizations_default() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.max_owned_organizations_default() TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_market_target_meta(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_market_target_meta(TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.create_organization_atomic(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_atomic(TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_onboarding_atomic(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_atomic(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) TO authenticated;

-- ============================================================================
-- 6. TASK 2 — CHILD-TABLE UPDATE/DELETE RLS & CROSS-TENANT IMMUTABILITY TRIGGERS
-- ============================================================================

-- Prevent cross-organization row migration even when an actor has memberships in multiple orgs
CREATE OR REPLACE FUNCTION public.prevent_cross_org_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Changing organization_id on an existing tenant record is forbidden';
  END IF;

  IF TG_TABLE_NAME IN ('project_market_targets', 'project_competitors') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = NEW.project_id
        AND p.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'Referenced project does not belong to this organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_immutable_org ON public.projects;
CREATE TRIGGER trg_projects_immutable_org
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cross_org_reassignment();

DROP TRIGGER IF EXISTS trg_market_targets_immutable_org ON public.project_market_targets;
CREATE TRIGGER trg_market_targets_immutable_org
  BEFORE UPDATE ON public.project_market_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cross_org_reassignment();

DROP TRIGGER IF EXISTS trg_competitors_immutable_org ON public.project_competitors;
CREATE TRIGGER trg_competitors_immutable_org
  BEFORE UPDATE ON public.project_competitors
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cross_org_reassignment();

-- Re-create project_market_targets policies to enforce parent project org match on UPDATE & DELETE
DROP POLICY IF EXISTS market_targets_update_analyst ON public.project_market_targets;
CREATE POLICY market_targets_update_analyst ON public.project_market_targets
  FOR UPDATE TO authenticated
  USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst'])
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.organization_id = project_market_targets.organization_id
    )
  )
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst'])
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.organization_id = project_market_targets.organization_id
    )
  );

DROP POLICY IF EXISTS market_targets_delete_admin ON public.project_market_targets;
CREATE POLICY market_targets_delete_admin ON public.project_market_targets
  FOR DELETE TO authenticated
  USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin'])
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.organization_id = project_market_targets.organization_id
    )
  );

-- Re-create project_competitors policies to enforce parent project org match on UPDATE & DELETE
DROP POLICY IF EXISTS competitors_update_analyst ON public.project_competitors;
CREATE POLICY competitors_update_analyst ON public.project_competitors
  FOR UPDATE TO authenticated
  USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst'])
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.organization_id = project_competitors.organization_id
    )
  )
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst'])
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.organization_id = project_competitors.organization_id
    )
  );

DROP POLICY IF EXISTS competitors_delete_admin ON public.project_competitors;
CREATE POLICY competitors_delete_admin ON public.project_competitors
  FOR DELETE TO authenticated
  USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin'])
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.organization_id = project_competitors.organization_id
    )
  );
