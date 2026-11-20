-- EL MATBA5 (المطبخ) — Production PostgreSQL Schema (Supabase Auth + RLS)
-- Migration: 0001_initial_schema.sql
-- Multi-tenant architecture with organization_id isolation, Supabase Auth linkage,
-- non-recursive Row Level Security (RLS), and atomic SECURITY DEFINER RPCs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES & TENANCY
-- ============================================================================

-- Profiles extend Supabase Auth's auth.users (never store passwords in application tables)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  preferred_locale TEXT NOT NULL DEFAULT 'en' CHECK (preferred_locale IN ('en', 'ar')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plans (
  id TEXT PRIMARY KEY, -- 'starter', 'pro', 'agency'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_egp_monthly INTEGER NOT NULL,
  price_usd_monthly INTEGER NOT NULL,
  max_projects INTEGER NOT NULL,
  max_keywords INTEGER NOT NULL,
  max_crawls_monthly INTEGER NOT NULL,
  max_geo_runs_monthly INTEGER NOT NULL,
  max_ai_credits_monthly INTEGER NOT NULL,
  max_team_members INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL CHECK (business_type IN ('agency', 'consultant', 'business', 'ecommerce', 'other')),
  billing_country_code TEXT NOT NULL DEFAULT 'EG',
  plan_id TEXT NOT NULL REFERENCES plans(id) DEFAULT 'starter',
  subscription_status TEXT NOT NULL DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'analyst', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. GLOBAL MARKETS & PROVIDER COVERAGE REGISTRY (Public Reference Tables)
-- ============================================================================

CREATE TABLE countries (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  region TEXT NOT NULL,
  default_language_code TEXT NOT NULL
);

CREATE TABLE languages (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_native TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl'))
);

CREATE TABLE search_engines (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE provider_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT NOT NULL,
  country_code TEXT NOT NULL REFERENCES countries(code),
  search_engine_code TEXT NOT NULL REFERENCES search_engines(code),
  supports_serp BOOLEAN NOT NULL DEFAULT FALSE,
  supports_keyword_volume BOOLEAN NOT NULL DEFAULT FALSE,
  supports_first_party BOOLEAN NOT NULL DEFAULT FALSE,
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('supported', 'partial', 'first_party_only', 'unsupported')),
  notes TEXT NOT NULL,
  UNIQUE (provider_code, country_code, search_engine_code)
);

-- ============================================================================
-- 3. PROJECTS & MULTI-MARKET TARGETS
-- ============================================================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  business_description TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  primary_country_code TEXT NOT NULL REFERENCES countries(code),
  business_goals TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_market_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL REFERENCES countries(code),
  language_code TEXT NOT NULL REFERENCES languages(code),
  search_engine_code TEXT NOT NULL REFERENCES search_engines(code),
  device TEXT NOT NULL DEFAULT 'both' CHECK (device IN ('desktop', 'mobile', 'both')),
  assigned_provider TEXT NOT NULL,
  coverage_status TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, country_code, language_code, search_engine_code)
);

CREATE TABLE project_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, domain)
);

-- ============================================================================
-- 4. COMMERCIAL USAGE & PUBLIC LEADS
-- ============================================================================

CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_ym TEXT NOT NULL,
  keywords_tracked INTEGER NOT NULL DEFAULT 0,
  crawls_run INTEGER NOT NULL DEFAULT 0,
  geo_runs INTEGER NOT NULL DEFAULT 0,
  ai_credits_used INTEGER NOT NULL DEFAULT 0,
  reports_generated INTEGER NOT NULL DEFAULT 0,
  UNIQUE (organization_id, period_ym)
);

CREATE TABLE contact_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT 'EG',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_invitations_org ON organization_invitations(organization_id);
CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_market_targets_org_proj ON project_market_targets(organization_id, project_id);
CREATE INDEX idx_competitors_org_proj ON project_competitors(organization_id, project_id);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);

-- ============================================================================
-- 6. SECURITY DEFINER HELPERS (Prevent Recursive RLS on organization_members)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(p_org_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.role = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members mine
      JOIN public.organization_members theirs
        ON mine.organization_id = theirs.organization_id
      WHERE mine.user_id = auth.uid()
        AND theirs.user_id = p_profile_id
    );
