-- EL MATBA5 (المطبخ) — Phase 2A.3 / 2A.3.1 Security Remediation & Database Performance Optimization
-- Migration: 0005_phase_2a3_security_and_performance.sql
-- Ordered additive migration applied AFTER 0001, 0002, 0003, and 0004.
-- Do NOT rewrite migrations 0001–0004.
--
-- Summary of verified changes:
--   1. Performance: Add 7 justified FK covering indexes (all auth.users FKs + organizations.plan_id
--      + projects.primary_country_code) and drop 1 genuinely redundant index (idx_org_members_org,
--      already covered by UNIQUE(organization_id, user_id)). Retain the remaining 6 indexes and
--      intentionally omit low-selectivity / tiny-static-registry FKs on project_market_targets and
--      provider_coverage.
--   2. Performance (RLS InitPlan): Wrap auth.uid() in (SELECT auth.uid()) across all 5 flagged RLS
--      policies and in the SECURITY DEFINER RLS helpers (preserving 0004 execute permissions).
--      Note: table name is public.organization_invitations; existing policy name org_invitations_insert_admin
--      is intentionally preserved.
--   3. Security:
--      - Prevent client tampering with organizations billing/ownership fields (plan_id, subscription_status, created_by).
--      - Remove client INSERT/UPDATE RLS policies on usage_records (metered counters).
--      - Lock public.organization_invitations direct client updates strictly to pending -> revoked transitions.
--      - Protect public.profiles on BOTH INSERT and UPDATE against email/id spoofing using authoritative
--        auth.users lookup while keeping handle_new_user() and SECURITY DEFINER RPCs working.
--      - Protect public.projects.created_by from direct client tampering and require actor_user_id = (SELECT auth.uid())
--        on direct public.audit_logs client inserts.
--      - Enforce transactional project quota on public.projects INSERT with 64-bit per-org advisory locking,
--        organizations row lock (FOR SHARE), and explicit role authorization prior to quota counting.
--      - Verify migration 0005 schema state dynamically in public.phase_2a3_security_perf_ready().

-- ============================================================================
-- 1. PERFORMANCE: JUSTIFIED FOREIGN-KEY INDEXES & REDUNDANT INDEX REMOVAL
-- ============================================================================

-- High-value FK indexes (especially ON DELETE SET NULL referencing auth.users(id))
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id
  ON public.audit_logs(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_org_invitations_accepted_by
  ON public.organization_invitations(accepted_by);

CREATE INDEX IF NOT EXISTS idx_org_invitations_invited_by
  ON public.organization_invitations(invited_by);

CREATE INDEX IF NOT EXISTS idx_organizations_created_by
  ON public.organizations(created_by);

CREATE INDEX IF NOT EXISTS idx_organizations_plan_id
  ON public.organizations(plan_id);

CREATE INDEX IF NOT EXISTS idx_projects_created_by
  ON public.projects(created_by);

CREATE INDEX IF NOT EXISTS idx_projects_primary_country
  ON public.projects(primary_country_code);

-- Drop genuinely redundant left-prefix index: UNIQUE(organization_id, user_id) on
-- public.organization_members already provides an identical leading-column B-tree index.
DROP INDEX IF EXISTS public.idx_org_members_org;

-- NOTE on intentionally retained / omitted indexes:
--   Retained (unused only because DB is newly provisioned): idx_org_members_user,
--   idx_org_invitations_org, idx_projects_org, idx_market_targets_org_proj,
--   idx_competitors_org_proj, idx_audit_logs_org.
--   Omitted (low selectivity / static single-page registry):
--     - project_market_targets(country_code, language_code, search_engine_code): queries filter by
--       (organization_id, project_id); 3-to-11-value FK indexes add write overhead without benefit.
--     - provider_coverage(country_code, search_engine_code): ~33-row static reference table.

-- ============================================================================
-- 2. RLS HELPERS: INITPLAN OPTIMIZATION (PRESERVING 0004 PERMISSIONS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(p_org_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT p_profile_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_members mine
      JOIN public.organization_members theirs
        ON mine.organization_id = theirs.organization_id
      WHERE mine.user_id = (SELECT auth.uid())
        AND theirs.user_id = p_profile_id
    );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.has_org_role(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_org_role(UUID, TEXT[]) TO authenticated;

REVOKE ALL ON FUNCTION public.can_view_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile(UUID) TO authenticated;

-- ============================================================================
-- 3. PERFORMANCE & SECURITY: 5 RLS POLICIES USING (SELECT auth.uid())
-- ============================================================================

DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
CREATE POLICY profiles_insert_self ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS org_invitations_insert_admin ON public.organization_invitations;
CREATE POLICY org_invitations_insert_admin ON public.organization_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner', 'admin'])
    AND invited_by = (SELECT auth.uid())
    AND status = 'pending'
  );

DROP POLICY IF EXISTS audit_logs_insert_member ON public.audit_logs;
CREATE POLICY audit_logs_insert_member ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND actor_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS projects_insert_analyst ON public.projects;
CREATE POLICY projects_insert_analyst ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'analyst'])
    AND created_by = (SELECT auth.uid())
  );

