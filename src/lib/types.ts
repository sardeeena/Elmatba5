export type Locale = 'en' | 'ar';

export type BusinessType = 'agency' | 'consultant' | 'business' | 'ecommerce' | 'other';
export type OrgRole = 'owner' | 'admin' | 'analyst' | 'viewer';
export type DeviceTarget = 'desktop' | 'mobile' | 'both';
export type CoverageStatus = 'supported' | 'partial' | 'first_party_only' | 'unsupported';
export type PlanId = 'starter' | 'pro' | 'agency';

export interface User {
  id: string;
  email: string;
  fullName: string;
  preferredLocale: Locale;
  createdAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  businessType: BusinessType;
  billingCountryCode: string;
  planId: PlanId;
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled';
  role: OrgRole;
  createdAt: string;
}

export interface CountryOption {
  code: string;
  nameEn: string;
  nameAr: string;
  region: string;
  defaultLanguageCode: string;
}

export interface LanguageOption {
  code: string;
  nameEn: string;
  nameNative: string;
  direction: 'ltr' | 'rtl';
}

export interface SearchEngineOption {
  code: 'google' | 'yandex' | 'bing';
  name: string;
}

export interface ProviderCoverageEntry {
  providerCode: string;
  countryCode: string;
  searchEngineCode: string;
  supportsSerp: boolean;
  supportsKeywordVolume: boolean;
  supportsFirstParty: boolean;
  coverageStatus: CoverageStatus;
  notes: string;
}

export interface ProjectMarketTarget {
  id: string;
  projectId: string;
  countryCode: string;
  languageCode: string;
  searchEngineCode: 'google' | 'yandex' | 'bing';
  device: DeviceTarget;
  assignedProvider: string;
  coverageStatus: CoverageStatus;
  isActive: boolean;
  createdAt: string;
}

export interface ProjectCompetitor {
  id: string;
  projectId: string;
  domain: string;
  label: string;
  createdAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  websiteUrl: string;
  businessDescription: string;
  industry: string;
  targetAudience: string;
  primaryCountryCode: string;
  businessGoals: string;
  createdAt: string;
  updatedAt: string;
  marketTargets: ProjectMarketTarget[];
  competitors: ProjectCompetitor[];
}

export interface OrganizationMemberItem {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: OrgRole;
  createdAt: string;
}

export interface OrganizationInvitationItem {
  id: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  actorEmail: string | null;
  createdAt: string;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  priceEgpMonthly: number;
  priceUsdMonthly: number;
  maxProjects: number;
  maxKeywords: number;
  maxCrawlsMonthly: number;
  maxGeoRunsMonthly: number;
  maxAiCreditsMonthly: number;
  maxTeamMembers: number;
}

export interface UsageSummary {
  periodYm: string;
  projectsCount: number;
  keywordsTracked: number;
  crawlsRun: number;
  geoRuns: number;
  aiCreditsUsed: number;
  reportsGenerated: number;
  teamMembersCount: number;
}