$$;

-- Automatically sync a profile row whenever a Supabase Auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, preferred_locale)
  VALUES (
    NEW.id,
    LOWER(COALESCE(NEW.email, '')),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'preferred_locale' = 'ar' THEN 'ar'
      ELSE 'en'
    END
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 7. ATOMIC TENANT BOOTSTRAP & INVITATION RPCs
-- ============================================================================

-- Atomically creates an organization, binds the caller as 'owner', initializes
-- the current month's usage_records row, and records an audit log entry.
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    LOWER(COALESCE(u.email, '')),
    COALESCE(u.raw_user_meta_data->>'full_name', ''),
    CASE WHEN u.raw_user_meta_data->>'preferred_locale' = 'ar' THEN 'ar' ELSE 'en' END
  INTO v_user_email, v_user_name, v_user_locale
  FROM auth.users u
  WHERE u.id = v_user_id;

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
    TRIM(p_name),
    TRIM(p_slug),
    p_business_type,
    UPPER(TRIM(p_billing_country_code)),
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

-- Atomically verifies and accepts an organization invitation using a single-use
-- SHA-256 hashed token, checking expiry and matching authenticated email.
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_raw_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
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

  SELECT
    LOWER(COALESCE(u.email, '')),
    COALESCE(u.raw_user_meta_data->>'full_name', ''),
    CASE WHEN u.raw_user_meta_data->>'preferred_locale' = 'ar' THEN 'ar' ELSE 'en' END
  INTO v_user_email, v_user_name, v_user_locale
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_user_email = '' THEN
    RAISE EXCEPTION 'Authenticated account must have a verified email address';
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

  SELECT * INTO v_org FROM public.organizations WHERE id = v_inv.organization_id;
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

-- Restrict RPC execution to authenticated users only
REVOKE ALL ON FUNCTION public.create_organization_atomic(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_atomic(TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(TEXT) TO authenticated;

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ============================================================================

-- Enable RLS across every table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_engines ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_market_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_leads ENABLE ROW LEVEL SECURITY;

-- Reference Tables: Read-only to anon & authenticated clients; no client writes allowed.
CREATE POLICY plans_public_read ON plans
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY countries_public_read ON countries
  FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY languages_public_read ON languages
  FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY search_engines_public_read ON search_engines
  FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY provider_coverage_public_read ON provider_coverage
  FOR SELECT TO anon, authenticated
  USING (TRUE);

-- Profiles: Users can view their own profile and teammates in shared orgs; only update/insert own profile.
CREATE POLICY profiles_select_member ON profiles
  FOR SELECT TO authenticated
  USING (public.can_view_profile(id));

CREATE POLICY profiles_insert_self ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_self ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Organizations: Members can read; owner/admin can update; creation occurs via create_organization_atomic RPC.
CREATE POLICY organizations_select_member ON organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id));

CREATE POLICY organizations_update_admin ON organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(id, ARRAY['owner', 'admin']));

-- Organization Members: Members can list org teammates; membership mutations occur only via atomic RPCs.
CREATE POLICY org_members_select_member ON organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- Organization Invitations: Owner/Admin can list, issue, and revoke invitations within their organization.
CREATE POLICY org_invitations_select_admin ON organization_invitations
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY org_invitations_insert_admin ON organization_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner', 'admin'])
    AND invited_by = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY org_invitations_update_admin ON organization_invitations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Audit Logs: Members can read; members can append entries attributed to themselves; no updates/deletes.
CREATE POLICY audit_logs_select_member ON audit_logs
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY audit_logs_insert_member ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (actor_user_id IS NULL OR actor_user_id = auth.uid())
  );

-- Projects: Members read; owner/admin/analyst create & update; owner/admin delete.
CREATE POLICY projects_select_member ON projects
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY projects_insert_analyst ON projects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst'])
    AND created_by = auth.uid()
  );

CREATE POLICY projects_update_analyst ON projects
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst']));

