import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isStrictEmailConfirmed } from './middleware/auth.ts';

const runSuffix = crypto.randomBytes(4).toString('hex');

interface IntegrationConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  serviceRoleKey: string;
  jwtSecret: string;
  preIssuedUnconfirmedToken: string;
}

interface AuthenticatedTestUser {
  client: SupabaseClient;
  userId: string;
  email: string;
  emailConfirmed: boolean;
}

interface SuiteDiagnostics {
  credentialsMissing: boolean;
  migration0001Missing: boolean;
  migration0002Missing: boolean;
  migration0003Missing: boolean;
  migration0004Missing: boolean;
  migration0005Missing: boolean;
  emailConfirmationPreventsSessionCreation: boolean;
  unconfirmedRpcTestMode:
    | 'signup_unconfirmed_session'
    | 'pre_issued_token'
    | 'isolated_admin_jwt'
    | 'skipped';
  executedTests: string[];
  skippedTests: Array<{ name: string; reason: string }>;
}

function resolveIntegrationConfig(): IntegrationConfig {
  return {
    supabaseUrl: (process.env.TEST_SUPABASE_URL || process.env.SUPABASE_URL || '').trim(),
    supabasePublishableKey: (
      process.env.TEST_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      ''
    ).trim(),
    serviceRoleKey: (process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    jwtSecret: (process.env.TEST_SUPABASE_JWT_SECRET || '').trim(),
    preIssuedUnconfirmedToken: (process.env.TEST_UNCONFIRMED_ACCESS_TOKEN || '').trim(),
  };
}

function createAuthedClient(
  supabaseUrl: string,
  publishableKey: string,
  accessToken: string
): SupabaseClient {
  return createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function signTestAuthenticatedJwt(
  jwtSecret: string,
  payload: { sub: string; email: string; expiresInSeconds?: number }
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + (payload.expiresInSeconds ?? 300);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      aud: 'authenticated',
      role: 'authenticated',
      sub: payload.sub,
      email: payload.email,
      iat: nowSec,
      exp: expSec,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function signUpTestUser(
  config: IntegrationConfig,
  email: string,
  password: string,
  fullName: string
): Promise<{
  user: AuthenticatedTestUser | null;
  unconfirmedSignupPreventedSession: boolean;
  reason: string | null;
}> {
  const anon = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await anon.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, preferred_locale: 'en' } },
  });

  if (error) {
    return {
      user: null,
      unconfirmedSignupPreventedSession: /confirm/i.test(error.message),
      reason: error.message,
    };
  }

  if (!data.session || !data.user) {
    return {
      user: null,
      unconfirmedSignupPreventedSession: true,
      reason:
        'Supabase email confirmation is enabled; signUp did not return an immediate authenticated session.',
    };
  }

  return {
    user: {
      client: createAuthedClient(
        config.supabaseUrl,
        config.supabasePublishableKey,
        data.session.access_token
      ),
      userId: data.user.id,
      email,
      emailConfirmed: isStrictEmailConfirmed(data.user),
    },
    unconfirmedSignupPreventedSession: false,
    reason: null,
  };
}

async function provisionConfirmedUserViaAdmin(
  adminClient: SupabaseClient,
  config: IntegrationConfig,
  email: string,
  password: string,
  fullName: string,
  createdAdminUsers: Array<{ id: string; email: string }>
): Promise<AuthenticatedTestUser | null> {
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, preferred_locale: 'en' },
  });
  if (createErr || !created.user) {
    return null;
  }
  createdAdminUsers.push({ id: created.user.id, email });

  const anon = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: signedIn, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signedIn.session || !signedIn.user) {
    return null;
  }

  return {
    client: createAuthedClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
      signedIn.session.access_token
    ),
    userId: signedIn.user.id,
    email,
    emailConfirmed: isStrictEmailConfirmed(signedIn.user),
  };
}

function logDiagnostics(t: test.TestContext, diagnostics: SuiteDiagnostics): void {
  const summary = JSON.stringify(diagnostics, null, 2);
  t.diagnostic(`[EL MATBA5 RLS Diagnostics]\n${summary}`);
  console.info(`[EL MATBA5 RLS Diagnostics] ${JSON.stringify(diagnostics)}`);
}

function skipOrFailInCi(context: test.TestContext, reason: string): void {
  if (process.env.CI === 'true') {
    throw new Error(`CI must execute the live PostgreSQL/RLS suite; skip is not allowed: ${reason}`);
  }
  context.skip(reason);
}

