-- EL MATBA5 (المطبخ) — Phase 2A.1.2 Function Permission Hardening
-- Migration: 0004_function_permission_hardening.sql
-- Apply after 0001, 0002, and 0003.
--
-- Remove anonymous/public EXECUTE access. Restore authenticated access only
-- for application RPCs and RLS helpers that the app intentionally invokes.
-- Trigger/event-trigger handlers and internal helpers remain inaccessible via
-- the exposed Data API.
--
-- SECURITY DEFINER is retained where the existing tenant/RLS architecture
-- requires it. These functions must enforce auth.uid() and tenant checks.

REVOKE ALL ON FUNCTION public.accept_organization_invitation(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_profile(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_onboarding_atomic(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_organization_atomic(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_org_role(UUID, TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.max_owned_organizations_default() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase_2a1_1_strict_email_confirmation_ready() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prevent_cross_org_reassignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_market_target_meta(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_atomic(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_atomic(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- RLS helpers required by policies on exposed public tables.
GRANT EXECUTE ON FUNCTION public.can_view_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.phase_2a1_1_strict_email_confirmation_ready() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_market_target_meta(TEXT, TEXT, TEXT) TO authenticated;
