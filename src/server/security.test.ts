import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { loadAndValidateEnv } from './config/env.ts';
import { extractBearerToken } from './middleware/auth.ts';
import { createCorsMiddleware, InMemoryRateLimitStore } from './middleware/security.ts';
import { createApiRouter } from './routes.ts';
import { generateInviteToken, hashInviteToken, slugifyOrgName } from './security.ts';

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

    // 2. Protected route without Authorization header -> 401
    const unauthRes = await fetch(`${baseUrl}/api/profile`);
    assert.equal(unauthRes.status, 401);

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