CREATE POLICY projects_delete_admin ON projects
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Project Market Targets: Strictly scoped to org membership + matching parent project organization.
CREATE POLICY market_targets_select_member ON project_market_targets
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY market_targets_insert_analyst ON project_market_targets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst'])
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.organization_id = project_market_targets.organization_id
    )
  );

CREATE POLICY market_targets_update_analyst ON project_market_targets
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst']));

CREATE POLICY market_targets_delete_admin ON project_market_targets
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Project Competitors: Strictly scoped to org membership + matching parent project organization.
CREATE POLICY competitors_select_member ON project_competitors
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY competitors_insert_analyst ON project_competitors
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst'])
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.organization_id = project_competitors.organization_id
    )
  );

CREATE POLICY competitors_update_analyst ON project_competitors
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst']));

CREATE POLICY competitors_delete_admin ON project_competitors
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Usage Records: Members read; owner/admin/analyst initialize monthly record.
CREATE POLICY usage_records_select_member ON usage_records
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY usage_records_insert_analyst ON usage_records
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst']));

CREATE POLICY usage_records_update_analyst ON usage_records
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst']));

-- Contact Leads: Public insert-only capture; zero read/update/delete access from client roles.
CREATE POLICY contact_leads_public_insert ON contact_leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (TRUE);

-- ============================================================================
-- 9. REFERENCE REGISTRY SEED DATA (Idempotent, No Fake Customer Data)
-- ============================================================================

INSERT INTO countries (code, name_en, name_ar, region, default_language_code) VALUES
  ('EG', 'Egypt', 'مصر', 'MENA', 'ar'),
  ('SA', 'Saudi Arabia', 'المملكة العربية السعودية', 'MENA', 'ar'),
  ('AE', 'United Arab Emirates', 'الإمارات العربية المتحدة', 'MENA', 'ar'),
  ('GB', 'United Kingdom', 'المملكة المتحدة', 'Europe', 'en'),
  ('DE', 'Germany', 'ألمانيا', 'Europe', 'de'),
  ('FR', 'France', 'فرنسا', 'Europe', 'fr'),
  ('ES', 'Spain', 'إسبانيا', 'Europe', 'es'),
  ('IT', 'Italy', 'إيطاليا', 'Europe', 'it'),
  ('NL', 'Netherlands', 'هولندا', 'Europe', 'nl'),
  ('PL', 'Poland', 'بولندا', 'Europe', 'pl'),
  ('RU', 'Russia', 'روسيا', 'Eurasia', 'ru')
ON CONFLICT (code) DO NOTHING;

INSERT INTO languages (code, name_en, name_native, direction) VALUES
  ('ar', 'Arabic', 'العربية', 'rtl'),
  ('en', 'English', 'English', 'ltr'),
  ('de', 'German', 'Deutsch', 'ltr'),
  ('fr', 'French', 'Français', 'ltr'),
  ('es', 'Spanish', 'Español', 'ltr'),
  ('it', 'Italian', 'Italiano', 'ltr'),
  ('nl', 'Dutch', 'Nederlands', 'ltr'),
  ('pl', 'Polish', 'Polski', 'ltr'),
  ('ru', 'Russian', 'Русский', 'ltr')
ON CONFLICT (code) DO NOTHING;

INSERT INTO search_engines (code, name) VALUES
  ('google', 'Google'),
  ('yandex', 'Yandex'),
  ('bing', 'Bing')
ON CONFLICT (code) DO NOTHING;

