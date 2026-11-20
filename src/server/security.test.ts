import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import express from 'express';
import http from 'node:http';
import { loadAndValidateEnv, parseTrustProxy } from './config/env.ts';
import {
  type AuthenticatedRequest,
  extractBearerToken,
  getValidatedOrgAccess,
  isStrictEmailConfirmed,
  isValidUuid,
} from './middleware/auth.ts';
import {
  createCorsMiddleware,
  InMemoryRateLimitStore,
  rateLimit,
  type RateLimitStore,
} from './middleware/security.ts';
import { createApiRouter } from './routes.ts';
import { ensureUserProfile } from './repositories/supabaseRepo.ts';
import { generateInviteToken, hashInviteToken, slugifyOrgName } from './security.ts';
import {
  acceptTeamInvitation,
  completeOnboardingAtomic,
  createTenantProject,
  HttpError,
} from './services/orgService.ts';

test('loadAndValidateEnv fails closed in production when required vars are missing or weak', () => {
  assert.throws(
    () =>
      loadAndValidateEnv({
        NODE_ENV: 'production',
        SUPABASE_URL: '',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ok',
        SESSION_SECRET: 'a_very_long_random_secret_over_32_characters_ok',
      }),
    /SUPABASE_URL/
  );

  assert.throws(
    () =>
      loadAndValidateEnv({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: '',
        SESSION_SECRET: 'a_very_long_random_secret_over_32_characters_ok',
      }),
    /SUPABASE_PUBLISHABLE_KEY/
  );

  assert.throws(
    () =>
      loadAndValidateEnv({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ok',
        SESSION_SECRET: 'short',
      }),
    /SESSION_SECRET/
  );
});

test('loadAndValidateEnv rejects accidental Supabase secret keys and legacy service_role JWTs in SUPABASE_PUBLISHABLE_KEY', () => {
  assert.throws(
    () =>
      loadAndValidateEnv({
        NODE_ENV: 'development',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_allow_this',
      }),
    /secret|service_role/i
  );

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role: 'service_role', iss: 'supabase' })).toString(
    'base64url'
  );
  const legacyServiceRoleJwt = `${header}.${payload}.fake_signature`;

  assert.throws(
    () =>
      loadAndValidateEnv({
        NODE_ENV: 'development',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: legacyServiceRoleJwt,
      }),
    /service_role/i
  );
});

test('parseTrustProxy defaults closed (false) and only enables proxy trust when explicitly configured', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('0'), false);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('true'), 1);
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  assert.throws(() => parseTrustProxy('all'), /Invalid TRUST_PROXY/);
});