test('PostgreSQL RLS, Security Hardening & Strict Email Confirmation Suite', async (t) => {
  const config = resolveIntegrationConfig();
  const diagnostics: SuiteDiagnostics = {
    credentialsMissing: !config.supabaseUrl || !config.supabasePublishableKey,
    migration0001Missing: false,
    migration0002Missing: false,
    migration0003Missing: false,
    migration0004Missing: false,
    migration0005Missing: false,
    emailConfirmationPreventsSessionCreation: false,
    unconfirmedRpcTestMode: 'skipped',
    executedTests: [],
    skippedTests: [],
  };

  if (diagnostics.credentialsMissing) {
    const reason =
      'Missing SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY (or TEST_SUPABASE_URL/TEST_SUPABASE_PUBLISHABLE_KEY) in test environment.';
    diagnostics.skippedTests.push({ name: 'all_live_rls_tests', reason });
    logDiagnostics(t, diagnostics);
    skipOrFailInCi(t, reason);
    return;
  }

  if (config.serviceRoleKey.startsWith('sb_secret_') && config.serviceRoleKey.length < 16) {
    skipOrFailInCi(t, 'Invalid TEST_SUPABASE_SERVICE_ROLE_KEY configuration.');
    return;
  }

  const probe = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // 1. Probe Migration 0001
  const { error: schema0001Error } = await probe.from('plans').select('id').limit(1);
  if (schema0001Error) {
    diagnostics.migration0001Missing = true;
    diagnostics.migration0002Missing = true;
    diagnostics.migration0003Missing = true;
    diagnostics.migration0004Missing = true;
    diagnostics.migration0005Missing = true;
    const reason = `Migration 0001_initial_schema.sql not applied (${schema0001Error.message}).`;
    diagnostics.skippedTests.push({ name: 'all_live_rls_tests', reason });
    logDiagnostics(t, diagnostics);
    skipOrFailInCi(t, reason);
    return;
  }

  const adminClient = config.serviceRoleKey
    ? createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;

  const createdOrgIds = new Set<string>();
  const createdAdminUsers: Array<{ id: string; email: string }> = [];
  const createdLeadEmail = `lead-${runSuffix}@example.com`;
  const pass = 'Matba5RlsTest!2026';

  const emailA = `rls-user-a-${runSuffix}@example.com`;
  const emailB = `rls-user-b-${runSuffix}@example.com`;
  const emailC = `rls-viewer-c-${runSuffix}@example.com`;
  const emailD = `rls-analyst-d-${runSuffix}@example.com`;
  const emailFresh = `rls-onboard-${runSuffix}@example.com`;
  const emailLimit = `rls-limit-${runSuffix}@example.com`;

  let userA: AuthenticatedTestUser | null = null;
  let userB: AuthenticatedTestUser | null = null;
  let userC: AuthenticatedTestUser | null = null;
  let userD: AuthenticatedTestUser | null = null;
  let userFresh: AuthenticatedTestUser | null = null;
  let userLimit: AuthenticatedTestUser | null = null;
  let unconfirmedUser: AuthenticatedTestUser | null = null;
  let projAId: string | null = null;
  let projBId: string | null = null;

  try {
    // 2. Provision authenticated test identities
    const signupA = await signUpTestUser(config, emailA, pass, 'User A Owner');
    if (signupA.unconfirmedSignupPreventedSession) {
      diagnostics.emailConfirmationPreventsSessionCreation = true;
    }

    if (signupA.user) {
      userA = signupA.user;
      const [sB, sC, sD, sFresh, sLimit] = await Promise.all([
        signUpTestUser(config, emailB, pass, 'User B Attacker'),
        signUpTestUser(config, emailC, pass, 'User C Viewer'),
        signUpTestUser(config, emailD, pass, 'User D Analyst'),
        signUpTestUser(config, emailFresh, pass, 'User Fresh Onboarding'),
        signUpTestUser(config, emailLimit, pass, 'User Org Limit'),
      ]);
      userB = sB.user;
      userC = sC.user;
      userD = sD.user;
      userFresh = sFresh.user;
      userLimit = sLimit.user;
    } else if (adminClient) {
      // Isolated test environment fallback when GoTrue requires email confirmation on signUp
      const [aA, aB, aC, aD, aFresh, aLimit] = await Promise.all([
        provisionConfirmedUserViaAdmin(adminClient, config, emailA, pass, 'User A Owner', createdAdminUsers),
        provisionConfirmedUserViaAdmin(adminClient, config, emailB, pass, 'User B Attacker', createdAdminUsers),
        provisionConfirmedUserViaAdmin(adminClient, config, emailC, pass, 'User C Viewer', createdAdminUsers),
        provisionConfirmedUserViaAdmin(adminClient, config, emailD, pass, 'User D Analyst', createdAdminUsers),
        provisionConfirmedUserViaAdmin(adminClient, config, emailFresh, pass, 'User Fresh Onboarding', createdAdminUsers),
        provisionConfirmedUserViaAdmin(adminClient, config, emailLimit, pass, 'User Org Limit', createdAdminUsers),
      ]);
      userA = aA;
      userB = aB;
      userC = aC;
      userD = aD;
      userFresh = aFresh;
      userLimit = aLimit;
    } else {
      const reason =
        signupA.reason ??
        'Email confirmation prevented test-session creation and no isolated TEST_SUPABASE_SERVICE_ROLE_KEY was provided.';
      diagnostics.skippedTests.push({ name: 'all_authenticated_rls_tests', reason });
      logDiagnostics(t, diagnostics);
      skipOrFailInCi(t, reason);
      return;
    }

    if (!userA || !userB || !userC || !userD || !userFresh || !userLimit) {
      const reason = 'Failed to establish authenticated non-privileged sessions for all test identities.';
      diagnostics.skippedTests.push({ name: 'all_authenticated_rls_tests', reason });
      logDiagnostics(t, diagnostics);
      skipOrFailInCi(t, reason);
      return;
    }

    // 3. Establish an authenticated user with STRICTLY unconfirmed email (`email_confirmed_at IS NULL`)
    if (!userC.emailConfirmed) {
      unconfirmedUser = userC;
      diagnostics.unconfirmedRpcTestMode = 'signup_unconfirmed_session';
    } else if (config.preIssuedUnconfirmedToken) {
      const { data: tokenUserData, error: tokenUserErr } = await probe.auth.getUser(
        config.preIssuedUnconfirmedToken
      );
      if (!tokenUserErr && tokenUserData.user && !isStrictEmailConfirmed(tokenUserData.user) && tokenUserData.user.email) {
        unconfirmedUser = {
          client: createAuthedClient(
            config.supabaseUrl,
            config.supabasePublishableKey,
            config.preIssuedUnconfirmedToken
          ),
          userId: tokenUserData.user.id,
          email: tokenUserData.user.email,
          emailConfirmed: false,
        };
        diagnostics.unconfirmedRpcTestMode = 'pre_issued_token';
      }
    } else if (adminClient && config.jwtSecret) {
      const unconfEmail = `rls-unconf-${runSuffix}@example.com`;
      const { data: createdUnconf, error: unconfCreateErr } = await adminClient.auth.admin.createUser({
        email: unconfEmail,
        password: pass,
        email_confirm: false,
        user_metadata: { full_name: 'Unconfirmed Invitee', preferred_locale: 'en' },
      });
      if (!unconfCreateErr && createdUnconf.user && !isStrictEmailConfirmed(createdUnconf.user)) {
        createdAdminUsers.push({ id: createdUnconf.user.id, email: unconfEmail });
        const unconfJwt = signTestAuthenticatedJwt(config.jwtSecret, {
          sub: createdUnconf.user.id,
          email: unconfEmail,
        });
        unconfirmedUser = {
          client: createAuthedClient(config.supabaseUrl, config.supabasePublishableKey, unconfJwt),
          userId: createdUnconf.user.id,
          email: unconfEmail,
          emailConfirmed: false,
        };
        diagnostics.unconfirmedRpcTestMode = 'isolated_admin_jwt';
      }
    }

    // 4. Probe Migrations 0002, 0003, 0004, and 0005 independently
    // NOTE: Migration 0004 revokes authenticated EXECUTE from max_owned_organizations_default(),
    // so 0002 is probed via resolve_market_target_meta (granted to authenticated in 0002 & 0004),
    // and 0004 is verified when max_owned_organizations_default rejects authenticated with 42501.
    const [
      { error: migration0002Err },
      { error: migration0003Err },
      { error: maxOwnedPermErr },
      { data: migration0005Ready, error: migration0005Err },
    ] = await Promise.all([
      userA.client.rpc('resolve_market_target_meta', {
        p_country_code: 'EG',
        p_language_code: 'ar',
        p_search_engine_code: 'google',
      }),
      userA.client.rpc('phase_2a1_1_strict_email_confirmation_ready'),
      userA.client.rpc('max_owned_organizations_default'),
      userA.client.rpc('phase_2a3_security_perf_ready'),
    ]);
    diagnostics.migration0002Missing = Boolean(migration0002Err);
    diagnostics.migration0003Missing = Boolean(migration0003Err);
    diagnostics.migration0004Missing = !maxOwnedPermErr;
    diagnostics.migration0005Missing = Boolean(migration0005Err) || migration0005Ready !== true;

    // Bind non-null references for TypeScript closures inside subtests
    const clientA = userA.client;
    const userIdA = userA.userId;
    const clientB = userB.client;
    const userIdB = userB.userId;
    const clientC = userC.client;
    const userIdC = userC.userId;
    const userCConfirmed = userC.emailConfirmed;
    const clientD = userD.client;
    const userDConfirmed = userD.emailConfirmed;
    const clientFresh = userFresh.client;
    const clientLimit = userLimit.client;

    // Bootstrap baseline Org A, Org B, Projects, Targets, and Competitors
    const { data: orgA, error: orgAErr } = await clientA.rpc('create_organization_atomic', {
      p_name: `Org A ${runSuffix}`,
      p_slug: `org-a-${runSuffix}`,
      p_business_type: 'agency',
      p_billing_country_code: 'EG',
    });
    assert.ifError(orgAErr);
    assert.ok(orgA?.id);
    createdOrgIds.add(orgA.id);

    const { data: orgB, error: orgBErr } = await clientB.rpc('create_organization_atomic', {
      p_name: `Org B ${runSuffix}`,
      p_slug: `org-b-${runSuffix}`,
      p_business_type: 'business',
      p_billing_country_code: 'DE',
    });
    assert.ifError(orgBErr);
    assert.ok(orgB?.id);
    createdOrgIds.add(orgB.id);

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
    projAId = projA.id;

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
    projBId = projB.id;

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

    // =========================================================================
    // SUBTEST 1 — Base Cross-Org Isolation & 0002 Child-Table UPDATE RLS
    // =========================================================================
    await t.test('Cross-org tenant isolation (0001)', async () => {
      const { data: readOrgB } = await clientA.from('organizations').select('*').eq('id', orgB.id);
      assert.equal(readOrgB?.length ?? 0, 0);

      const { data: readProjA } = await clientB.from('projects').select('*').eq('id', projA.id);
      assert.equal(readProjA?.length ?? 0, 0);

      const { data: readTargetsA } = await clientB
        .from('project_market_targets')
        .select('*')
        .eq('id', targetA.id);
      assert.equal(readTargetsA?.length ?? 0, 0);

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

      diagnostics.executedTests.push('Cross-org tenant isolation (0001)');
    });

    await t.test('Child-table UPDATE RLS & cross-org move prevention (0002)', async (sub) => {
      if (diagnostics.migration0002Missing) {
        const reason = 'Migration 0002_phase_2a1_security_hardening.sql is missing.';
        diagnostics.skippedTests.push({
          name: 'Child-table UPDATE RLS & cross-org move prevention (0002)',
          reason,
        });
        skipOrFailInCi(sub, reason);
        return;
      }

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

      diagnostics.executedTests.push('Child-table UPDATE RLS & cross-org move prevention (0002)');
    });

    // =========================================================================
    // SUBTEST 2 — Invitation Acceptance (Confirmed, Mismatch, Expired, Reused, Invalid, Quota)
    // =========================================================================
    await t.test('Invitation mismatched, invalid, expired, revoked, confirmed & single-use checks', async () => {
      const rawTokenC = crypto.randomBytes(32).toString('hex');
      const hashC = crypto.createHash('sha256').update(rawTokenC).digest('hex');

      // Use uppercase email to assert case-insensitive matching for confirmed invitee
      const { error: invCErr } = await clientA.from('organization_invitations').insert({
        organization_id: orgA.id,
        email: emailC.toUpperCase(),
        role: 'viewer',
        token_hash: hashC,
        status: 'pending',
        invited_by: userIdA,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
      assert.ifError(invCErr);

      // Mismatched email (User B tries User C's invite)
      const { error: wrongEmailErr } = await clientB.rpc('accept_organization_invitation', {
        p_raw_token: rawTokenC,
      });
      assert.ok(wrongEmailErr, 'Mismatched email must be rejected');

      // Invalid token
      const { error: invalidTokenErr } = await clientC.rpc('accept_organization_invitation', {
        p_raw_token: 'invalid-nonexistent-token-000000000000',
      });
      assert.ok(invalidTokenErr, 'Invalid token must be rejected');

      // Expired invitation
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

      // Revoked invitation
      const { error: revokeErr } = await clientA
        .from('organization_invitations')
        .update({ status: 'revoked' })
        .eq('id', expInvRow.id);
      assert.ifError(revokeErr);

      const { error: revokedAcceptErr } = await clientD.rpc('accept_organization_invitation', {
        p_raw_token: rawExpired,
      });
      assert.ok(revokedAcceptErr, 'Revoked invitation must be rejected');

      // Confirmed user with matching email succeeds atomically and consumes token single-use
      if (userCConfirmed) {
        const { data: acceptedOrg, error: acceptErr } = await clientC.rpc(
          'accept_organization_invitation',
          { p_raw_token: rawTokenC }
        );
        assert.ifError(acceptErr);
        assert.equal(acceptedOrg.id, orgA.id);

        const { error: reuseErr } = await clientC.rpc('accept_organization_invitation', {
          p_raw_token: rawTokenC,
        });
        assert.ok(reuseErr, 'Used invitation token must not be accepted twice');
      }

      // Starter team-member quota enforcement (max_team_members = 2: User A + User C)
      if (userCConfirmed && userDConfirmed) {
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

      diagnostics.executedTests.push(
        'Invitation mismatched, invalid, expired, revoked, confirmed & single-use checks'
      );
    });

    // =========================================================================
    // SUBTEST 3 — Authenticated Unconfirmed User Reaching Real PostgreSQL RPC (0003)
    // =========================================================================
    await t.test(
      'Strict email_confirmed_at rejection in real PostgreSQL accept_organization_invitation RPC (0003)',
      async (sub) => {
        const testName =
          'Strict email_confirmed_at rejection in real PostgreSQL accept_organization_invitation RPC (0003)';

        if (diagnostics.migration0003Missing) {
          const reason = 'Migration 0003_strict_email_confirmation.sql is missing.';
          diagnostics.skippedTests.push({ name: testName, reason });
          skipOrFailInCi(sub, reason);
          return;
        }

        if (!unconfirmedUser) {
          const reason = config.serviceRoleKey
            ? 'TEST_SUPABASE_SERVICE_ROLE_KEY is present without TEST_SUPABASE_JWT_SECRET (or TEST_UNCONFIRMED_ACCESS_TOKEN); cannot mint non-privileged authenticated JWT for email_confirmed_at IS NULL.'
            : 'Auto-confirm issued confirmed sessions for signUp; provide TEST_UNCONFIRMED_ACCESS_TOKEN or isolated TEST_SUPABASE_SERVICE_ROLE_KEY + TEST_SUPABASE_JWT_SECRET to run real unconfirmed-email PostgreSQL RPC check.';
          diagnostics.skippedTests.push({ name: testName, reason });
          skipOrFailInCi(sub, reason);
          return;
        }

        const rawUnconfToken = crypto.randomBytes(32).toString('hex');
        const hashUnconfToken = crypto.createHash('sha256').update(rawUnconfToken).digest('hex');

        const { data: unconfInviteRow, error: unconfInviteInsertErr } = await clientA
          .from('organization_invitations')
          .insert({
            organization_id: orgA.id,
            email: unconfirmedUser.email,
            role: 'analyst',
            token_hash: hashUnconfToken,
            status: 'pending',
            invited_by: userIdA,
            expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          })
          .select('id')
          .single();
        assert.ifError(unconfInviteInsertErr);

        const { data: rpcRes, error: unconfRpcErr } = await unconfirmedUser.client.rpc(
          'accept_organization_invitation',
          { p_raw_token: rawUnconfToken }
        );

        assert.equal(rpcRes, null);
        assert.ok(unconfRpcErr, 'Real PostgreSQL RPC must reject authenticated user with email_confirmed_at IS NULL');
        assert.match(unconfRpcErr.message, /confirmed/i);

        // Verify zero side effects: invitation remains pending & user is not inserted into organization_members
        const { data: inviteAfter, error: inviteReadErr } = await clientA
          .from('organization_invitations')
          .select('status, accepted_by')
          .eq('id', unconfInviteRow.id)
          .single();
        assert.ifError(inviteReadErr);
        assert.equal(inviteAfter.status, 'pending');
        assert.equal(inviteAfter.accepted_by, null);

        const { data: membershipAfter, error: membershipReadErr } = await clientA
          .from('organization_members')
          .select('id')
          .eq('organization_id', orgA.id)
          .eq('user_id', unconfirmedUser.userId);
        assert.ifError(membershipReadErr);
        assert.equal(membershipAfter?.length ?? 0, 0);

        diagnostics.executedTests.push(testName);
      }
    );

    // =========================================================================
    // SUBTEST 4 — Role Boundaries, Profile Privacy, Audit Immutability & Contact Leads
    // =========================================================================
    await t.test('Role boundaries, profile privacy, audit log immutability, and contact leads', async () => {
      if (userCConfirmed) {
        const { data: orgUpdByViewer } = await clientC
          .from('organizations')
          .update({ name: 'Hijacked Name' })
          .eq('id', orgA.id)
          .select('id');
        assert.equal(orgUpdByViewer?.length ?? 0, 0);

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

      const { data: outsiderProfile } = await clientB
        .from('profiles')
        .select('id')
        .eq('id', userIdA);
      assert.equal(outsiderProfile?.length ?? 0, 0);

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

      const { error: leadInsertErr } = await probe.from('contact_leads').insert({
        full_name: 'RLS Probe Lead',
        email: createdLeadEmail,
        company: 'Probe Co',
        country_code: 'EG',
        message: 'Testing public insert-only RLS boundary on contact_leads.',
      });
      assert.ifError(leadInsertErr);

      const { data: leadReadAnon } = await probe.from('contact_leads').select('id').limit(1);
      assert.equal(leadReadAnon?.length ?? 0, 0);

      diagnostics.executedTests.push(
        'Role boundaries, profile privacy, audit log immutability, and contact leads'
      );
    });

    // =========================================================================
    // SUBTEST 5 — Atomic Onboarding Rollback & Duplicate Guard (0002)
    // =========================================================================
    await t.test('Atomic onboarding rollback on invalid input & duplicate guard (0002)', async (sub) => {
      const testName = 'Atomic onboarding rollback on invalid input & duplicate guard (0002)';
      if (diagnostics.migration0002Missing) {
        const reason = 'Migration 0002_phase_2a1_security_hardening.sql is missing.';
        diagnostics.skippedTests.push({ name: testName, reason });
        skipOrFailInCi(sub, reason);
        return;
      }

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
      assert.equal(orgsBeforeSuccess?.length ?? 0, 0, 'Failed onboarding must leave zero partial memberships');

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
      createdOrgIds.add(onboardRes.organization.id);
      assert.ok(onboardRes?.project?.id);
      assert.equal(onboardRes.project.marketTargets.length, 2);

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

      diagnostics.executedTests.push(testName);
    });

    // =========================================================================
    // SUBTEST 6 — Organization-Creation Limits & Concurrency Safety (0002)
    // =========================================================================
    await t.test('Organization-creation limits enforced transactionally and under concurrency (0002)', async (sub) => {
      const testName = 'Organization-creation limits enforced transactionally and under concurrency (0002)';
      if (diagnostics.migration0002Missing) {
        const reason = 'Migration 0002_phase_2a1_security_hardening.sql is missing.';
        diagnostics.skippedTests.push({ name: testName, reason });
        skipOrFailInCi(sub, reason);
        return;
      }

      const org1 = await clientLimit.rpc('create_organization_atomic', {
        p_name: `Limit Org 1 ${runSuffix}`,
        p_slug: `limit-1-${runSuffix}`,
        p_business_type: 'agency',
        p_billing_country_code: 'EG',
      });
      assert.ifError(org1.error);
      if (org1.data?.id) createdOrgIds.add(org1.data.id);

      const org2 = await clientLimit.rpc('create_organization_atomic', {
        p_name: `Limit Org 2 ${runSuffix}`,
        p_slug: `limit-2-${runSuffix}`,
        p_business_type: 'agency',
        p_billing_country_code: 'EG',
      });
      assert.ifError(org2.error);
      if (org2.data?.id) createdOrgIds.add(org2.data.id);

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

      for (const r of [raceA, raceB]) {
        if (!r.error && r.data?.id) createdOrgIds.add(r.data.id);
      }

      const raceSuccessCount = [raceA, raceB].filter((r) => !r.error).length;
      assert.equal(raceSuccessCount, 1, 'Advisory lock must allow at most 1 concurrent org creation at limit - 1');

      const orgBeyond = await clientLimit.rpc('create_organization_atomic', {
        p_name: `Limit Org Beyond ${runSuffix}`,
        p_slug: `limit-beyond-${runSuffix}`,
        p_business_type: 'agency',
        p_billing_country_code: 'EG',
      });
      assert.ok(orgBeyond.error, 'Creating 4th owned organization must be rejected');

      diagnostics.executedTests.push(testName);
    });

    // =========================================================================
    // SUBTEST 7 — Function Permission Boundaries (0004)
    // =========================================================================
    await t.test('Function EXECUTE permission boundaries deny anon and internal helpers (0004)', async (sub) => {
      const testName = 'Function EXECUTE permission boundaries deny anon and internal helpers (0004)';
      if (diagnostics.migration0004Missing) {
        const reason = 'Migration 0004_function_permission_hardening.sql is missing.';
        diagnostics.skippedTests.push({ name: testName, reason });
        skipOrFailInCi(sub, reason);
        return;
      }

      // Anon role must NOT execute application RPCs or RLS helpers
      const [anonCreateOrg, anonIsMember, anonHasRole, anonCanView, anonResolve, anonStrictReady] =
        await Promise.all([
          probe.rpc('create_organization_atomic', {
            p_name: 'Anon Forbidden',
            p_slug: `anon-forbidden-${runSuffix}`,
            p_business_type: 'agency',
            p_billing_country_code: 'EG',
          }),
          probe.rpc('is_org_member', { p_org_id: orgA.id }),
          probe.rpc('has_org_role', { p_org_id: orgA.id, p_roles: ['owner'] }),
          probe.rpc('can_view_profile', { p_profile_id: userIdA }),
          probe.rpc('resolve_market_target_meta', {
            p_country_code: 'EG',
            p_language_code: 'ar',
            p_search_engine_code: 'google',
          }),
          probe.rpc('phase_2a1_1_strict_email_confirmation_ready'),
        ]);

      assert.ok(anonCreateOrg.error, 'anon must be denied create_organization_atomic');
      assert.ok(anonIsMember.error, 'anon must be denied is_org_member');
      assert.ok(anonHasRole.error, 'anon must be denied has_org_role');
      assert.ok(anonCanView.error, 'anon must be denied can_view_profile');
      assert.ok(anonResolve.error, 'anon must be denied resolve_market_target_meta');
      assert.ok(anonStrictReady.error, 'anon must be denied phase_2a1_1_strict_email_confirmation_ready');

      // Authenticated role must NOT execute internal/trigger helpers
      const [
        authMaxOrgs,
        authHandleUser,
        authCrossOrgTrigger,
        authIsMember,
        authHasRole,
        authCanView,
      ] = await Promise.all([
        clientA.rpc('max_owned_organizations_default'),
        clientA.rpc('handle_new_user'),
        clientA.rpc('prevent_cross_org_reassignment'),
        clientA.rpc('is_org_member', { p_org_id: orgA.id }),
        clientA.rpc('has_org_role', { p_org_id: orgA.id, p_roles: ['owner'] }),
        clientA.rpc('can_view_profile', { p_profile_id: userIdA }),
      ]);

      assert.ok(authMaxOrgs.error, 'authenticated must be denied max_owned_organizations_default');
      assert.ok(authHandleUser.error, 'authenticated must be denied handle_new_user');
      assert.ok(authCrossOrgTrigger.error, 'authenticated must be denied prevent_cross_org_reassignment');
      assert.ok(authIsMember.error, 'RLS-only is_org_member helper must not be exposed as a public RPC');
      assert.ok(authHasRole.error, 'RLS-only has_org_role helper must not be exposed as a public RPC');
      assert.ok(authCanView.error, 'RLS-only can_view_profile helper must not be exposed as a public RPC');

      diagnostics.executedTests.push(testName);
    });

    // =========================================================================
    // SUBTEST 8 — Phase 2A.3 Billing, Usage, Invite, Profile & Quota Hardening (0005)
    // =========================================================================
    await t.test(
      'Phase 2A.3 billing/usage/invite/profile immutability and concurrent project quota enforcement (0005)',
      async (sub) => {
        const testName =
          'Phase 2A.3 billing/usage/invite/profile immutability and concurrent project quota enforcement (0005)';
        if (diagnostics.migration0005Missing) {
          const reason = 'Migration 0005_phase_2a3_security_and_performance.sql is missing.';
          diagnostics.skippedTests.push({ name: testName, reason });
          skipOrFailInCi(sub, reason);
          return;
        }

        // 1. Owner/Admin cannot self-upgrade plan_id or subscription_status directly
        const { error: planTamperErr } = await clientA
          .from('organizations')
          .update({ plan_id: 'agency', subscription_status: 'active' })
          .eq('id', orgA.id);
        assert.ok(planTamperErr, 'Owner must not self-upgrade organization plan_id or subscription_status');

        // 2. Client cannot insert or reset metered usage_records
        const { error: usageResetErr, data: usageResetData } = await clientA
          .from('usage_records')
          .update({ ai_credits_used: 0, crawls_run: 0 })
          .eq('organization_id', orgA.id)
          .select('id');
        assert.ok(usageResetErr || (usageResetData?.length ?? 0) === 0, 'Client must not reset usage_records');

        // 3. Authenticated user cannot spoof profiles.email or profiles.id on INSERT, UPSERT, or UPDATE
        const { error: profileInsertEmailSpoofErr } = await clientA.from('profiles').insert({
          id: userIdA,
          email: 'spoofed-insert@example.com',
          full_name: 'Spoof Insert',
          preferred_locale: 'en',
        });
        assert.ok(
          profileInsertEmailSpoofErr,
          'Authenticated user must not insert profile with spoofed email'
        );
        assert.match(
          profileInsertEmailSpoofErr.message,
          /email/i,
          'BEFORE INSERT trigger must reject spoofed email explicitly'
        );

        const { error: profileInsertOtherUserErr } = await clientA.from('profiles').insert({
          id: crypto.randomUUID(),
          email: 'other-user@example.com',
          full_name: 'Other User',
          preferred_locale: 'en',
        });
        assert.ok(
          profileInsertOtherUserErr,
          'Authenticated user must not insert a profile belonging to another user id'
        );

        const { error: profileUpsertSpoofErr } = await clientA.from('profiles').upsert(
          {
            id: userIdA,
            email: 'spoofed-upsert@example.com',
            full_name: 'Spoof Upsert',
            preferred_locale: 'en',
          },
          { onConflict: 'id' }
        );
        assert.ok(profileUpsertSpoofErr, 'Authenticated user must not spoof email via upsert');

        const { error: profileEmailSpoofErr } = await clientA
          .from('profiles')
          .update({ email: 'spoofed-ceo@example.com' })
          .eq('id', userIdA);
        assert.ok(profileEmailSpoofErr, 'Authenticated user must not alter profiles.email directly');

        // Legitimate same-email upsert (ensureUserProfile compatibility) and locale update succeed
        const { error: legitProfileUpsertErr } = await clientA
          .from('profiles')
          .upsert(
            {
              id: userIdA,
              email: emailA.toLowerCase(),
              full_name: 'User A Owner',
              preferred_locale: 'en',
            },
            { onConflict: 'id' }
          )
          .select('id')
          .single();
        assert.ifError(legitProfileUpsertErr);

        const { data: localeUpdated, error: localeUpdErr } = await clientA
          .from('profiles')
          .update({ preferred_locale: 'ar' })
          .eq('id', userIdA)
          .select('preferred_locale')
          .single();
        assert.ifError(localeUpdErr);
        assert.equal(localeUpdated.preferred_locale, 'ar');

        await clientA.from('profiles').update({ preferred_locale: 'en' }).eq('id', userIdA);

        // 4. Member cannot insert unattributed (actor_user_id: null) audit_logs directly
        const { error: nullActorAuditErr } = await clientA.from('audit_logs').insert({
          organization_id: orgA.id,
          actor_user_id: null,
          action: 'spoofed.system.event',
          entity_type: 'organization',
          entity_id: orgA.id,
        });
        assert.ok(nullActorAuditErr, 'Client must not insert null-actor audit_logs entries');

        // 5. Invitation updates restricted strictly to pending -> revoked; immutable token/email
        const rawInvToken = crypto.randomBytes(32).toString('hex');
        const hashInvToken = crypto.createHash('sha256').update(rawInvToken).digest('hex');
        const { data: invRow, error: invCreateErr } = await clientA
          .from('organization_invitations')
          .insert({
            organization_id: orgA.id,
            email: `invite-lock-${runSuffix}@example.com`,
            role: 'viewer',
            token_hash: hashInvToken,
            status: 'pending',
            invited_by: userIdA,
            expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          })
          .select('id')
          .single();
        assert.ifError(invCreateErr);

        const { error: invRoleTamperErr } = await clientA
          .from('organization_invitations')
          .update({ role: 'admin' })
          .eq('id', invRow.id);
        assert.ok(invRoleTamperErr, 'Owner must not alter existing invitation role/metadata');

        const { error: legitRevokeErr } = await clientA
          .from('organization_invitations')
          .update({ status: 'revoked' })
          .eq('id', invRow.id);
        assert.ifError(legitRevokeErr);

        const { error: reopenRevokedErr } = await clientA
          .from('organization_invitations')
          .update({ status: 'pending' })
          .eq('id', invRow.id);
        assert.ok(reopenRevokedErr, 'Revoked invitation must not be reopened to pending');

        // 6. Concurrent project inserts enforce starter max_projects = 2 atomically (Org A already has projA = 1)
        const [projRace1, projRace2] = await Promise.all([
          clientA
            .from('projects')
            .insert({
              organization_id: orgA.id,
              name: 'Concurrent Project 2A',
              website_url: 'https://race-2a.example',
              primary_country_code: 'EG',
              created_by: userIdA,
            })
            .select('id')
            .single(),
          clientA
            .from('projects')
            .insert({
              organization_id: orgA.id,
              name: 'Concurrent Project 2B',
              website_url: 'https://race-2b.example',
              primary_country_code: 'EG',
              created_by: userIdA,
            })
            .select('id')
            .single(),
        ]);

        const projSuccessCount = [projRace1, projRace2].filter((r) => !r.error).length;
        assert.equal(
          projSuccessCount,
          1,
          'Starter plan max_projects = 2 must allow at most 1 of 2 concurrent inserts when 1 already exists'
        );

        // Clean up the newly inserted race winner so Org A remains clean
        for (const r of [projRace1, projRace2]) {
          if (!r.error && r.data?.id) {
            await clientA.from('projects').delete().eq('id', r.data.id);
          }
        }

        // 7. New 0005 trigger functions & catalog-verifying readiness RPC follow strict permissions
        const [
          authReadyRes,
          anonReadyErr,
          authQuotaTriggerErr,
          authProfileTriggerErr,
          authOrgTriggerErr,
          authInvTriggerErr,
        ] = await Promise.all([
          clientA.rpc('phase_2a3_security_perf_ready'),
          probe.rpc('phase_2a3_security_perf_ready'),
          clientA.rpc('enforce_project_quota_on_insert'),
          clientA.rpc('protect_profile_identity_fields'),
          clientA.rpc('protect_organization_immutable_fields'),
          clientA.rpc('protect_organization_invitation_integrity'),
        ]);
        assert.ifError(authReadyRes.error);
        assert.equal(
          authReadyRes.data,
          true,
          'phase_2a3_security_perf_ready() must verify all 0005 catalog objects and return true'
        );
        assert.ok(anonReadyErr.error, 'anon must be denied phase_2a3_security_perf_ready');
        assert.ok(authQuotaTriggerErr.error, 'authenticated must be denied enforce_project_quota_on_insert');
        assert.ok(authProfileTriggerErr.error, 'authenticated must be denied protect_profile_identity_fields');
        assert.ok(authOrgTriggerErr.error, 'authenticated must be denied protect_organization_immutable_fields');
        assert.ok(authInvTriggerErr.error, 'authenticated must be denied protect_organization_invitation_integrity');

        diagnostics.executedTests.push(testName);
      }
    );
  } finally {
    // Safe runSuffix-scoped cleanup — never touches any real customer data
    if (userA && projAId) {
      await userA.client.from('projects').delete().eq('id', projAId);
    }
    if (userB && projBId) {
      await userB.client.from('projects').delete().eq('id', projBId);
    }
    if (adminClient) {
      if (createdOrgIds.size > 0) {
        await adminClient.from('organizations').delete().in('id', Array.from(createdOrgIds));
      }
      await adminClient.from('contact_leads').delete().eq('email', createdLeadEmail);
      for (const testUser of createdAdminUsers) {
        if (testUser.email.endsWith('@example.com') && testUser.email.includes(runSuffix)) {
          await adminClient.auth.admin.deleteUser(testUser.id);
        }
      }
    }
    logDiagnostics(t, diagnostics);
  }
});