-- ============================================================================
-- 4. SECURITY REMEDIATION: BILLING, USAGE QUOTAS, INVITATIONS & IMMUTABILITY
-- ============================================================================

-- Usage records must only be inserted/updated by trusted SECURITY DEFINER RPCs or
-- server billing routines — never directly by client roles.
DROP POLICY IF EXISTS usage_records_insert_analyst ON public.usage_records;
DROP POLICY IF EXISTS usage_records_update_analyst ON public.usage_records;

-- Prevent authenticated/anon callers from tampering with plan_id, subscription_status,
-- or created_by on public.organizations (prevents free self-upgrade bypass).
CREATE OR REPLACE FUNCTION public.protect_organization_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'organizations' THEN
    RAISE EXCEPTION 'Invalid trigger target for protect_organization_immutable_fields';
  END IF;

  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Organization id cannot be modified';
    END IF;
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      RAISE EXCEPTION 'Organization plan_id cannot be modified directly by client sessions';
    END IF;
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
      RAISE EXCEPTION 'Organization subscription_status cannot be modified directly by client sessions';
    END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Organization created_by cannot be modified';
    END IF;
  END IF;

  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_protect_billing ON public.organizations;
CREATE TRIGGER trg_organizations_protect_billing
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_organization_immutable_fields();

-- Prevent authenticated/anon callers from mutating accepted/expired/revoked invitations,
-- altering token_hash/email/role/org/acceptance metadata, or resetting accepted invitations to pending.
-- Only pending -> revoked transitions are allowed directly from authorized client sessions.
-- SECURITY DEFINER RPCs such as accept_organization_invitation execute as owner (current_user = 'postgres'),
-- so pending -> accepted transitions with accepted_by/accepted_at continue working normally.
CREATE OR REPLACE FUNCTION public.protect_organization_invitation_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'organization_invitations' THEN
    RAISE EXCEPTION 'Invalid trigger target for protect_organization_invitation_integrity';
  END IF;

  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
       OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
       OR NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
       OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Invitation metadata and token fields are immutable';
    END IF;

    IF NOT (OLD.status = 'pending' AND NEW.status = 'revoked') THEN
      RAISE EXCEPTION 'Direct invitation updates may only revoke a pending invitation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_invitations_integrity ON public.organization_invitations;
CREATE TRIGGER trg_org_invitations_integrity
  BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_organization_invitation_integrity();

