import type {
  AuditLogItem,
  BusinessType,
  CountryOption,
  LanguageOption,
  Locale,
  OrganizationInvitationItem,
  OrganizationMemberItem,
  OrganizationSummary,
  PlanDefinition,
  Project,
  ProviderCoverageEntry,
  SearchEngineOption,
  UsageSummary,
  User,
} from './types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  me: () =>
    request<{ authenticated: boolean; user: User | null; organizations: OrganizationSummary[] }>(
      '/api/auth/session'
    ),

  register: (body: {
    email: string;
    password: string;
    fullName: string;
    preferredLocale: Locale;
  }) =>
    request<{ user: User; organizations: OrganizationSummary[] }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ user: User; organizations: OrganizationSummary[] }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  setLocale: (locale: Locale) =>
    request<{ preferredLocale: Locale }>('/api/auth/locale', {
      method: 'PATCH',
      body: JSON.stringify({ locale }),
    }),

  getMarketRegistry: () =>
    request<{
      countries: CountryOption[];
      languages: LanguageOption[];
      searchEngines: SearchEngineOption[];
      coverage: ProviderCoverageEntry[];
    }>('/api/markets/registry'),

  getPlans: () =>
    request<{
      plans: PlanDefinition[];
      paymentProviders: Array<{ code: string; name: string; status: string; note: string }>;
    }>('/api/billing/plans'),

  completeOnboarding: (body: {
    organization: {
      name: string;
      businessType: BusinessType;
      billingCountryCode: string;
    };
    project: {
      name: string;
      websiteUrl: string;
      businessDescription: string;
      industry: string;
      targetAudience: string;
      primaryCountryCode: string;
      businessGoals: string;
      marketTargets: Array<{
        countryCode: string;
        languageCode: string;
        searchEngineCode: 'google' | 'yandex' | 'bing';
        device: 'desktop' | 'mobile' | 'both';
      }>;
      competitors: Array<{ domain: string; label?: string }>;
    };
  }) =>
    request<{ organization: OrganizationSummary; project: Project }>('/api/onboarding', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createOrganization: (body: {
    name: string;
    businessType: BusinessType;
    billingCountryCode: string;
  }) =>
    request<{ organization: OrganizationSummary }>('/api/organizations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getOrgOverview: (orgId: string) =>
    request<{
      organization: OrganizationSummary;
      plan: PlanDefinition | null;
      usage: UsageSummary;
      projects: Project[];
      members: OrganizationMemberItem[];
      invitations: OrganizationInvitationItem[];
      auditLogs: AuditLogItem[];
    }>(`/api/organizations/${orgId}/overview`),

  createProject: (
    orgId: string,
    body: {
      name: string;
      websiteUrl: string;
      businessDescription: string;
      industry: string;
      targetAudience: string;
      primaryCountryCode: string;
      businessGoals: string;
      marketTargets: Array<{
        countryCode: string;
        languageCode: string;
        searchEngineCode: 'google' | 'yandex' | 'bing';
        device: 'desktop' | 'mobile' | 'both';
      }>;
      competitors: Array<{ domain: string; label?: string }>;
    }
  ) =>
    request<{ project: Project }>(`/api/organizations/${orgId}/projects`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  addProjectMarket: (
    orgId: string,
    projectId: string,
    body: {
      countryCode: string;
      languageCode: string;
      searchEngineCode: 'google' | 'yandex' | 'bing';
      device: 'desktop' | 'mobile' | 'both';
    }
  ) =>
    request<{ project: Project }>(`/api/organizations/${orgId}/projects/${projectId}/markets`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  addProjectCompetitor: (
    orgId: string,
    projectId: string,
    body: { domain: string; label?: string }
  ) =>
    request<{ project: Project }>(
      `/api/organizations/${orgId}/projects/${projectId}/competitors`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  deleteProject: (orgId: string, projectId: string) =>
    request<{ deleted: boolean }>(`/api/organizations/${orgId}/projects/${projectId}`, {
      method: 'DELETE',
    }),

  inviteMember: (
    orgId: string,
    body: { email: string; role: 'admin' | 'analyst' | 'viewer' }
  ) =>
    request<{ invitation: OrganizationInvitationItem }>(
      `/api/organizations/${orgId}/invitations`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),

  submitContactLead: (body: {
    fullName: string;
    email: string;
    company: string;
    countryCode: string;
    message: string;
  }) =>
    request<{ ok: boolean; id: string; createdAt: string }>('/api/contact', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
