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
  FOR v_policy IN
    SELECT p.polname, c.relname AS table_name, n.nspname AS schema_name,
      pg_get_expr(p.polqual, p.polrelid) AS using_expression,
      pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ||
           COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
          ~ 'public\\.(is_org_member|has_org_role|can_view_profile)'
  LOOP
    v_using := v_policy.using_expression;
    v_check := v_policy.check_expression;

    IF v_using IS NOT NULL THEN
      v_using := replace(replace(replace(v_using,
        'public.is_org_member', 'private.is_org_member'),
        'public.has_org_role', 'private.has_org_role'),
        'public.can_view_profile', 'private.can_view_profile');
    END IF;
    IF v_check IS NOT NULL THEN
      v_check := replace(replace(replace(v_check,
        'public.is_org_member', 'private.is_org_member'),
        'public.has_org_role', 'private.has_org_role'),
        'public.can_view_profile', 'private.can_view_profile');
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

DROP FUNCTION public.is_org_member(UUID);
DROP FUNCTION public.has_org_role(UUID, TEXT[]);
DROP FUNCTION public.can_view_profile(UUID);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ||
           COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
          ~ 'public\\.(is_org_member|has_org_role|can_view_profile)'
  ) THEN
    RAISE EXCEPTION 'A public RLS policy still references a moved helper';
  END IF;
END;
$$;
