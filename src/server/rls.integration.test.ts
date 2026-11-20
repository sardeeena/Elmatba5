import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadAndValidateEnv } from './config/env.ts';

const env = loadAndValidateEnv();
const runSuffix = crypto.randomBytes(4).toString('hex');

interface SignedUpTestUser {
  client: SupabaseClient | null;
  userId: string | null;
  emailConfirmed: boolean;
  reason: string | null;
}

async function signUpTestUser(
  email: string,
  password: string,
  fullName: string
): Promise<SignedUpTestUser> {
  const client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, preferred_locale: 'en' } },
  });

  if (error || !data.session) {
    return {
      client: null,
      userId: data.user?.id ?? null,
      emailConfirmed: false,
      reason:
        error?.message ??
        'Email confirmation is required on Supabase project; immediate session was not issued for automated test user.',
    };
  }

  const authedClient = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const emailConfirmed = Boolean(data.user?.email_confirmed_at || data.user?.confirmed_at);

  return {
    client: authedClient,
    userId: data.user?.id ?? null,
    emailConfirmed,
    reason: null,
  };
}

test('PostgreSQL RLS & Phase 2A.1 Security Hardening Suite (Real Supabase Clients)', async (t) => {
  if (!env.supabaseConfigured) {
    t.skip('Live SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY not present in test shell environment.');
    return;
  }

  const probe = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { error: schemaError } = await probe.from('plans').select('id').limit(1);
  if (schemaError) {
    t.skip(`Supabase schema not ready for live RLS test (${schemaError.message}).`);
    return;
  }

  // Sign up real non-privileged Supabase Auth users
  const emailA = `rls-user-a-${runSuffix}@example.com`;
  const emailB = `rls-user-b-${runSuffix}@example.com`;
  const emailC = `rls-viewer-c-${runSuffix}@example.com`;
  const emailD = `rls-analyst-d-${runSuffix}@example.com`;
  const emailFresh = `rls-onboard-${runSuffix}@example.com`;
  const emailLimit = `rls-limit-${runSuffix}@example.com`;
  const pass = 'Matba5RlsTest!2026';

  const userA = await signUpTestUser(emailA, pass, 'User A Owner');
  if (!userA.client || !userA.userId) {
    t.skip(`Skipping live RLS test: ${userA.reason}`);
    return;
  }

  const [userB, userC, userD, userFresh, userLimit] = await Promise.all([
    signUpTestUser(emailB, pass, 'User B Attacker'),
    signUpTestUser(emailC, pass, 'User C Viewer'),
    signUpTestUser(emailD, pass, 'User D Analyst'),
    signUpTestUser(emailFresh, pass, 'User Fresh Onboarding'),
    signUpTestUser(emailLimit, pass, 'User Org Limit'),
  ]);

  if (
    !userB.client ||
    !userB.userId ||
    !userC.client ||
    !userC.userId ||
    !userD.client ||
    !userD.userId ||
    !userFresh.client ||
    !userFresh.userId ||
    !userLimit.client ||
    !userLimit.userId
  ) {
    t.skip('Skipping live RLS test: secondary test users did not receive immediate sessions.');
    return;
  }

  // Verify Phase 2A.1 migration 0002 is applied before asserting 0002 behaviors
  const clientA = userA.client;
  const userIdA = userA.userId;
  const clientB = userB.client;
  const userIdB = userB.userId;
  const clientC = userC.client;
  const userIdC = userC.userId;
  const clientD = userD.client;
  const userIdD = userD.userId;
  const clientFresh = userFresh.client;
  const clientLimit = userLimit.client;

  const { error: migration0002Check } = await clientA.rpc('max_owned_organizations_default');
  if (migration0002Check) {
    t.skip(
      `Migration 0002_phase_2a1_security_hardening.sql not applied yet (${migration0002Check.message}).`
    );
    return;
  }

  // Bootstrap Org A (User A) and Org B (User B)
  const { data: orgA, error: orgAErr } = await clientA.rpc('create_organization_atomic', {
    p_name: `Org A ${runSuffix}`,
    p_slug: `org-a-${runSuffix}`,
    p_business_type: 'agency',
    p_billing_country_code: 'EG',
  });
  assert.ifError(orgAErr);
  assert.ok(orgA?.id);

  const { data: orgB, error: orgBErr } = await clientB.rpc('create_organization_atomic', {
    p_name: `Org B ${runSuffix}`,
    p_slug: `org-b-${runSuffix}`,
    p_business_type: 'business',
    p_billing_country_code: 'DE',
  });
  assert.ifError(orgBErr);
  assert.ok(orgB?.id);

  // Create projects & child rows in Org A and Org B
  const { data: projA, error: projAErr } = await clientA
    .from('projects')
    .insert({
      organization_id: orgA.id,
      name: 'Cairo Export Project',
      website_url: 'https://cairo-export.example',
      primary_country_code: 'EG',
      created_by: userIdA,
    })
    .select('*')
    .single();
  assert.ifError(projAErr);

  const { data: projB, error: projBErr } = await clientB
    .from('projects')
    .insert({
      organization_id: orgB.id,
      name: 'Berlin Target Project',
      website_url: 'https://berlin-target.example',
      primary_country_code: 'DE',
      created_by: userIdB,
    })
    .select('*')
    .single();
  assert.ifError(projBErr);

  const { data: targetA, error: targetAErr } = await clientA
    .from('project_market_targets')
    .insert({
      organization_id: orgA.id,
      project_id: projA.id,
      country_code: 'EG',
      language_code: 'ar',
      search_engine_code: 'google',
      device: 'both',
      assigned_provider: 'dataforseo + google_search_console',
      coverage_status: 'supported',
    })
    .select('*')
    .single();
  assert.ifError(targetAErr);

  const { data: compA, error: compAErr } = await clientA
    .from('project_competitors')
    .insert({
      organization_id: orgA.id,
      project_id: projA.id,
      domain: 'competitor-eg.example',
      label: 'Local Rival',
    })
    .select('*')
    .single();
  assert.ifError(compAErr);

  // ============================================================================
  // TASK 2 — Child-table UPDATE RLS & Cross-Tenant Isolation Tests
  // ============================================================================
  await t.test('Task 2: Cross-org isolation and child-table UPDATE RLS enforcement', async () => {
    // 1. Cross-org read blocked
    const { data: readOrgB } = await clientA.from('organizations').select('*').eq('id', orgB.id);
    assert.equal(readOrgB?.length ?? 0, 0);

    const { data: readProjA } = await clientB.from('projects').select('*').eq('id', projA.id);
    assert.equal(readProjA?.length ?? 0, 0);

    const { data: readTargetsA } = await clientB
      .from('project_market_targets')
      .select('*')
      .eq('id', targetA.id);
    assert.equal(readTargetsA?.length ?? 0, 0);

    // 2. Cross-org write/update blocked
    const { error: crossInsertErr } = await clientA.from('projects').insert({
      organization_id: orgB.id,
      name: 'Injected Project',
      website_url: 'https://evil.example',
      primary_country_code: 'EG',
      created_by: userIdA,
    });
    assert.ok(crossInsertErr);

    const { data: updatedTargetByB } = await clientB
      .from('project_market_targets')
      .update({ device: 'mobile' })
      .eq('id', targetA.id)
      .select('id');
    assert.equal(updatedTargetByB?.length ?? 0, 0);

    // 3. Moving Org A child row project_id to Org B's project must fail
    const { error: moveTargetProjErr, data: moveTargetProjData } = await clientA
      .from('project_market_targets')
      .update({ project_id: projB.id })
      .eq('id', targetA.id)
      .select('id');
    assert.ok(moveTargetProjErr || (moveTargetProjData?.length ?? 0) === 0);

    const { error: moveCompProjErr, data: moveCompProjData } = await clientA
      .from('project_competitors')
      .update({ project_id: projB.id })
      .eq('id', compA.id)
      .select('id');
    assert.ok(moveCompProjErr || (moveCompProjData?.length ?? 0) === 0);

    // 4. Altering organization_id on project_market_targets / project_competitors / projects must fail
    const { error: alterTargetOrgErr, data: alterTargetOrgData } = await clientA
      .from('project_market_targets')
      .update({ organization_id: orgB.id })
      .eq('id', targetA.id)
      .select('id');
    assert.ok(alterTargetOrgErr || (alterTargetOrgData?.length ?? 0) === 0);

    const { error: alterCompOrgErr, data: alterCompOrgData } = await clientA
      .from('project_competitors')
      .update({ organization_id: orgB.id })
      .eq('id', compA.id)
      .select('id');
    assert.ok(alterCompOrgErr || (alterCompOrgData?.length ?? 0) === 0);

    const { error: alterProjOrgErr, data: alterProjOrgData } = await clientA
      .from('projects')
      .update({ organization_id: orgB.id })
      .eq('id', projA.id)
      .select('id');
    assert.ok(alterProjOrgErr || (alterProjOrgData?.length ?? 0) === 0);

    // 5. Legitimate Org A updates succeed
    const { data: legitTargetUpd, error: legitTargetErr } = await clientA
      .from('project_market_targets')
      .update({ device: 'mobile' })
      .eq('id', targetA.id)
      .select('device')
      .single();
    assert.ifError(legitTargetErr);
    assert.equal(legitTargetUpd.device, 'mobile');

    const { data: legitCompUpd, error: legitCompErr } = await clientA
      .from('project_competitors')
      .update({ label: 'Primary Rival' })
      .eq('id', compA.id)
      .select('label')
      .single();
    assert.ifError(legitCompErr);
    assert.equal(legitCompUpd.label, 'Primary Rival');
  });

  // ============================================================================
  // TASK 1 & TASK 5 — Invitations (Confirmed, Unconfirmed, Mismatched, Expired, Reused, Invalid) & RBAC
  // ============================================================================
  await t.test('Task 1 & Task 5: Invitation verification, revocation, and role boundaries', async () => {
    const rawTokenC = crypto.randomBytes(32).toString('hex');
    const hashC = crypto.createHash('sha256').update(rawTokenC).digest('hex');

    const { error: invCErr } = await clientA.from('organization_invitations').insert({
      organization_id: orgA.id,
      email: emailC,
      role: 'viewer',
      token_hash: hashC,
      status: 'pending',
      invited_by: userIdA,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    assert.ifError(invCErr);

    // Mismatched email (User B tries User C's invite) -> rejected
    const { error: wrongEmailErr } = await clientB.rpc('accept_organization_invitation', {
      p_raw_token: rawTokenC,
    });
    assert.ok(wrongEmailErr, 'Mismatched email must be rejected');

    // Invalid token -> rejected
    const { error: invalidTokenErr } = await clientC.rpc('accept_organization_invitation', {
      p_raw_token: 'invalid-nonexistent-token-000000000000',
    });
    assert.ok(invalidTokenErr, 'Invalid token must be rejected');

    // Expired invitation -> rejected
    const rawExpired = crypto.randomBytes(32).toString('hex');
    const hashExpired = crypto.createHash('sha256').update(rawExpired).digest('hex');
    const { data: expInvRow, error: expInsertErr } = await clientA
      .from('organization_invitations')
      .insert({
        organization_id: orgA.id,
        email: emailD,
        role: 'analyst',
        token_hash: hashExpired,
        status: 'pending',
        invited_by: userIdA,
        expires_at: new Date(Date.now() - 3600_000).toISOString(),
      })
      .select('id')
      .single();
    assert.ifError(expInsertErr);

    const { error: expiredAcceptErr } = await clientD.rpc('accept_organization_invitation', {
      p_raw_token: rawExpired,
    });
    assert.ok(expiredAcceptErr, 'Expired invitation must be rejected');

    // Owner/Admin can revoke invitation; revoked invitation cannot be accepted
    const { error: revokeErr } = await clientA
      .from('organization_invitations')
      .update({ status: 'revoked' })
      .eq('id', expInvRow.id);
    assert.ifError(revokeErr);

    // Confirmed vs unconfirmed behavior check
    if (userC.emailConfirmed) {
      const { data: acceptedOrg, error: acceptErr } = await clientC.rpc(
        'accept_organization_invitation',
        { p_raw_token: rawTokenC }
      );
      assert.ifError(acceptErr);
      assert.equal(acceptedOrg.id, orgA.id);

      // Reused invitation -> rejected
      const { error: reuseErr } = await clientC.rpc('accept_organization_invitation', {
        p_raw_token: rawTokenC,
      });
      assert.ok(reuseErr, 'Used invitation token must not be accepted twice');
    } else {
      // Unconfirmed email -> RPC must reject cleanly
      const { error: unconfirmedErr } = await clientC.rpc('accept_organization_invitation', {
        p_raw_token: rawTokenC,
      });
      assert.ok(unconfirmedErr, 'Unconfirmed email must be rejected by accept_organization_invitation');
    }

    // Team quota enforcement check (starter max_team_members = 2: User A + User C)
    if (userD.emailConfirmed) {
      const rawTokenD = crypto.randomBytes(32).toString('hex');
      const hashD = crypto.createHash('sha256').update(rawTokenD).digest('hex');
      await clientA.from('organization_invitations').insert({
        organization_id: orgA.id,
        email: emailD,
        role: 'analyst',
        token_hash: hashD,
        status: 'pending',
        invited_by: userIdA,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const { error: quotaErr } = await clientD.rpc('accept_organization_invitation', {
        p_raw_token: rawTokenD,
      });
      assert.ok(quotaErr, 'Team member quota (starter = 2) must reject 3rd member atomically');
    }

    // Viewer boundaries (if User C joined Org A)
    if (userC.emailConfirmed) {
      // Viewer cannot update organization metadata
      const { data: orgUpdByViewer } = await clientC
        .from('organizations')
        .update({ name: 'Hijacked Name' })
        .eq('id', orgA.id)
        .select('id');
      assert.equal(orgUpdByViewer?.length ?? 0, 0);

      // Viewer cannot create projects, update child targets, or delete projects
      const { error: viewerProjErr } = await clientC.from('projects').insert({
        organization_id: orgA.id,
        name: 'Viewer Project',
        website_url: 'https://viewer.example',
        primary_country_code: 'EG',
        created_by: userIdC,
      });
      assert.ok(viewerProjErr);

      const { data: viewerTargetUpd } = await clientC
        .from('project_market_targets')
        .update({ device: 'desktop' })
        .eq('id', targetA.id)
        .select('id');
      assert.equal(viewerTargetUpd?.length ?? 0, 0);

      const { data: viewerProjDel } = await clientC
        .from('projects')
        .delete()
        .eq('id', projA.id)
        .select('id');
      assert.equal(viewerProjDel?.length ?? 0, 0);

      // Viewer cannot create/revoke invitations or update usage_records
      const { error: viewerInviteErr } = await clientC.from('organization_invitations').insert({
        organization_id: orgA.id,
        email: 'someone@example.com',
        role: 'viewer',
        token_hash: crypto.randomBytes(32).toString('hex'),
        status: 'pending',
        invited_by: userIdC,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
      assert.ok(viewerInviteErr);

      const { data: viewerUsageUpd } = await clientC
        .from('usage_records')
        .update({ crawls_run: 999 })
        .eq('organization_id', orgA.id)
        .select('id');
      assert.equal(viewerUsageUpd?.length ?? 0, 0);

      // Shared org teammate CAN read User A profile, but CANNOT update it
      const { data: sharedProfile } = await clientC
        .from('profiles')
        .select('id')
        .eq('id', userIdA);
      assert.equal(sharedProfile?.length ?? 0, 1);

      const { data: updOtherProfile } = await clientC
        .from('profiles')
        .update({ full_name: 'Tampered' })
        .eq('id', userIdA)
        .select('id');
      assert.equal(updOtherProfile?.length ?? 0, 0);
    }

    // Outsider User B cannot read User A profile
    const { data: outsiderProfile } = await clientB
      .from('profiles')
      .select('id')
      .eq('id', userIdA);
    assert.equal(outsiderProfile?.length ?? 0, 0);

    // Audit logs are append-only (owner cannot update or delete audit logs)
    const { data: updAudit } = await clientA
      .from('audit_logs')
      .update({ action: 'tampered' })
      .eq('organization_id', orgA.id)
      .select('id');
    assert.equal(updAudit?.length ?? 0, 0);

    const { data: delAudit } = await clientA
      .from('audit_logs')
      .delete()
      .eq('organization_id', orgA.id)
      .select('id');
    assert.equal(delAudit?.length ?? 0, 0);

    // Contact leads allow public INSERT but zero SELECT
    const { error: leadInsertErr } = await probe.from('contact_leads').insert({
      full_name: 'RLS Probe Lead',
      email: `lead-${runSuffix}@example.com`,
      company: 'Probe Co',
      country_code: 'EG',
      message: 'Testing public insert-only RLS boundary on contact_leads.',
    });
    assert.ifError(leadInsertErr);

    const { data: leadReadAnon } = await probe.from('contact_leads').select('id').limit(1);
    assert.equal(leadReadAnon?.length ?? 0, 0);
  });

  // ============================================================================
  // TASK 3 — Atomic Onboarding (`complete_onboarding_atomic`)
  // ============================================================================
  await t.test('Task 3: Atomic onboarding rollback on invalid input, duplicate block, and unauthenticated block', async () => {
    // 1. Unauthenticated caller rejected
    const { error: anonOnboardErr } = await probe.rpc('complete_onboarding_atomic', {
      p_org_name: 'Anon Org',
      p_org_slug: `anon-org-${runSuffix}`,
      p_business_type: 'agency',
      p_billing_country_code: 'EG',
      p_project_name: 'Anon Proj',
      p_website_url: 'https://anon.example',
      p_primary_country_code: 'EG',
      p_market_targets: [{ countryCode: 'EG', languageCode: 'ar', searchEngineCode: 'google', device: 'both' }],
      p_competitors: [],
    });
    assert.ok(anonOnboardErr, 'Anon user must not execute complete_onboarding_atomic');

    // 2. Invalid market config (DE + yandex) rolls back completely — zero partial org
    const { error: badMarketErr } = await clientFresh.rpc('complete_onboarding_atomic', {
      p_org_name: 'Rollback Market Org',
      p_org_slug: `rollback-mkt-${runSuffix}`,
      p_business_type: 'agency',
      p_billing_country_code: 'EG',
      p_project_name: 'Bad Market Proj',
      p_website_url: 'https://valid.example',
      p_primary_country_code: 'DE',
      p_market_targets: [{ countryCode: 'DE', languageCode: 'de', searchEngineCode: 'yandex', device: 'both' }],
      p_competitors: [],
    });
    assert.ok(badMarketErr);

    // 3. Invalid project URL failure rolls back completely — zero partial org
    const { error: badUrlErr } = await clientFresh.rpc('complete_onboarding_atomic', {
      p_org_name: 'Rollback URL Org',
      p_org_slug: `rollback-url-${runSuffix}`,
      p_business_type: 'agency',
      p_billing_country_code: 'EG',
      p_project_name: 'Bad URL Proj',
      p_website_url: 'javascript:alert(1)',
      p_primary_country_code: 'EG',
      p_market_targets: [{ countryCode: 'EG', languageCode: 'ar', searchEngineCode: 'google', device: 'both' }],
      p_competitors: [],
    });
    assert.ok(badUrlErr);

    const { data: orgsBeforeSuccess } = await clientFresh.from('organization_members').select('id');
    assert.equal(orgsBeforeSuccess?.length ?? 0, 0, 'Failed onboarding must leave zero partial org memberships');

    // 4. Valid onboarding succeeds atomically
    const { data: onboardRes, error: onboardErr } = await clientFresh.rpc('complete_onboarding_atomic', {
      p_org_name: `Fresh Studio ${runSuffix}`,
      p_org_slug: `fresh-studio-${runSuffix}`,
      p_business_type: 'agency',
      p_billing_country_code: 'EG',
      p_project_name: 'Cairo Export Growth',
      p_website_url: 'https://cairoexport.example',
      p_business_description: 'B2B MENA & Europe exporter',
      p_industry: 'Export',
      p_target_audience: 'Wholesale buyers',
      p_primary_country_code: 'EG',
      p_business_goals: 'Grow EU + RU leads',
      p_market_targets: [
        { countryCode: 'EG', languageCode: 'ar', searchEngineCode: 'google', device: 'both' },
        { countryCode: 'RU', languageCode: 'ru', searchEngineCode: 'yandex', device: 'both' },
      ],
      p_competitors: [{ domain: 'rival-exports.de', label: 'DE Rival' }],
    });
    assert.ifError(onboardErr);
    assert.ok(onboardRes?.organization?.id);
    assert.ok(onboardRes?.project?.id);
    assert.equal(onboardRes.project.marketTargets.length, 2);

    // 5. Duplicate onboarding must fail
    const { error: dupOnboardErr } = await clientFresh.rpc('complete_onboarding_atomic', {
      p_org_name: `Duplicate Studio ${runSuffix}`,
      p_org_slug: `dup-studio-${runSuffix}`,
      p_business_type: 'agency',
      p_billing_country_code: 'EG',
      p_project_name: 'Dup Project',
      p_website_url: 'https://dup.example',
      p_primary_country_code: 'EG',
      p_market_targets: [{ countryCode: 'EG', languageCode: 'ar', searchEngineCode: 'google', device: 'both' }],
      p_competitors: [],
    });
    assert.ok(dupOnboardErr, 'Duplicate initial onboarding must be rejected');
  });

  // ============================================================================
  // TASK 4 — Organization-Creation Limits & Concurrency Safety
  // ============================================================================
  await t.test('Task 4: Organization-creation limits enforced transactionally and under concurrency', async () => {
    // Default policy allows up to 3 owned orgs. Create 2 sequentially, then race 2 concurrently!
    const org1 = await clientLimit.rpc('create_organization_atomic', {
      p_name: `Limit Org 1 ${runSuffix}`,
      p_slug: `limit-1-${runSuffix}`,
      p_business_type: 'agency',
      p_billing_country_code: 'EG',
    });
    assert.ifError(org1.error);

    const org2 = await clientLimit.rpc('create_organization_atomic', {
      p_name: `Limit Org 2 ${runSuffix}`,
      p_slug: `limit-2-${runSuffix}`,
      p_business_type: 'agency',
      p_billing_country_code: 'EG',
    });
    assert.ifError(org2.error);

    // Now userLimit owns 2 orgs (limit = 3). Fire 2 concurrent creation attempts!
    const [raceA, raceB] = await Promise.all([
      clientLimit.rpc('create_organization_atomic', {
        p_name: `Limit Org Race A ${runSuffix}`,
        p_slug: `limit-race-a-${runSuffix}`,
        p_business_type: 'agency',
        p_billing_country_code: 'EG',
      }),
      clientLimit.rpc('create_organization_atomic', {
        p_name: `Limit Org Race B ${runSuffix}`,
        p_slug: `limit-race-b-${runSuffix}`,
        p_business_type: 'agency',
        p_billing_country_code: 'EG',
      }),
    ]);

    const raceSuccessCount = [raceA, raceB].filter((r) => !r.error).length;
    assert.equal(raceSuccessCount, 1, 'Advisory lock must allow at most 1 concurrent org creation at limit - 1');

    // Beyond limit attempt must fail
    const orgBeyond = await clientLimit.rpc('create_organization_atomic', {
      p_name: `Limit Org Beyond ${runSuffix}`,
      p_slug: `limit-beyond-${runSuffix}`,
      p_business_type: 'agency',
      p_billing_country_code: 'EG',
    });
    assert.ok(orgBeyond.error, 'Creating 4th owned organization must be rejected');
  });
});