-- Protect public.profiles on BOTH INSERT and UPDATE against email and identity spoofing.
-- Narrowly scoped SECURITY DEFINER is used solely to read authoritative auth.users.email
-- (never user-editable metadata or JWT email claims), while verifying caller role and auth.uid().
-- Trusted Supabase Auth triggers (supabase_auth_admin / postgres) keep functioning seamlessly.
CREATE OR REPLACE FUNCTION public.protect_profile_identity_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_invoker_role TEXT := COALESCE(
    NULLIF(NULLIF(pg_catalog.current_setting('role', true), ''), 'none'),
    session_user
  );
  v_auth_uid UUID := auth.uid();
  v_trusted_email TEXT;
  v_submitted_email TEXT;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'profiles' THEN
    RAISE EXCEPTION 'Invalid trigger target for protect_profile_identity_fields';
  END IF;

  v_submitted_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, '')));

  IF v_invoker_role IN ('anon', 'authenticated', 'authenticator') THEN
    IF v_auth_uid IS NULL THEN
      RAISE EXCEPTION 'Authentication required to manage profile identity'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.id IS DISTINCT FROM v_auth_uid THEN
      RAISE EXCEPTION 'Profile id must match authenticated user'
        USING ERRCODE = '42501';
    END IF;

    SELECT pg_catalog.lower(pg_catalog.btrim(COALESCE(u.email, '')))
    INTO v_trusted_email
    FROM auth.users u
    WHERE u.id = v_auth_uid;

    IF NOT FOUND OR v_trusted_email = '' THEN
      RAISE EXCEPTION 'Authenticated account must have a valid email address';
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF v_submitted_email <> v_trusted_email THEN
        RAISE EXCEPTION 'Profile email must match authenticated user email';
      END IF;
      NEW.email := v_trusted_email;
      NEW.created_at := COALESCE(NEW.created_at, pg_catalog.clock_timestamp());
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Profile identity fields (id, email) cannot be modified directly';
      END IF;
      IF v_submitted_email IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(COALESCE(OLD.email, ''))) THEN
        RAISE EXCEPTION 'Profile identity fields (id, email) cannot be modified directly';
      END IF;
      NEW.email := pg_catalog.lower(pg_catalog.btrim(COALESCE(OLD.email, v_trusted_email)));
      NEW.created_at := OLD.created_at;
    END IF;
  ELSE
    -- Trusted backend / Supabase Auth sync (handle_new_user / service_role / postgres)
    IF NEW.email IS NOT NULL THEN
      NEW.email := v_submitted_email;
    END IF;
  END IF;

  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_identity ON public.profiles;
CREATE TRIGGER trg_profiles_protect_identity
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_identity_fields();

-- Harden prevent_cross_org_reassignment so projects.created_by is also immutable for clients.
CREATE OR REPLACE FUNCTION public.prevent_cross_org_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' THEN
    RAISE EXCEPTION 'Invalid trigger schema for prevent_cross_org_reassignment';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Changing organization_id on an existing tenant record is forbidden';
  END IF;

  IF TG_TABLE_NAME = 'projects' AND current_user IN ('anon', 'authenticated') THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Changing created_by on an existing project is forbidden';
    END IF;
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

-- Enforce project plan quota atomically in PostgreSQL using 64-bit per-organization advisory lock
-- plus parent organization row share lock and explicit caller authorization check
-- (prevents TOCTOU concurrent request races, direct PostgREST insert bypasses, and quota oracles).
CREATE OR REPLACE FUNCTION public.enforce_project_quota_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_invoker_role TEXT := COALESCE(
    NULLIF(NULLIF(pg_catalog.current_setting('role', true), ''), 'none'),
    session_user
  );
  v_max_projects INTEGER;
  v_current_projects INTEGER;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'projects' THEN
    RAISE EXCEPTION 'Invalid trigger target for enforce_project_quota_on_insert';
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization id is required for project creation';
  END IF;

  IF v_invoker_role IN ('anon', 'authenticated', 'authenticator') THEN
    IF auth.uid() IS NULL OR NOT public.has_org_role(NEW.organization_id, ARRAY['owner', 'admin', 'analyst']) THEN
      RAISE EXCEPTION 'Insufficient permissions to create project in this organization'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('proj_quota:' || NEW.organization_id::TEXT, 0)
  );

  SELECT p.max_projects
  INTO v_max_projects
  FROM public.organizations o
  JOIN public.plans p ON p.id = o.plan_id
  WHERE o.id = NEW.organization_id
  FOR SHARE OF o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  SELECT COUNT(*)
  INTO v_current_projects
  FROM public.projects pr
  WHERE pr.organization_id = NEW.organization_id;

  IF v_max_projects IS NOT NULL AND v_current_projects >= v_max_projects THEN
    RAISE EXCEPTION 'Project plan limit reached: maximum % active projects allowed on current plan', v_max_projects;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_enforce_quota ON public.projects;
CREATE TRIGGER trg_projects_enforce_quota
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_project_quota_on_insert();

