import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import express from 'express';
import http from 'node:http';
import { loadAndValidateEnv, parseTrustProxy } from './config/env.ts';
import { extractBearerToken } from './middleware/auth.ts';
import {
  createCorsMiddleware,
  InMemoryRateLimitStore,
  rateLimit,
  type RateLimitStore,
} from './middleware/security.ts';
import { createApiRouter } from './routes.ts';
import { generateInviteToken, hashInviteToken, slugifyOrgName } from './security.ts';
import { acceptTeamInvitation, completeOnboardingAtomic, HttpError } from './services/orgService.ts';

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

test('loadAndValidateEnv rejects accidental Supabase secret keys in SUPABASE_PUBLISHABLE_KEY', () => {
  assert.throws(
    () =>
      loadAndValidateEnv({
        NODE_ENV: 'development',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_allow_this',
      }),
    /secret key/i
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

test('slugifyOrgName builds clean URL-safe slugs with random suffix', () => {
  const slug = slugifyOrgName('Cairo Digital Studio!');
  assert.match(slug, /^cairo-digital-studio-[a-f0-9]{6}$/);
});

test('InMemoryRateLimitStore blocks requests exceeding window threshold', () => {
  const store = new InMemoryRateLimitStore();
  assert.equal(store.consume('ip1', 2, 10_000).allowed, true);
  assert.equal(store.consume('ip1', 2, 10_000).allowed, true);
  const third = store.consume('ip1', 2, 10_000);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSec >= 1);
});

test('acceptTeamInvitation rejects unconfirmed accounts before reaching database RPC', async () => {
  let rpcCalled = false;
  const fakeClient = {
    rpc: async () => {
      rpcCalled = true;
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  await assert.rejects(
    () => acceptTeamInvitation(fakeClient, 'a'.repeat(64), { emailConfirmed: false }),
    (err: unknown) => err instanceof HttpError && err.status === 403 && /confirmed/i.test(err.message)
  );
  assert.equal(rpcCalled, false);
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
