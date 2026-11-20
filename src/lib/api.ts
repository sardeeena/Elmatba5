import { getAccessToken } from './supabase';
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

async function request<T>(
  path: string,
  options: RequestInit = {},
  requiresAuth = false
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (requiresAuth) {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Authentication required');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getHealth: () =>
    request<{
      status: string;
      database: string;
      schemaReady: boolean;
      timestamp: string;
    }>('/api/health'),

  getProfile: () =>
    request<{ user: User; organizations: OrganizationSummary[] }>('/api/profile', {}, true),

  setLocale: (locale: Locale) =>
    request<{ preferredLocale: Locale }>(
      '/api/profile/locale',
      {
        method: 'PATCH',
        body: JSON.stringify({ locale }),
      },
      true
    ),

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
    request<{ organization: OrganizationSummary; project: Project }>(
      '/api/onboarding',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      true
    ),

  createOrganization: (body: {
    name: string;
    businessType: BusinessType;
    billingCountryCode: string;
  }) =>
    request<{ organization: OrganizationSummary }>(
      '/api/organizations',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      true
    ),

  getOrgOverview: (orgId: string) =>
    request<{
      organization: OrganizationSummary;
      plan: PlanDefinition | null;
      usage: UsageSummary;
      projects: Project[];
      members: OrganizationMemberItem[];
      invitations: OrganizationInvitationItem[];
      auditLogs: AuditLogItem[];
    }>(`/api/organizations/${orgId}/overview`, {}, true),

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
    request<{ project: Project }>(
      `/api/organizations/${orgId}/projects`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      true
    ),

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
    request<{ project: Project }>(
      `/api/organizations/${orgId}/projects/${projectId}/markets`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      true
    ),

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
      },
      true
    ),

  deleteProject: (orgId: string, projectId: string) =>
    request<{ deleted: boolean }>(
      `/api/organizations/${orgId}/projects/${projectId}`,
      {
        method: 'DELETE',
      },
      true
    ),

  inviteMember: (
    orgId: string,
    body: { email: string; role: 'admin' | 'analyst' | 'viewer' }
  ) =>
    request<{ invitation: OrganizationInvitationItem; inviteToken: string }>(
      `/api/organizations/${orgId}/invitations`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      true
    ),

  acceptInvitation: (token: string) =>
    request<{ organization: OrganizationSummary }>(
      '/api/invitations/accept',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      },
      true
    ),

  downloadGdprExport: async (orgId: string): Promise<void> => {
    const token = await getAccessToken();
    if (!token) throw new Error('Authentication required');

    const res = await fetch(`/api/organizations/${orgId}/gdpr-export`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || 'Unable to download GDPR export');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `elmatba5-gdpr-export-${orgId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

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
