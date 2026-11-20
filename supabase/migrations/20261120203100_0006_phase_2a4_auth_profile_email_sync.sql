-- EL MATBA5 (المطبخ) — Phase 2A.4 Auth/Profile Email Synchronization
-- Additive correction after the Phase 2A.3 profile identity guard.
-- Supabase Auth email changes must update the protected profiles.email field through
-- a trusted database trigger; client-side profile writes remain forbidden.

CREATE OR REPLACE FUNCTION public.protect_profile_identity_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_invoker_role TEXT := COALESCE(
    NULLIF(NULLIF(pg_catalog.current_setting('role', true), ''), 'none'),
    session_user
  );
  v_auth_uid UUID := auth.uid();
  v_trusted_email TEXT;
  v_submitted_email TEXT;
  v_auth_sync BOOLEAN := pg_catalog.current_setting('elmatba5.auth_profile_email_sync', true) = 'on';
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'profiles' THEN
    RAISE EXCEPTION 'Invalid trigger target for protect_profile_identity_fields';
  END IF;

  v_submitted_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, '')));

  -- This transaction-local flag is set only by the private SECURITY DEFINER
  -- auth.users trigger below. Still re-read auth.users so the email is authoritative.
  IF v_auth_sync THEN
    IF TG_OP <> 'UPDATE' OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Auth email synchronization may only update an existing profile';
    END IF;

    SELECT pg_catalog.lower(pg_catalog.btrim(COALESCE(u.email, '')))
    INTO v_trusted_email
    FROM auth.users u
    WHERE u.id = NEW.id;

    IF NOT FOUND OR v_trusted_email = '' THEN
      RAISE EXCEPTION 'Auth user must have a valid email address';
    END IF;

    NEW.email := v_trusted_email;
    NEW.created_at := OLD.created_at;

  ELSIF v_invoker_role IN ('anon', 'authenticated', 'authenticator') THEN
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
      IF NEW.id IS DISTINCT FROM OLD.id
         OR v_submitted_email IS DISTINCT FROM pg_catalog.lower(pg_catalog.btrim(COALESCE(OLD.email, ''))) THEN
        RAISE EXCEPTION 'Profile identity fields (id, email) cannot be modified directly';
      END IF;
      NEW.email := pg_catalog.lower(pg_catalog.btrim(COALESCE(OLD.email, v_trusted_email)));
      NEW.created_at := OLD.created_at;
    END IF;
  ELSE
    -- Trusted backend / Supabase Auth sync (service_role, auth admin, postgres).
    IF NEW.email IS NOT NULL THEN
      NEW.email := v_submitted_email;
    END IF;
  END IF;

  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_previous_sync_flag TEXT := pg_catalog.current_setting('elmatba5.auth_profile_email_sync', true);
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Auth user identity cannot change';
  END IF;

  PERFORM pg_catalog.set_config('elmatba5.auth_profile_email_sync', 'on', true);

  UPDATE public.profiles
  SET email = pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, ''))),
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = NEW.id;

  PERFORM pg_catalog.set_config(
    'elmatba5.auth_profile_email_sync',
    COALESCE(v_previous_sync_flag, ''),
    true
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_identity_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_profile_email_from_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email_from_auth_user();

CREATE OR REPLACE FUNCTION public.phase_2a4_profile_email_sync_ready()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_email_updated'
      AND NOT t.tgisinternal
      AND t.tgenabled <> 'D'
      AND (t.tgtype & 1) = 1
      AND (t.tgtype & 16) = 16
      AND p.proname = 'sync_profile_email_from_auth_user'
      AND p.prosecdef
      AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
  );
$$;

REVOKE ALL ON FUNCTION public.phase_2a4_profile_email_sync_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase_2a4_profile_email_sync_ready() TO authenticated;
