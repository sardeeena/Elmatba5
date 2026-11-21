-- EL MATBA5 — move RLS-only SECURITY DEFINER helpers out of the exposed public API.
-- Application RPCs remain in public; only boolean policy predicates move to private.
-- The authenticated role retains EXECUTE because PostgreSQL evaluates these helpers
-- while enforcing RLS, but PostgREST must not expose the private schema.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_org_member(p_org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = pg_catalog, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id AND m.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.has_org_role(p_org_id UUID, p_roles TEXT[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = pg_catalog, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_view_profile(p_profile_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = pg_catalog, auth, pg_temp
AS $$
  SELECT p_profile_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_members mine
      JOIN public.organization_members theirs ON mine.organization_id = theirs.organization_id
      WHERE mine.user_id = (SELECT auth.uid()) AND theirs.user_id = p_profile_id
    );
$$;

REVOKE ALL ON FUNCTION private.is_org_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_org_role(UUID, TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_view_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_org_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_profile(UUID) TO authenticated;

-- Rewrite every policy expression before dropping the public helper functions.
DO $$
DECLARE
  v_policy RECORD;
  v_using TEXT;
  v_check TEXT;
  v_statement TEXT;
BEGIN
  -- pg_get_expr deparses these calls without the public schema prefix, so
  -- select policies through pg_depend rather than matching a qualified name.
  FOR v_policy IN
    SELECT DISTINCT p.polname, c.relname AS table_name, n.nspname AS schema_name,
      pg_get_expr(p.polqual, p.polrelid) AS using_expression,
      pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_depend d ON d.classid = 'pg_policy'::regclass AND d.objid = p.oid
    JOIN pg_proc f ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = f.oid
    WHERE f.pronamespace = 'public'::regnamespace
      AND f.proname IN ('is_org_member', 'has_org_role', 'can_view_profile')
  LOOP
    v_using := v_policy.using_expression;
    v_check := v_policy.check_expression;

    IF v_using IS NOT NULL THEN
      IF position('public.is_org_member(' in v_using) > 0 THEN
        v_using := replace(v_using, 'public.is_org_member(', 'private.is_org_member(');
      ELSE
        v_using := replace(v_using, 'is_org_member(', 'private.is_org_member(');
      END IF;
      IF position('public.has_org_role(' in v_using) > 0 THEN
        v_using := replace(v_using, 'public.has_org_role(', 'private.has_org_role(');
      ELSE
        v_using := replace(v_using, 'has_org_role(', 'private.has_org_role(');
      END IF;
      IF position('public.can_view_profile(' in v_using) > 0 THEN
        v_using := replace(v_using, 'public.can_view_profile(', 'private.can_view_profile(');
      ELSE
        v_using := replace(v_using, 'can_view_profile(', 'private.can_view_profile(');
      END IF;
    END IF;

    IF v_check IS NOT NULL THEN
      IF position('public.is_org_member(' in v_check) > 0 THEN
        v_check := replace(v_check, 'public.is_org_member(', 'private.is_org_member(');
      ELSE
        v_check := replace(v_check, 'is_org_member(', 'private.is_org_member(');
      END IF;
      IF position('public.has_org_role(' in v_check) > 0 THEN
        v_check := replace(v_check, 'public.has_org_role(', 'private.has_org_role(');
      ELSE
        v_check := replace(v_check, 'has_org_role(', 'private.has_org_role(');
      END IF;
      IF position('public.can_view_profile(' in v_check) > 0 THEN
        v_check := replace(v_check, 'public.can_view_profile(', 'private.can_view_profile(');
      ELSE
        v_check := replace(v_check, 'can_view_profile(', 'private.can_view_profile(');
      END IF;
    END IF;

    v_statement := format('ALTER POLICY %I ON %I.%I',
      v_policy.polname, v_policy.schema_name, v_policy.table_name);
    IF v_using IS NOT NULL THEN
      v_statement := v_statement || format(' USING (%s)', v_using);
    END IF;
    IF v_check IS NOT NULL THEN
      v_statement := v_statement || format(' WITH CHECK (%s)', v_check);
    END IF;
    EXECUTE v_statement;
  END LOOP;
END;
$$;

-- Project quota trigger also used the public role helper; preserve its authorization.
CREATE OR REPLACE FUNCTION public.enforce_project_quota_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_invoker_role TEXT := COALESCE(NULLIF(NULLIF(pg_catalog.current_setting('role', true), ''), 'none'), session_user);
  v_max_projects INTEGER;
  v_current_projects INTEGER;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'projects' THEN RAISE EXCEPTION 'Invalid trigger target for enforce_project_quota_on_insert'; END IF;
  IF NEW.organization_id IS NULL THEN RAISE EXCEPTION 'Organization id is required for project creation'; END IF;
  IF v_invoker_role IN ('anon', 'authenticated', 'authenticator') THEN
    IF auth.uid() IS NULL OR NOT private.has_org_role(NEW.organization_id, ARRAY['owner', 'admin', 'analyst']) THEN
      RAISE EXCEPTION 'Insufficient permissions to create project in this organization' USING ERRCODE = '42501';
    END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('proj_quota:' || NEW.organization_id::TEXT, 0));
  SELECT p.max_projects INTO v_max_projects FROM public.organizations o JOIN public.plans p ON p.id = o.plan_id WHERE o.id = NEW.organization_id FOR SHARE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization not found'; END IF;
  SELECT COUNT(*) INTO v_current_projects FROM public.projects pr WHERE pr.organization_id = NEW.organization_id;
  IF v_max_projects IS NOT NULL AND v_current_projects >= v_max_projects THEN RAISE EXCEPTION 'Project plan limit reached: maximum % active projects allowed on current plan', v_max_projects; END IF;
  RETURN NEW;
END;
$$;
DROP FUNCTION public.is_org_member(UUID);
DROP FUNCTION public.has_org_role(UUID, TEXT[]);
DROP FUNCTION public.can_view_profile(UUID);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_depend d
    JOIN pg_proc f ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = f.oid
    WHERE d.classid = 'pg_policy'::regclass
      AND f.pronamespace = 'public'::regnamespace
      AND f.proname IN ('is_org_member', 'has_org_role', 'can_view_profile')
  ) THEN
    RAISE EXCEPTION 'A public RLS policy still depends on a moved helper';
  END IF;
END;
$$;

-- Keep the historical Phase 2A.3 readiness RPC accurate after moving its helpers.
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
    -- 6. RLS helpers now live only in the non-exposed private schema.
    AND (
      SELECT COUNT(*) = 3
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'private'
        AND p.proname = ANY(ARRAY['is_org_member', 'has_org_role', 'can_view_profile'])
        AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY['is_org_member', 'has_org_role', 'can_view_profile'])
    );
$$;
