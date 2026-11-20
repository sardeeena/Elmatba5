import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDb,
  createUser,
  createOrganization,
  createProject,
  getProjectById,
  listProjectsForOrg,
  getOrgMembership,
  deleteProjectForOrg,
} from './db.ts';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
} from './security.ts';

test('Password hashing uses per-user salt and rejects incorrect passwords', () => {
  const hash1 = hashPassword('CairoGrowth!2026');
  const hash2 = hashPassword('CairoGrowth!2026');
  assert.notEqual(hash1, hash2);
  assert.equal(verifyPassword('CairoGrowth!2026', hash1), true);
  assert.equal(verifyPassword('WrongPassword', hash1), false);
});

test('Session token signing rejects tampered or expired tokens', () => {
  const secret = 'test-secret-key-minimum-32-chars-long-ok';
  const validToken = signSessionToken({ userId: 'u-1', email: 'founder@elmatba5.com' }, secret, 60_000);
  const decoded = verifySessionToken(validToken, secret);
  assert.equal(decoded?.userId, 'u-1');

  const tampered = validToken.slice(0, -3) + 'xxx';
  assert.equal(verifySessionToken(tampered, secret), null);

  const expired = signSessionToken({ userId: 'u-1', email: 'founder@elmatba5.com' }, secret, -1000);
  assert.equal(verifySessionToken(expired, secret), null);
});

test('Multi-tenant isolation prevents cross-organization project reads and deletes', () => {
  const db = getDb(':memory:');

  const userA = createUser(db, {
    email: 'agency-a@cairo.eg',
    passwordHash: hashPassword('SecretA!123'),
    fullName: 'Founder A',
    preferredLocale: 'en',
  });
  const userB = createUser(db, {
    email: 'agency-b@alex.eg',
    passwordHash: hashPassword('SecretB!123'),
    fullName: 'Founder B',
    preferredLocale: 'ar',
  });

  const orgA = createOrganization(db, {
    name: 'Nile Digital Agency',
    slug: 'nile-digital',
    businessType: 'agency',
    billingCountryCode: 'EG',
    ownerUserId: userA.id,
  });

  const orgB = createOrganization(db, {
    name: 'Red Sea Commerce',
    slug: 'red-sea',
    businessType: 'ecommerce',
    billingCountryCode: 'EG',
    ownerUserId: userB.id,
  });

  const projectA = createProject(db, {
    organizationId: orgA.id,
    createdByUserId: userA.id,
    name: 'Export Germany Campaign',
    websiteUrl: 'https://export-eg.com',
    businessDescription: 'Egyptian industrial exports to EU & Russia',
    industry: 'Manufacturing',
    targetAudience: 'EU B2B buyers',
    primaryCountryCode: 'EG',
    businessGoals: 'Grow German and Russian organic traffic',
    marketTargets: [
      { countryCode: 'EG', languageCode: 'ar', searchEngineCode: 'google', device: 'both' },
      { countryCode: 'DE', languageCode: 'de', searchEngineCode: 'google', device: 'desktop' },
      { countryCode: 'RU', languageCode: 'ru', searchEngineCode: 'yandex', device: 'both' },
    ],
    competitors: [{ domain: 'rival-de.com', label: 'German Rival' }],
  });

  // Org A sees its project with 3 independent market targets
  const orgAProjects = listProjectsForOrg(db, orgA.id);
  assert.equal(orgAProjects.length, 1);
  assert.equal(orgAProjects[0].marketTargets.length, 3);
  const ruTarget = orgAProjects[0].marketTargets.find((t) => t.countryCode === 'RU');
  assert.equal(ruTarget?.assignedProvider, 'yandex_search_api + yandex_webmaster');

  // Org B must NOT be able to read, delete, or verify membership in Org A
  assert.equal(getOrgMembership(db, orgA.id, userB.id), null);
  assert.equal(getProjectById(db, orgB.id, projectA.id), null);
  assert.equal(listProjectsForOrg(db, orgB.id).length, 0);
  assert.equal(deleteProjectForOrg(db, orgB.id, projectA.id, userB.id), false);

  // Project A still intact
  assert.ok(getProjectById(db, orgA.id, projectA.id));
});
