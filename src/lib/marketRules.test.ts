import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkMemberEntitlement,
  checkProjectEntitlement,
  normalizeCompetitorDomain,
  normalizeWebsiteUrl,
  resolveMarketProvider,
} from './marketRules';
import type { PlanDefinition, UsageSummary } from './types';

test('Russia + Yandex resolves to Yandex Search API & Webmaster and never uses DataForSEO', () => {
  const res = resolveMarketProvider('RU', 'ru', 'yandex');
  assert.equal(res.assignedProvider, 'yandex_search_api + yandex_webmaster');
  assert.equal(res.coverageStatus, 'partial');
  assert.equal(res.supportsKeywordVolume, false);
  assert.equal(res.supportsSerp, true);
  assert.equal(res.assignedProvider.includes('dataforseo'), false);
});

test('Russia + Google restricts to first-party GSC only and does not fake SERP scraping', () => {
  const res = resolveMarketProvider('RU', 'ru', 'google');
  assert.equal(res.assignedProvider, 'gsc_first_party_only');
  assert.equal(res.coverageStatus, 'first_party_only');
  assert.equal(res.supportsSerp, false);
});

test('Egypt + Arabic + Google resolves to full DataForSEO + GSC support', () => {
  const res = resolveMarketProvider('EG', 'ar', 'google');
  assert.equal(res.assignedProvider, 'dataforseo + google_search_console');
  assert.equal(res.coverageStatus, 'supported');
  assert.equal(res.supportsSerp, true);
  assert.equal(res.supportsKeywordVolume, true);
});

test('Yandex outside Russia is explicitly flagged unsupported without silent substitution', () => {
  const res = resolveMarketProvider('DE', 'de', 'yandex');
  assert.equal(res.coverageStatus, 'unsupported');
  assert.equal(res.searchEngineCode, 'yandex');
  assert.equal(res.countryCode, 'DE');
});

test('Plan project and member entitlements enforce limits accurately', () => {
  const starterPlan: PlanDefinition = {
    id: 'starter',
    name: 'Starter Kitchen',
    description: 'Solo plan',
    priceEgpMonthly: 1450,
    priceUsdMonthly: 29,
    maxProjects: 2,
    maxKeywords: 250,
    maxCrawlsMonthly: 10,
    maxGeoRunsMonthly: 30,
    maxAiCreditsMonthly: 500,
    maxTeamMembers: 2,
  };
  const usageAtLimit: UsageSummary = {
    periodYm: '2026-11',
    projectsCount: 2,
    keywordsTracked: 10,
    crawlsRun: 0,
    geoRuns: 0,
    aiCreditsUsed: 0,
    reportsGenerated: 0,
    teamMembersCount: 2,
  };

  assert.equal(checkProjectEntitlement(starterPlan, usageAtLimit).allowed, false);
  assert.equal(checkMemberEntitlement(starterPlan, 2).allowed, false);
  assert.equal(checkProjectEntitlement(starterPlan, { ...usageAtLimit, projectsCount: 1 }).allowed, true);
});

test('URL and competitor domain normalization rejects invalid schemes and domains', () => {
  assert.equal(normalizeWebsiteUrl('elmatba5.com/'), 'https://elmatba5.com');
  assert.throws(() => normalizeWebsiteUrl('ftp://example.com'), /http or https/i);
  assert.throws(() => normalizeWebsiteUrl('javascript:alert(1)'), /http or https/i);
  assert.throws(() => normalizeWebsiteUrl('notadomain'), /valid domain/i);
  assert.equal(normalizeCompetitorDomain('https://www.Competitor.de/blog'), 'competitor.de');
  assert.throws(() => normalizeCompetitorDomain('notadomain'));
});
