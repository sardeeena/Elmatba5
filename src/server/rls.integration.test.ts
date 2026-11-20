import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadAndValidateEnv } from './config/env.ts';

const env = loadAndValidateEnv();
const runSuffix = crypto.randomBytes(4).toString('hex');

async function signUpTestUser(email: string, password: string, fullName: string) {
  const client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, preferred_locale: 'en' } },
  });

  if (error || !data.session) {
    return { client: null as SupabaseClient | null, userId: null as string | null, reason: error?.message ?? 'Email confirmation is enabled on Supabase project; auto-session not returned for test user.' };
  }

  const authedClient = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return { client: authedClient, userId: data.user?.id ?? null, reason: null };
}

test('PostgreSQL RLS multi-tenant isolation & role enforcement (2 authenticated non-privileged users)', async (t) => {
  if (!env.supabaseConfigured) {
    t.skip('Live SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY not present in test shell environment.');
    return;
  }

  // Verify schema migration has been applied before running tenant tests
  const probe = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: schemaError } = await probe.from('plans').select('id').limit(1);
  if (schemaError) {
    t.skip(`Supabase schema not ready for live RLS test (${schemaError.message}).`);
    return;
  }

  const emailA = `rls-user-a-${runSuffix}@example.com`;
  const emailB = `rls-user-b-${runSuffix}@example.com`;
  const emailC = `rls-viewer-c-${runSuffix}@example.com`;
  const pass = 'Matba5RlsTest!2026';

  const userA = await signUpTestUser(emailA, pass, 'User A Owner');
  if (!userA.client || !userA.userId) {
    t.skip(`Skipping live RLS test: ${userA.reason}`);
    return;
  }

  const userB = await signUpTestUser(emailB, pass, 'User B Attacker');
  const userC = await signUpTestUser(emailC, pass, 'User C Viewer');
  if (!userB.client || !userB.userId || !userC.client || !userC.userId) {
    t.skip('Skipping live RLS test: secondary test users did not receive immediate sessions.');
    return;
  }

  // Bootstrap Org A (owner: User A) and Org B (owner: User B)
  const { data: orgA, error: orgAErr } = await userA.client.rpc('create_organization_atomic', {
    p_name: `Org A ${runSuffix}`,
    p_slug: `org-a-${runSuffix}`,
    p_business_type: 'agency',
    p_billing_country_code: 'EG',
  });
  assert.ifError(orgAErr);
  assert.ok(orgA?.id);

  const { data: orgB, error: orgBErr } = await userB.client.rpc('create_organization_atomic', {
    p_name: `Org B ${runSuffix}`,
    p_slug: `org-b-${runSuffix}`,
    p_business_type: 'business',
    p_billing_country_code: 'DE',
  });
  assert.ifError(orgBErr);
  assert.ok(orgB?.id);

  // User A creates a project inside Org A
  const { data: projA, error: projAErr } = await userA.client
    .from('projects')
    .insert({
      organization_id: orgA.id,
      name: 'Cairo Export Project',
      website_url: 'https://cairo-export.example',
      primary_country_code: 'EG',
      created_by: userA.userId,
    })
    .select('*')
    .single();
  assert.ifError(projAErr);

  const { error: targetErr } = await userA.client.from('project_market_targets').insert({
    organization_id: orgA.id,
    project_id: projA.id,
    country_code: 'EG',
    language_code: 'ar',
    search_engine_code: 'google',
    device: 'both',
    assigned_provider: 'dataforseo + google_search_console',
    coverage_status: 'supported',
  });
  assert.ifError(targetErr);

  // 1. User A cannot read User B's organization
  const { data: readOrgB } = await userA.client
    .from('organizations')
    .select('*')
    .eq('id', orgB.id);
  assert.equal(readOrgB?.length ?? 0, 0);

  // 2. User B cannot read User A's projects
  const { data: readProjA } = await userB.client
    .from('projects')
    .select('*')
    .eq('id', projA.id);
  assert.equal(readProjA?.length ?? 0, 0);

  // 3. User A cannot create a project inside User B's organization
  const { error: crossInsertErr } = await userA.client.from('projects').insert({
    organization_id: orgB.id,
    name: 'Injected Project',
    website_url: 'https://evil.example',
    primary_country_code: 'EG',
    created_by: userA.userId,
  });
  assert.ok(crossInsertErr, 'Expected RLS to block cross-tenant project insert');

  // 4. User B cannot update or delete User A's projects or market targets
  const { data: updatedByB } = await userB.client
    .from('projects')
    .update({ name: 'Hacked' })
    .eq('id', projA.id)
    .select('id');
  assert.equal(updatedByB?.length ?? 0, 0);

  const { data: deletedTargetByB } = await userB.client
    .from('project_market_targets')
    .delete()
    .eq('project_id', projA.id)
    .select('id');
  assert.equal(deletedTargetByB?.length ?? 0, 0);

  // 5. User B cannot read User A's audit logs or usage records
  const { data: auditA } = await userB.client
    .from('audit_logs')
    .select('*')
    .eq('organization_id', orgA.id);
  assert.equal(auditA?.length ?? 0, 0);

  const { data: usageA } = await userB.client
    .from('usage_records')
    .select('*')
    .eq('organization_id', orgA.id);
  assert.equal(usageA?.length ?? 0, 0);

  // 8. Invitation token: create hashed token for User C (viewer), reject User B, accept by User C, reject reuse
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const { error: invErr } = await userA.client.from('organization_invitations').insert({
    organization_id: orgA.id,
    email: emailC,
    role: 'viewer',
    token_hash: tokenHash,
    status: 'pending',
    invited_by: userA.userId,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  assert.ifError(invErr);

  // User B (wrong email) must be rejected
  const { error: wrongEmailErr } = await userB.client.rpc('accept_organization_invitation', {
    p_raw_token: rawToken,
  });
  assert.ok(wrongEmailErr, 'Wrong email user must not accept invitation');

  // User C (matching email) accepts successfully
  const { data: acceptedOrg, error: acceptErr } = await userC.client.rpc(
    'accept_organization_invitation',
    { p_raw_token: rawToken }
  );
  assert.ifError(acceptErr);
  assert.equal(acceptedOrg.id, orgA.id);

  // Reuse by User C must be rejected
  const { error: reuseErr } = await userC.client.rpc('accept_organization_invitation', {
    p_raw_token: rawToken,
  });
  assert.ok(reuseErr, 'Used invitation token must not be accepted twice');

  // 6. Viewer member (User C) cannot create or delete projects in Org A
  const { error: viewerInsertErr } = await userC.client.from('projects').insert({
    organization_id: orgA.id,
    name: 'Viewer Forbidden Project',
    website_url: 'https://viewer.example',
    primary_country_code: 'EG',
    created_by: userC.userId,
  });
  assert.ok(viewerInsertErr, 'Viewer role must be blocked from creating projects');

  const { data: viewerDeleteData } = await userC.client
    .from('projects')
    .delete()
    .eq('id', projA.id)
    .select('id');
  assert.equal(viewerDeleteData?.length ?? 0, 0);
});
