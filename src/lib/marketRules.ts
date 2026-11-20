import type { CoverageStatus, PlanDefinition, UsageSummary } from './types';

export interface MarketResolution {
  countryCode: string;
  languageCode: string;
  searchEngineCode: 'google' | 'yandex' | 'bing';
  assignedProvider: string;
  coverageStatus: CoverageStatus;
  supportsSerp: boolean;
  supportsKeywordVolume: boolean;
  supportsFirstParty: boolean;
  explanationEn: string;
  explanationAr: string;
}

const DATAFORSEO_GOOGLE_MARKETS = new Set([
  'EG', 'SA', 'AE', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'US',
]);

/**
 * Resolves the authoritative search intelligence provider for a market target.
 * Never silently substitutes a different country or search engine.
 * Explicitly respects DataForSEO's lack of Russia/Belarus & discontinued Yandex SERP coverage.
 */
export function resolveMarketProvider(
  countryCode: string,
  languageCode: string,
  searchEngineCode: 'google' | 'yandex' | 'bing'
): MarketResolution {
  const cc = countryCode.toUpperCase();
  const lc = languageCode.toLowerCase();

  if (cc === 'RU') {
    if (searchEngineCode === 'yandex') {
      return {
        countryCode: cc,
        languageCode: lc,
        searchEngineCode,
        assignedProvider: 'yandex_search_api + yandex_webmaster',
        coverageStatus: 'partial',
        supportsSerp: true,
        supportsKeywordVolume: false,
        supportsFirstParty: true,
        explanationEn:
          'Russia / Yandex routes to Yandex Search API & Yandex Webmaster (first-party). DataForSEO is excluded because it has no Russia coverage and discontinued Yandex SERP. Third-party keyword search volumes are not assumed.',
        explanationAr:
          'روسيا / ياندكس يعتمد على Yandex Search API وYandex Webmaster للبيانات الرسمية. تم استبعاد DataForSEO لعدم تغطيته لروسيا وتوقف خدمة Yandex لديه.',
      };
    }

    if (searchEngineCode === 'google') {
      return {
        countryCode: cc,
        languageCode: lc,
        searchEngineCode,
        assignedProvider: 'gsc_first_party_only',
        coverageStatus: 'first_party_only',
        supportsSerp: false,
        supportsKeywordVolume: false,
        supportsFirstParty: true,
        explanationEn:
          'DataForSEO does not provide Russia coverage. Google in Russia is restricted to customer-authorized Google Search Console first-party data; SERP and keyword volume scraping are unavailable.',
        explanationAr:
          'لا يدعم DataForSEO تغطية روسيا. يقتصر جوجل في روسيا على بيانات Google Search Console الرسمية المرتبطة بحساب العميل فقط.',
      };
    }

    return {
      countryCode: cc,
      languageCode: lc,
      searchEngineCode,
      assignedProvider: 'bing_webmaster_first_party',
      coverageStatus: 'first_party_only',
      supportsSerp: false,
      supportsKeywordVolume: false,
      supportsFirstParty: true,
      explanationEn:
        'Bing in Russia supports first-party Bing Webmaster Tools metrics when authorized; automated SERP scraping is unavailable.',
      explanationAr:
        'يدعم Bing في روسيا بيانات Bing Webmaster الرسمية عند الربط فقط.',
    };
  }

  if (searchEngineCode === 'yandex') {
    return {
      countryCode: cc,
      languageCode: lc,
      searchEngineCode,
      assignedProvider: 'yandex_search_api',
      coverageStatus: cc === 'RU' ? 'partial' : 'unsupported',
      supportsSerp: false,
      supportsKeywordVolume: false,
      supportsFirstParty: false,
      explanationEn: `Yandex SERP is not supported for ${cc}. Select Google or Bing for ${cc}, or target Russia (RU) for Yandex Search API.`,
      explanationAr: `محرك ياندكس غير مدعوم لسوق ${cc}. اختر Google أو Bing لهذا السوق، أو اختر روسيا لاستخدام Yandex.`,
    };
  }

  if (searchEngineCode === 'bing') {
    return {
      countryCode: cc,
      languageCode: lc,
      searchEngineCode,
      assignedProvider: 'bing_webmaster_api',
      coverageStatus: 'first_party_only',
      supportsSerp: false,
      supportsKeywordVolume: false,
      supportsFirstParty: true,
      explanationEn: `Bing in ${cc} uses Bing Webmaster Tools REST API for verified site impressions, clicks, and crawl insights.`,
      explanationAr: `يعتمد Bing في ${cc} على Bing Webmaster Tools API لبيانات الظهور والنقرات الرسمية للموقع الموثق.`,
    };
  }

  // Google in supported international markets
  if (DATAFORSEO_GOOGLE_MARKETS.has(cc)) {
    return {
      countryCode: cc,
      languageCode: lc,
      searchEngineCode: 'google',
      assignedProvider: 'dataforseo + google_search_console',
      coverageStatus: 'supported',
      supportsSerp: true,
      supportsKeywordVolume: true,
      supportsFirstParty: true,
      explanationEn: `Full Google SERP, keyword metrics (DataForSEO), and first-party Search Console support available for ${cc} (${lc.toUpperCase()}).`,
      explanationAr: `تغطية كاملة لنتائج جوجل وحجم البحث عبر DataForSEO مع دعم Google Search Console لسوق ${cc}.`,
    };
  }

  return {
    countryCode: cc,
    languageCode: lc,
    searchEngineCode: 'google',
    assignedProvider: 'google_search_console',
    coverageStatus: 'first_party_only',
    supportsSerp: false,
    supportsKeywordVolume: false,
    supportsFirstParty: true,
    explanationEn: `Market ${cc} currently supports first-party Google Search Console data; third-party SERP coverage requires provider expansion.`,
    explanationAr: `السوق ${cc} يدعم حالياً بيانات Google Search Console الرسمية فقط.`,
  };
}

export function checkProjectEntitlement(
  plan: PlanDefinition,
  usage: UsageSummary
): { allowed: boolean; reason?: string } {
  if (usage.projectsCount >= plan.maxProjects) {
    return {
      allowed: false,
      reason: `Plan ${plan.name} allows up to ${plan.maxProjects} active projects. Upgrade to add more client workspaces.`,
    };
  }
  return { allowed: true };
}

export function checkMemberEntitlement(
  plan: PlanDefinition,
  currentMemberCount: number
): { allowed: boolean; reason?: string } {
  if (currentMemberCount >= plan.maxTeamMembers) {
    return {
      allowed: false,
      reason: `Plan ${plan.name} allows up to ${plan.maxTeamMembers} team member(s). Upgrade to invite more teammates.`,
    };
  }
  return { allowed: true };
}

export function normalizeWebsiteUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Website URL must use http or https protocol.');
  }
  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    throw new Error('Website URL must include a valid domain name.');
  }
  return parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, ''));
}

export function normalizeCompetitorDomain(rawDomain: string): string {
  const trimmed = rawDomain.trim().toLowerCase();
  if (!trimmed) return '';
  const stripped = trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!stripped || !stripped.includes('.')) {
    throw new Error('Enter a valid competitor domain (e.g. competitor.com).');
  }
  return stripped;
}