INSERT INTO provider_coverage (
  provider_code, country_code, search_engine_code,
  supports_serp, supports_keyword_volume, supports_first_party,
  coverage_status, notes
) VALUES
  ('dataforseo', 'EG', 'google', TRUE, TRUE, FALSE, 'supported', 'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'),
  ('gsc', 'EG', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Google Search Console clicks, impressions, and queries.'),
  ('bing_webmaster', 'EG', 'bing', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Bing Webmaster Tools REST API metrics.'),
  ('dataforseo', 'SA', 'google', TRUE, TRUE, FALSE, 'supported', 'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'),
  ('gsc', 'SA', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Google Search Console clicks, impressions, and queries.'),
  ('bing_webmaster', 'SA', 'bing', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Bing Webmaster Tools REST API metrics.'),
  ('dataforseo', 'AE', 'google', TRUE, TRUE, FALSE, 'supported', 'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'),
  ('gsc', 'AE', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Google Search Console clicks, impressions, and queries.'),
  ('bing_webmaster', 'AE', 'bing', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Bing Webmaster Tools REST API metrics.'),
  ('dataforseo', 'GB', 'google', TRUE, TRUE, FALSE, 'supported', 'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'),
  ('gsc', 'GB', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Google Search Console clicks, impressions, and queries.'),
  ('bing_webmaster', 'GB', 'bing', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Bing Webmaster Tools REST API metrics.'),
  ('dataforseo', 'DE', 'google', TRUE, TRUE, FALSE, 'supported', 'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'),
  ('gsc', 'DE', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Google Search Console clicks, impressions, and queries.'),
  ('bing_webmaster', 'DE', 'bing', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Bing Webmaster Tools REST API metrics.'),
  ('dataforseo', 'FR', 'google', TRUE, TRUE, FALSE, 'supported', 'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'),
  ('gsc', 'FR', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Google Search Console clicks, impressions, and queries.'),
  ('bing_webmaster', 'FR', 'bing', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Bing Webmaster Tools REST API metrics.'),
  ('dataforseo', 'ES', 'google', TRUE, TRUE, FALSE, 'supported', 'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'),
  ('gsc', 'ES', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Google Search Console clicks, impressions, and queries.'),
  ('bing_webmaster', 'ES', 'bing', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Bing Webmaster Tools REST API metrics.'),
  ('dataforseo', 'IT', 'google', TRUE, TRUE, FALSE, 'supported', 'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'),
  ('gsc', 'IT', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Google Search Console clicks, impressions, and queries.'),
  ('bing_webmaster', 'IT', 'bing', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Bing Webmaster Tools REST API metrics.'),
  ('dataforseo', 'NL', 'google', TRUE, TRUE, FALSE, 'supported', 'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'),
  ('gsc', 'NL', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Google Search Console clicks, impressions, and queries.'),
  ('bing_webmaster', 'NL', 'bing', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Bing Webmaster Tools REST API metrics.'),
  ('dataforseo', 'PL', 'google', TRUE, TRUE, FALSE, 'supported', 'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'),
  ('gsc', 'PL', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Google Search Console clicks, impressions, and queries.'),
  ('bing_webmaster', 'PL', 'bing', FALSE, FALSE, TRUE, 'first_party_only', 'Authorized first-party Bing Webmaster Tools REST API metrics.'),
  ('yandex_search_api', 'RU', 'yandex', TRUE, FALSE, FALSE, 'partial', 'Russian Yandex SERP observations via Yandex Search API. Third-party Yandex keyword volumes are not assumed.'),
  ('yandex_webmaster', 'RU', 'yandex', FALSE, FALSE, TRUE, 'first_party_only', 'First-party Russian website diagnostics and search queries via Yandex Webmaster API.'),
  ('gsc', 'RU', 'google', FALSE, FALSE, TRUE, 'first_party_only', 'DataForSEO does not cover Russia; Google data is limited to customer-authorized Search Console.')
ON CONFLICT (provider_code, country_code, search_engine_code) DO NOTHING;

INSERT INTO plans (
  id, name, description, price_egp_monthly, price_usd_monthly,
  max_projects, max_keywords, max_crawls_monthly, max_geo_runs_monthly,
  max_ai_credits_monthly, max_team_members, is_active
) VALUES
  ('starter', 'Starter Kitchen', 'For solo consultants and growing local businesses.', 1450, 29, 2, 250, 10, 30, 500, 2, TRUE),
  ('pro', 'Pro Brigade', 'For in-house marketing teams targeting multi-country growth.', 4900, 99, 10, 2000, 50, 200, 3000, 6, TRUE),
  ('agency', 'Agency Command', 'For Egyptian, MENA, and global agencies managing client portfolios.', 12500, 249, 40, 10000, 250, 1000, 15000, 25, TRUE)
ON CONFLICT (id) DO NOTHING;