-- Real schema-catalog readiness check for Migration 0005 (does not return TRUE unconditionally).
-- Verifies required FK indexes, redundant index drop, removed usage_records write policies,
-- InitPlan-optimized RLS policies, enabled security triggers, and strict EXECUTE privileges.
CREATE OR REPLACE FUNCTION public.phase_2a3_security_perf_ready()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
  SELECT
    -- 1. All 7 justified FK covering indexes exist in public schema
    (
      SELECT COUNT(*) = 7
      FROM pg_catalog.pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.indexname = ANY(ARRAY[
          'idx_audit_logs_actor_user_id',
          'idx_org_invitations_accepted_by',
          'idx_org_invitations_invited_by',
          'idx_organizations_created_by',
          'idx_organizations_plan_id',
          'idx_projects_created_by',
          'idx_projects_primary_country'
        ])
    )
    -- 2. Redundant index dropped and direct client usage_records write policies removed
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.indexname = 'idx_org_members_org'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies pol
      WHERE pol.schemaname = 'public'
        AND pol.tablename = 'usage_records'
        AND pol.policyname = ANY(ARRAY['usage_records_insert_analyst', 'usage_records_update_analyst'])
    )
    -- 3. All 5 flagged RLS policies exist and wrap auth.uid() in a scalar subselect (InitPlan)
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies pol
      WHERE pol.schemaname = 'public' AND pol.tablename = 'profiles'
        AND pol.policyname = 'profiles_insert_self'
        AND pol.with_check ~* '\(\s*SELECT\s+auth\.uid\(\)'
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies pol
      WHERE pol.schemaname = 'public' AND pol.tablename = 'profiles'
        AND pol.policyname = 'profiles_update_self'
        AND pol.qual ~* '\(\s*SELECT\s+auth\.uid\(\)'
        AND pol.with_check ~* '\(\s*SELECT\s+auth\.uid\(\)'
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies pol
      WHERE pol.schemaname = 'public' AND pol.tablename = 'organization_invitations'
        AND pol.policyname = 'org_invitations_insert_admin'
        AND pol.with_check ~* '\(\s*SELECT\s+auth\.uid\(\)'
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies pol
      WHERE pol.schemaname = 'public' AND pol.tablename = 'audit_logs'
        AND pol.policyname = 'audit_logs_insert_member'
        AND pol.with_check ~* '\(\s*SELECT\s+auth\.uid\(\)'
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies pol
      WHERE pol.schemaname = 'public' AND pol.tablename = 'projects'
        AND pol.policyname = 'projects_insert_analyst'
        AND pol.with_check ~* '\(\s*SELECT\s+auth\.uid\(\)'
    )
    -- 4. Required security & quota triggers exist and are enabled on their exact public tables
    AND (
      SELECT COUNT(*) = 5
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
        AND t.tgenabled <> 'D'
        AND (c.relname, t.tgname) IN (
          ('organizations', 'trg_organizations_protect_billing'),
          ('organization_invitations', 'trg_org_invitations_integrity'),
          ('profiles', 'trg_profiles_protect_identity'),
          ('projects', 'trg_projects_enforce_quota'),
          ('projects', 'trg_projects_immutable_org')
        )
    )
    -- 5. All 5 internal trigger functions deny EXECUTE to both anon and authenticated
    AND (
      SELECT COUNT(*) = 5
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY(ARRAY[
          'protect_organization_immutable_fields',
          'protect_organization_invitation_integrity',
          'protect_profile_identity_fields',
          'prevent_cross_org_reassignment',
          'enforce_project_quota_on_insert'
        ])
        AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
    -- 6. Required RLS helpers remain granted to authenticated and revoked from anon
    AND (
      SELECT COUNT(*) = 3
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY(ARRAY['is_org_member', 'has_org_role', 'can_view_profile'])
        AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );
$$;

-- Strict least-privilege permissions (preserving 0004 rules: internal trigger helpers
-- cannot be invoked directly via Data API RPCs by anon or authenticated).
REVOKE ALL ON FUNCTION public.protect_organization_immutable_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_organization_invitation_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_identity_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_cross_org_reassignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_project_quota_on_insert() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.phase_2a3_security_perf_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase_2a3_security_perf_ready() TO authenticated;