test('Rate limiter ignores spoofed X-Forwarded-For headers when TRUST_PROXY is disabled', async () => {
  const env = loadAndValidateEnv({
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_only',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    APP_URL: 'https://app.elmatba5.com',
  });

  const store = new InMemoryRateLimitStore();
  const app = express();
  app.set('trust proxy', env.trustProxy);
  app.post('/limited', rateLimit(2, 60_000, { store }), (_req, res) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  try {
    const r1 = await fetch(`${baseUrl}/limited`, {
      method: 'POST',
      headers: { 'X-Forwarded-For': '198.51.100.1' },
    });
    const r2 = await fetch(`${baseUrl}/limited`, {
      method: 'POST',
      headers: { 'X-Forwarded-For': '198.51.100.2' },
    });
    const r3 = await fetch(`${baseUrl}/limited`, {
      method: 'POST',
      headers: { 'X-Forwarded-For': '198.51.100.3' },
    });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429);
    assert.ok(r3.headers.get('retry-after'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('rateLimit supports async distributed RateLimitStore adapters', async () => {
  let count = 0;
  const asyncStore: RateLimitStore = {
    async consume(_key, maxHits) {
      count += 1;
      return count <= maxHits ? { allowed: true, retryAfterSec: 0 } : { allowed: false, retryAfterSec: 12 };
    },
  };

  const app = express();
  app.post('/async-limited', rateLimit(1, 60_000, { store: asyncStore }), (_req, res) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  try {
    const first = await fetch(`${baseUrl}/async-limited`, { method: 'POST' });
    const second = await fetch(`${baseUrl}/async-limited`, { method: 'POST' });
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(second.headers.get('retry-after'), '12');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Invitation tokens generate high-entropy raw tokens with deterministic SHA-256 hashes', () => {
  const raw1 = generateInviteToken();
  const raw2 = generateInviteToken();
  assert.notEqual(raw1, raw2);
  assert.equal(raw1.length, 64);

  const hashA = hashInviteToken(raw1);
  const hashB = hashInviteToken(`  ${raw1}  `);
  assert.equal(hashA, hashB);
  assert.equal(hashA.length, 64);
  assert.notEqual(hashA, raw1);
});

test('extractBearerToken parses standard Bearer headers and rejects malformed values', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('bearer token123'), 'token123');
  assert.equal(extractBearerToken('Basic abc'), null);
  assert.equal(extractBearerToken('Bearer'), null);
  assert.equal(extractBearerToken(undefined), null);
});

test('isStrictEmailConfirmed strictly requires email_confirmed_at and never substitutes confirmed_at', () => {
  assert.equal(
    isStrictEmailConfirmed({
      email_confirmed_at: '2026-11-20T00:00:00.000Z',
    }),
    true
  );

  // Simulate a phone-confirmed or non-email-confirmed Supabase user where confirmed_at is populated
  // while email_confirmed_at remains null or undefined
  const phoneConfirmedOnly = {
    email_confirmed_at: null,
    confirmed_at: '2026-11-20T00:00:00.000Z',
  };
  assert.equal(isStrictEmailConfirmed(phoneConfirmedOnly), false);
  assert.equal(isStrictEmailConfirmed({ email_confirmed_at: undefined }), false);
  assert.equal(isStrictEmailConfirmed({ email_confirmed_at: '   ' }), false);
  assert.equal(isStrictEmailConfirmed(null), false);
});

test('slugifyOrgName builds clean URL-safe slugs with random suffix', () => {
  const slug = slugifyOrgName('Cairo Digital Studio!');
  assert.match(slug, /^cairo-digital-studio-[a-f0-9]{6}$/);
});

test('InMemoryRateLimitStore blocks exceeding threshold and evicts oldest active keys when capped', () => {
  const store = new InMemoryRateLimitStore(2);
  assert.equal(store.consume('ip1', 2, 10_000).allowed, true);
  assert.equal(store.consume('ip1', 2, 10_000).allowed, true);
  const third = store.consume('ip1', 2, 10_000);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSec >= 1);

  // Fill second bucket and trigger bounded capacity eviction of oldest ('ip1') on 'ip3'
  assert.equal(store.consume('ip2', 2, 10_000).allowed, true);
  assert.equal(store.consume('ip3', 2, 10_000).allowed, true);
  // Since 'ip1' was evicted to keep map bounded at 2, re-consuming 'ip1' starts fresh
  assert.equal(store.consume('ip1', 2, 10_000).allowed, true);
});

test('getValidatedOrgAccess rejects non-UUID organization IDs cleanly with 400 before querying Supabase', async () => {
  assert.equal(isValidUuid('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isValidUuid('not-a-uuid; DROP TABLE organizations;'), false);

  let queriedDb = false;
  let capturedStatus = 0;
  let capturedBody: unknown = null;

  const fakeReq = {
    supabase: {
      from: () => {
        queriedDb = true;
        return {};
      },
    } as unknown as SupabaseClient,
    authUser: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'user@example.com',
      fullName: 'Test User',
      preferredLocale: 'en' as const,
      createdAt: new Date().toISOString(),
    },
  } as AuthenticatedRequest;

  const fakeRes = {
    status(code: number) {
      capturedStatus = code;
      return {
        json(body: unknown) {
          capturedBody = body;
          return fakeRes;
        },
      };
    },
  } as unknown as express.Response;

  const result = await getValidatedOrgAccess(fakeReq, fakeRes, '../evil-path', 'viewer');
  assert.equal(result, null);
  assert.equal(queriedDb, false);
  assert.equal(capturedStatus, 400);
  assert.deepEqual(capturedBody, { error: 'Invalid organization ID format' });
});

test('acceptTeamInvitation rejects unconfirmed accounts before RPC and keeps DB RPC as final authority otherwise', async () => {
  let rpcCalled = 0;
  const fakeUnconfirmedRejectClient = {
    rpc: async () => {
      rpcCalled += 1;
      return {
        data: null,
        error: { message: 'Email address must be confirmed before accepting an invitation' },
      };
    },
  } as unknown as SupabaseClient;

  await assert.rejects(
    () => acceptTeamInvitation(fakeUnconfirmedRejectClient, 'a'.repeat(64), { emailConfirmed: false }),
    (err: unknown) => err instanceof HttpError && err.status === 403 && /confirmed/i.test(err.message)
  );
  assert.equal(rpcCalled, 0);

  // Even when service options omit emailConfirmed or pass true, the database RPC remains the final gatekeeper
  await assert.rejects(
    () => acceptTeamInvitation(fakeUnconfirmedRejectClient, 'a'.repeat(64), { emailConfirmed: true }),
    (err: unknown) => err instanceof HttpError && err.status === 403 && /confirmed/i.test(err.message)
  );
  assert.equal(rpcCalled, 1);
});

test('completeOnboardingAtomic rejects unsupported market targets and invalid URLs before RPC', async () => {
  let rpcCalled = false;
  const fakeClient = {
    rpc: async () => {
      rpcCalled = true;
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  await assert.rejects(
    () =>
      completeOnboardingAtomic(fakeClient, {
        organization: { name: 'Cairo Kitchen', businessType: 'agency', billingCountryCode: 'EG' },
        project: {
          name: 'DACH Exports',
          websiteUrl: 'https://exports.example',
          businessDescription: '',
          industry: 'SaaS',
          targetAudience: '',
          primaryCountryCode: 'DE',
          businessGoals: '',
          marketTargets: [
            { countryCode: 'DE', languageCode: 'de', searchEngineCode: 'yandex', device: 'both' },
          ],
          competitors: [],
        },
      }),
    (err: unknown) => err instanceof HttpError && err.status === 400 && /Yandex/i.test(err.message)
  );

  await assert.rejects(
    () =>
      completeOnboardingAtomic(fakeClient, {
        organization: { name: 'Cairo Kitchen', businessType: 'agency', billingCountryCode: 'EG' },
        project: {
          name: 'Bad URL Project',
          websiteUrl: 'ftp://invalid-protocol.example',
          businessDescription: '',
          industry: '',
          targetAudience: '',
          primaryCountryCode: 'EG',
          businessGoals: '',
          marketTargets: [
            { countryCode: 'EG', languageCode: 'ar', searchEngineCode: 'google', device: 'both' },
          ],
          competitors: [],
        },
      }),
    (err: unknown) => err instanceof HttpError && err.status === 400
  );

  assert.equal(rpcCalled, false);
});

test('API router rejects unauthenticated requests and blocked CORS origins', async () => {
  const env = loadAndValidateEnv({
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_only',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    APP_URL: 'https://app.elmatba5.com',
  });

  const app = express();
  app.use(createCorsMiddleware(env));
  app.use(express.json());
  app.use('/api', createApiRouter(env));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  try {
    // 1. Public config never leaks SESSION_SECRET
    const cfgRes = await fetch(`${baseUrl}/api/config/public`);
    assert.equal(cfgRes.status, 200);
    const cfgJson = (await cfgRes.json()) as Record<string, unknown>;
    assert.equal(cfgJson.configured, true);
    assert.equal('sessionSecret' in cfgJson, false);

    // 2. Protected routes without Authorization header -> 401
    for (const protectedPath of ['/api/profile', '/api/organizations']) {
      const unauthRes = await fetch(`${baseUrl}${protectedPath}`);
      assert.equal(unauthRes.status, 401);
    }

    const unauthOnboarding = await fetch(`${baseUrl}/api/onboarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(unauthOnboarding.status, 401);

    // 3. Disallowed CORS origin on POST -> 403
    const corsRes = await fetch(`${baseUrl}/api/contact`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil-site.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(corsRes.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('createTenantProject maps PostgreSQL enforce_project_quota_on_insert trigger error to HTTP 402 under concurrent creation', async () => {
  const orgId = '550e8400-e29b-41d4-a716-446655440001';
  const userId = '550e8400-e29b-41d4-a716-446655440002';
  let insertCount = 0;

  const mockSupabase = {
    from(table: string) {
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    role: 'owner',
                    organizations: {
                      id: orgId,
                      name: 'Quota Test Agency',
                      slug: 'quota-test-agency',
                      business_type: 'agency',
                      billing_country_code: 'EG',
                      plan_id: 'starter',
                      subscription_status: 'trialing',
                      created_at: '2026-11-20T00:00:00.000Z',
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'plans') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'starter',
                  name: 'Starter Kitchen',
                  description: 'Starter',
                  price_egp_monthly: 1450,
                  price_usd_monthly: 29,
                  max_projects: 2,
                  max_keywords: 250,
                  max_crawls_monthly: 10,
                  max_geo_runs_monthly: 30,
                  max_ai_credits_monthly: 500,
                  max_team_members: 2,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'usage_records') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return {
                eq: async () => ({ count: 1, error: null }),
              };
            }
            return {
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: '550e8400-e29b-41d4-a716-446655440099',
                      organization_id: orgId,
                      name: 'Concurrent Survivor',
                      website_url: 'https://survivor.example',
                      business_description: '',
                      industry: '',
                      target_audience: '',
                      primary_country_code: 'EG',
                      business_goals: '',
                      created_at: '2026-11-20T00:00:00.000Z',
                      updated_at: '2026-11-20T00:00:00.000Z',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          },
          insert: () => ({
            select: () => ({
              single: async () => {
                insertCount += 1;
                if (insertCount === 1) {
                  return {
                    data: { id: '550e8400-e29b-41d4-a716-446655440099' },
                    error: null,
                  };
                }
                return {
                  data: null,
                  error: {
                    message:
                      'Project plan limit reached: maximum 2 active projects allowed on current plan',
                  },
                };
              },
            }),
          }),
        };
      }
      if (table === 'project_market_targets' || table === 'project_competitors') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({ data: [], error: null }),
              }),
            }),
          }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'audit_logs') {
        return {
          insert: async () => ({ error: null }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;

  const payload = {
    organizationId: orgId,
    actorUserId: userId,
    name: 'Export Launch',
    websiteUrl: 'https://launch.example',
    businessDescription: '',
    industry: 'Export',
    targetAudience: '',
    primaryCountryCode: 'EG',
    businessGoals: '',
    marketTargets: [
      { countryCode: 'EG', languageCode: 'ar', searchEngineCode: 'google' as const, device: 'both' as const },
    ],
    competitors: [],
  };

  const results = await Promise.allSettled([
    createTenantProject(mockSupabase, payload),
    createTenantProject(mockSupabase, payload),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof HttpError);
  assert.equal(rejected[0].reason.status, 402);
  assert.match(rejected[0].reason.message, /Project plan limit reached/i);
});

test('ensureUserProfile normalizes trimmed lowercase email when syncing profile row', async () => {
  let capturedUpsert: Record<string, unknown> | null = null;
  const mockSupabase = {
    from(table: string) {
      assert.equal(table, 'profiles');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        upsert: (payload: Record<string, unknown>) => {
          capturedUpsert = payload;
          return {
            select: () => ({
              single: async () => ({
                data: {
                  ...payload,
                  created_at: '2026-11-20T00:00:00.000Z',
                },
                error: null,
              }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const user = await ensureUserProfile(mockSupabase, {
    id: '550e8400-e29b-41d4-a716-446655440010',
    email: '  Founder@ElMatba5.COM ',
    fullName: 'Nadia Hassan',
    preferredLocale: 'ar',
    createdAt: '2026-11-20T00:00:00.000Z',
  });

  assert.equal(capturedUpsert?.['email'], 'founder@elmatba5.com');
  assert.equal(user.email, 'founder@elmatba5.com');
});

