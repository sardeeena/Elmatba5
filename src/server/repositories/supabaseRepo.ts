import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveMarketProvider } from '../../lib/marketRules.ts';
import type {
  AuditLogItem,
  BusinessType,
  CountryOption,
  CoverageStatus,
  LanguageOption,
  Locale,
  OrganizationInvitationItem,
  OrganizationMemberItem,
  OrganizationSummary,
  OrgRole,
  PlanDefinition,
  PlanId,
  Project,
  ProjectCompetitor,
  ProjectMarketTarget,
  ProviderCoverageEntry,
  SearchEngineOption,
  UsageSummary,
  User,
} from '../../lib/types.ts';

export function currentPeriodYm(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function ensureUserProfile(
  supabase: SupabaseClient,
  authInfo: {
    id: string;
    email: string;
    fullName: string;
    preferredLocale: Locale;
    createdAt: string;
  }
): Promise<User> {
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, email, full_name, preferred_locale, created_at')
    .eq('id', authInfo.id)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      fullName: existing.full_name || authInfo.fullName,
      preferredLocale: existing.preferred_locale === 'ar' ? 'ar' : 'en',
      createdAt: existing.created_at,
    };
  }

  const normalizedEmail = authInfo.email.trim().toLowerCase();

  const { data: inserted, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: authInfo.id,
        email: normalizedEmail,
        full_name: authInfo.fullName,
        preferred_locale: authInfo.preferredLocale,
      },
      { onConflict: 'id' }
    )
    .select('id, email, full_name, preferred_locale, created_at')
    .single();

  if (error || !inserted) {
    return {
      id: authInfo.id,
      email: normalizedEmail,
      fullName: authInfo.fullName,
      preferredLocale: authInfo.preferredLocale,
      createdAt: authInfo.createdAt,
    };
  }

  return {
    id: inserted.id,
    email: inserted.email,
    fullName: inserted.full_name,
    preferredLocale: inserted.preferred_locale === 'ar' ? 'ar' : 'en',
    createdAt: inserted.created_at,
  };
}

export async function updateUserLocale(
  supabase: SupabaseClient,
  userId: string,
  locale: Locale
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      preferred_locale: locale,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error('Unable to update preferred locale');
  }
}

export async function listMarketRegistry(supabase: SupabaseClient): Promise<{
  countries: CountryOption[];
  languages: LanguageOption[];
  searchEngines: SearchEngineOption[];
  coverage: ProviderCoverageEntry[];
}> {
  const [countriesRes, languagesRes, enginesRes, coverageRes] = await Promise.all([
    supabase.from('countries').select('code, name_en, name_ar, region, default_language_code').order('code'),
    supabase.from('languages').select('code, name_en, name_native, direction').order('code'),
    supabase.from('search_engines').select('code, name').order('code'),
    supabase
      .from('provider_coverage')
      .select(
        'provider_code, country_code, search_engine_code, supports_serp, supports_keyword_volume, supports_first_party, coverage_status, notes'
      )
      .order('country_code'),
  ]);

  if (countriesRes.error || languagesRes.error || enginesRes.error || coverageRes.error) {
    throw new Error('Failed to load market registry from database');
  }

  return {
    countries: (countriesRes.data ?? []).map((c) => ({
      code: c.code,
      nameEn: c.name_en,
      nameAr: c.name_ar,
      region: c.region,
      defaultLanguageCode: c.default_language_code,
    })),
    languages: (languagesRes.data ?? []).map((l) => ({
      code: l.code,
      nameEn: l.name_en,
      nameNative: l.name_native,
      direction: l.direction as 'ltr' | 'rtl',
    })),
    searchEngines: (enginesRes.data ?? []).map((se) => ({
      code: se.code as 'google' | 'yandex' | 'bing',
      name: se.name,
    })),
    coverage: (coverageRes.data ?? []).map((cv) => ({
      providerCode: cv.provider_code,
      countryCode: cv.country_code,
      searchEngineCode: cv.search_engine_code,
      supportsSerp: Boolean(cv.supports_serp),
      supportsKeywordVolume: Boolean(cv.supports_keyword_volume),
      supportsFirstParty: Boolean(cv.supports_first_party),
      coverageStatus: cv.coverage_status as CoverageStatus,
      notes: cv.notes,
    })),
  };
}

export async function listPlans(supabase: SupabaseClient): Promise<PlanDefinition[]> {
  const { data, error } = await supabase
    .from('plans')
    .select(
      'id, name, description, price_egp_monthly, price_usd_monthly, max_projects, max_keywords, max_crawls_monthly, max_geo_runs_monthly, max_ai_credits_monthly, max_team_members'
    )
    .eq('is_active', true)
    .order('price_usd_monthly', { ascending: true });

  if (error) {
    throw new Error('Failed to load billing plans');
  }

  return (data ?? []).map((p) => ({
    id: p.id as PlanId,
    name: p.name,
    description: p.description,
    priceEgpMonthly: p.price_egp_monthly,
    priceUsdMonthly: p.price_usd_monthly,
    maxProjects: p.max_projects,
    maxKeywords: p.max_keywords,
    maxCrawlsMonthly: p.max_crawls_monthly,
    maxGeoRunsMonthly: p.max_geo_runs_monthly,
    maxAiCreditsMonthly: p.max_ai_credits_monthly,
    maxTeamMembers: p.max_team_members,
  }));
}

export async function getPlanById(
  supabase: SupabaseClient,
  planId: PlanId
): Promise<PlanDefinition | null> {
  const { data, error } = await supabase
    .from('plans')
    .select(
      'id, name, description, price_egp_monthly, price_usd_monthly, max_projects, max_keywords, max_crawls_monthly, max_geo_runs_monthly, max_ai_credits_monthly, max_team_members'
    )
    .eq('id', planId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as PlanId,
    name: data.name,
    description: data.description,
    priceEgpMonthly: data.price_egp_monthly,
    priceUsdMonthly: data.price_usd_monthly,
    maxProjects: data.max_projects,
    maxKeywords: data.max_keywords,
    maxCrawlsMonthly: data.max_crawls_monthly,
    maxGeoRunsMonthly: data.max_geo_runs_monthly,
    maxAiCreditsMonthly: data.max_ai_credits_monthly,
    maxTeamMembers: data.max_team_members,
  };
}

export async function getOrgMembership(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<{ organizationId: string; userId: string; role: OrgRole } | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, user_id, role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    organizationId: data.organization_id,
    userId: data.user_id,
    role: data.role as OrgRole,
  };
}

export async function listOrganizationsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<OrganizationSummary[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select(
      'role, organizations(id, name, slug, business_type, billing_country_code, plan_id, subscription_status, created_at)'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error('Failed to load organizations');
  }

  const summaries: OrganizationSummary[] = [];
  for (const row of data ?? []) {
    const orgRaw = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (!orgRaw) continue;
    summaries.push({
      id: orgRaw.id,
      name: orgRaw.name,
      slug: orgRaw.slug,
      businessType: orgRaw.business_type as BusinessType,
      billingCountryCode: orgRaw.billing_country_code,
      planId: orgRaw.plan_id as PlanId,
      subscriptionStatus: orgRaw.subscription_status as OrganizationSummary['subscriptionStatus'],
      role: row.role as OrgRole,
      createdAt: orgRaw.created_at,
    });
  }
  return summaries;
}

export async function createOrganizationAtomic(
  supabase: SupabaseClient,
  input: {
    name: string;
    slug: string;
    businessType: BusinessType;
    billingCountryCode: string;
  }
): Promise<OrganizationSummary> {
  const { data, error } = await supabase.rpc('create_organization_atomic', {
    p_name: input.name,
    p_slug: input.slug,
    p_business_type: input.businessType,
    p_billing_country_code: input.billingCountryCode,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Unable to create organization');
  }

  return data as OrganizationSummary;
}

export async function completeOnboardingAtomicRpc(
  supabase: SupabaseClient,
  input: {
    organization: {
      name: string;
      slug: string;
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
  }
): Promise<{ organization: OrganizationSummary; project: Project }> {
  const { data, error } = await supabase.rpc('complete_onboarding_atomic', {
    p_org_name: input.organization.name,
    p_org_slug: input.organization.slug,
    p_business_type: input.organization.businessType,
    p_billing_country_code: input.organization.billingCountryCode,
    p_project_name: input.project.name,
    p_website_url: input.project.websiteUrl,
    p_business_description: input.project.businessDescription,
    p_industry: input.project.industry,
    p_target_audience: input.project.targetAudience,
    p_primary_country_code: input.project.primaryCountryCode,
    p_business_goals: input.project.businessGoals,
    p_market_targets: input.project.marketTargets,
    p_competitors: input.project.competitors,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Unable to complete onboarding');
  }

  return data as { organization: OrganizationSummary; project: Project };
}

export async function getOrgUsage(
  supabase: SupabaseClient,
  orgId: string
): Promise<UsageSummary> {
  const periodYm = currentPeriodYm();
  const [usageRes, projCountRes, memCountRes] = await Promise.all([
    supabase
      .from('usage_records')
      .select('keywords_tracked, crawls_run, geo_runs, ai_credits_used, reports_generated')
      .eq('organization_id', orgId)
      .eq('period_ym', periodYm)
      .maybeSingle(),
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
  ]);

  const usageRow = usageRes.data;

  return {
    periodYm,
    projectsCount: projCountRes.count ?? 0,
    keywordsTracked: usageRow?.keywords_tracked ?? 0,
    crawlsRun: usageRow?.crawls_run ?? 0,
    geoRuns: usageRow?.geo_runs ?? 0,
    aiCreditsUsed: usageRow?.ai_credits_used ?? 0,
    reportsGenerated: usageRow?.reports_generated ?? 0,
    teamMembersCount: memCountRes.count ?? 0,
  };
}

export async function listProjectsForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<Project[]> {
  const [projectsRes, targetsRes, compsRes] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'id, organization_id, name, website_url, business_description, industry, target_audience, primary_country_code, business_goals, created_at, updated_at'
      )
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_market_targets')
      .select(
        'id, project_id, country_code, language_code, search_engine_code, device, assigned_provider, coverage_status, is_active, created_at'
      )
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
    supabase
      .from('project_competitors')
      .select('id, project_id, domain, label, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
  ]);

  if (projectsRes.error || targetsRes.error || compsRes.error) {
    throw new Error('Failed to load organization projects');
  }

  const targetsByProject = new Map<string, ProjectMarketTarget[]>();
  for (const t of targetsRes.data ?? []) {
    const list = targetsByProject.get(t.project_id) ?? [];
    list.push({
      id: t.id,
      projectId: t.project_id,
      countryCode: t.country_code,
      languageCode: t.language_code,
      searchEngineCode: t.search_engine_code as 'google' | 'yandex' | 'bing',
      device: t.device as 'desktop' | 'mobile' | 'both',
      assignedProvider: t.assigned_provider,
      coverageStatus: t.coverage_status as CoverageStatus,
      isActive: Boolean(t.is_active),
      createdAt: t.created_at,
    });
    targetsByProject.set(t.project_id, list);
  }

  const compsByProject = new Map<string, ProjectCompetitor[]>();
  for (const c of compsRes.data ?? []) {
    const list = compsByProject.get(c.project_id) ?? [];
    list.push({
      id: c.id,
      projectId: c.project_id,
      domain: c.domain,
      label: c.label ?? '',
      createdAt: c.created_at,
    });
    compsByProject.set(c.project_id, list);
  }

  return (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    organizationId: p.organization_id,
    name: p.name,
    websiteUrl: p.website_url,
    businessDescription: p.business_description ?? '',
    industry: p.industry ?? '',
    targetAudience: p.target_audience ?? '',
    primaryCountryCode: p.primary_country_code,
    businessGoals: p.business_goals ?? '',
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    marketTargets: targetsByProject.get(p.id) ?? [],
    competitors: compsByProject.get(p.id) ?? [],
  }));
}

export async function getProjectById(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string
): Promise<Project | null> {
  const [projRes, targetsRes, compsRes] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'id, organization_id, name, website_url, business_description, industry, target_audience, primary_country_code, business_goals, created_at, updated_at'
      )
      .eq('organization_id', orgId)
      .eq('id', projectId)
      .maybeSingle(),
    supabase
      .from('project_market_targets')
      .select(
        'id, project_id, country_code, language_code, search_engine_code, device, assigned_provider, coverage_status, is_active, created_at'
      )
      .eq('organization_id', orgId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    supabase
      .from('project_competitors')
      .select('id, project_id, domain, label, created_at')
      .eq('organization_id', orgId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
  ]);

  if (projRes.error || !projRes.data) return null;
  const p = projRes.data;

  return {
    id: p.id,
    organizationId: p.organization_id,
    name: p.name,
    websiteUrl: p.website_url,
    businessDescription: p.business_description ?? '',
    industry: p.industry ?? '',
    targetAudience: p.target_audience ?? '',
    primaryCountryCode: p.primary_country_code,
    businessGoals: p.business_goals ?? '',
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    marketTargets: (targetsRes.data ?? []).map((t) => ({
      id: t.id,
      projectId: t.project_id,
      countryCode: t.country_code,
      languageCode: t.language_code,
      searchEngineCode: t.search_engine_code as 'google' | 'yandex' | 'bing',
      device: t.device as 'desktop' | 'mobile' | 'both',
      assignedProvider: t.assigned_provider,
      coverageStatus: t.coverage_status as CoverageStatus,
      isActive: Boolean(t.is_active),
      createdAt: t.created_at,
    })),
    competitors: (compsRes.data ?? []).map((c) => ({
      id: c.id,
      projectId: c.project_id,
      domain: c.domain,
      label: c.label ?? '',
      createdAt: c.created_at,
    })),
  };
}

export async function createProject(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    createdByUserId: string;
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
): Promise<Project> {
  const { data: created, error: projErr } = await supabase
    .from('projects')
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      website_url: input.websiteUrl,
      business_description: input.businessDescription,
      industry: input.industry,
      target_audience: input.targetAudience,
      primary_country_code: input.primaryCountryCode.toUpperCase(),
      business_goals: input.businessGoals,
      created_by: input.createdByUserId,
    })
    .select('id')
    .single();

  if (projErr || !created) {
    throw new Error(projErr?.message || 'Unable to create project');
  }

  const projectId = created.id as string;

  try {
    const marketRows = input.marketTargets.map((t) => {
      const resolution = resolveMarketProvider(t.countryCode, t.languageCode, t.searchEngineCode);
      return {
        organization_id: input.organizationId,
        project_id: projectId,
        country_code: resolution.countryCode,
        language_code: resolution.languageCode,
        search_engine_code: resolution.searchEngineCode,
        device: t.device,
        assigned_provider: resolution.assignedProvider,
        coverage_status: resolution.coverageStatus,
        is_active: true,
      };
    });

    if (marketRows.length > 0) {
      const { error: mErr } = await supabase.from('project_market_targets').insert(marketRows);
      if (mErr) throw new Error(mErr.message);
    }

    if (input.competitors.length > 0) {
      const compRows = input.competitors.map((c) => ({
        organization_id: input.organizationId,
        project_id: projectId,
        domain: c.domain.toLowerCase(),
        label: c.label ?? '',
      }));
      const { error: cErr } = await supabase.from('project_competitors').insert(compRows);
      if (cErr) throw new Error(cErr.message);
    }

    await recordAuditLog(supabase, {
      organizationId: input.organizationId,
      actorUserId: input.createdByUserId,
      action: 'project.created',
      entityType: 'project',
      entityId: projectId,
      metadata: { name: input.name, targets: input.marketTargets.length },
    });

    const hydrated = await getProjectById(supabase, input.organizationId, projectId);
    if (!hydrated) {
      throw new Error('Project created but could not be loaded');
    }
    return hydrated;
  } catch (err) {
    await supabase.from('projects').delete().eq('id', projectId).eq('organization_id', input.organizationId);
    throw err;
  }
}

export async function addMarketTargetToProject(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string,
  actorUserId: string,
  target: {
    countryCode: string;
    languageCode: string;
    searchEngineCode: 'google' | 'yandex' | 'bing';
    device: 'desktop' | 'mobile' | 'both';
  }
): Promise<Project | null> {
  const existing = await getProjectById(supabase, orgId, projectId);
  if (!existing) return null;

  const resolution = resolveMarketProvider(
    target.countryCode,
    target.languageCode,
    target.searchEngineCode
  );

  const { error } = await supabase
    .from('project_market_targets')
    .upsert(
      {
        organization_id: orgId,
        project_id: projectId,
        country_code: resolution.countryCode,
        language_code: resolution.languageCode,
        search_engine_code: resolution.searchEngineCode,
        device: target.device,
        assigned_provider: resolution.assignedProvider,
        coverage_status: resolution.coverageStatus,
        is_active: true,
      },
      { onConflict: 'project_id,country_code,language_code,search_engine_code', ignoreDuplicates: true }
    );

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('organization_id', orgId);

  await recordAuditLog(supabase, {
    organizationId: orgId,
    actorUserId,
    action: 'project.market_added',
    entityType: 'project',
    entityId: projectId,
    metadata: {
      countryCode: resolution.countryCode,
      languageCode: resolution.languageCode,
      searchEngineCode: resolution.searchEngineCode,
    },
  });

  return getProjectById(supabase, orgId, projectId);
}

export async function addCompetitorToProject(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string,
  actorUserId: string,
  competitor: { domain: string; label?: string }
): Promise<Project | null> {
  const existing = await getProjectById(supabase, orgId, projectId);
  if (!existing) return null;

  const cleanDomain = competitor.domain.toLowerCase();
  const { error } = await supabase
    .from('project_competitors')
    .upsert(
      {
        organization_id: orgId,
        project_id: projectId,
        domain: cleanDomain,
        label: competitor.label ?? '',
      },
      { onConflict: 'project_id,domain', ignoreDuplicates: true }
    );

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('organization_id', orgId);

  await recordAuditLog(supabase, {
    organizationId: orgId,
    actorUserId,
    action: 'project.competitor_added',
    entityType: 'project',
    entityId: projectId,
    metadata: { domain: cleanDomain },
  });

  return getProjectById(supabase, orgId, projectId);
}

export async function deleteProjectForOrg(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string,
  actorUserId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('organization_id', orgId)
    .select('id');

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) return false;

  await recordAuditLog(supabase, {
    organizationId: orgId,
    actorUserId,
    action: 'project.deleted',
    entityType: 'project',
    entityId: projectId,
    metadata: {},
  });

  return true;
}

export async function listOrgMembersAndInvites(
  supabase: SupabaseClient,
  orgId: string,
  includeInvites = true
): Promise<{
  members: OrganizationMemberItem[];
  invitations: OrganizationInvitationItem[];
}> {
  const membersRes = await supabase
    .from('organization_members')
    .select('id, user_id, role, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });

  if (membersRes.error) {
    throw new Error('Failed to load organization members');
  }

  const memberRows = membersRes.data ?? [];
  const userIds = memberRows.map((m) => m.user_id);

  const profileMap = new Map<string, { email: string; fullName: string }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds);

    for (const p of profiles ?? []) {
      profileMap.set(p.id, { email: p.email, fullName: p.full_name });
    }
  }

  const members: OrganizationMemberItem[] = memberRows.map((m) => {
    const profile = profileMap.get(m.user_id);
    return {
      id: m.id,
      userId: m.user_id,
      email: profile?.email ?? '',
      fullName: profile?.fullName || profile?.email || 'Member',
      role: m.role as OrgRole,
      createdAt: m.created_at,
    };
  });

  let invitations: OrganizationInvitationItem[] = [];
  if (includeInvites) {
    const invRes = await supabase
      .from('organization_invitations')
      .select('id, email, role, status, expires_at, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (!invRes.error && invRes.data) {
      invitations = invRes.data.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role as 'admin' | 'analyst' | 'viewer',
        status: i.status,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
      }));
    }
  }

  return { members, invitations };
}

export async function createOrgInvitation(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    email: string;
    role: 'admin' | 'analyst' | 'viewer';
    tokenHash: string;
    invitedByUserId: string;
    expiresAtIso: string;
  }
): Promise<OrganizationInvitationItem> {
  const { data, error } = await supabase
    .from('organization_invitations')
    .insert({
      organization_id: input.organizationId,
      email: input.email.toLowerCase(),
      role: input.role,
      token_hash: input.tokenHash,
      status: 'pending',
      invited_by: input.invitedByUserId,
      expires_at: input.expiresAtIso,
    })
    .select('id, email, role, status, expires_at, created_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Unable to create organization invitation');
  }

  await recordAuditLog(supabase, {
    organizationId: input.organizationId,
    actorUserId: input.invitedByUserId,
    action: 'member.invited',
    entityType: 'organization_invitation',
    entityId: data.id,
    metadata: { email: data.email, role: data.role },
  });

  return {
    id: data.id,
    email: data.email,
    role: data.role as 'admin' | 'analyst' | 'viewer',
    status: data.status,
    expiresAt: data.expires_at,
    createdAt: data.created_at,
  };
}

export async function acceptOrganizationInvitationRpc(
  supabase: SupabaseClient,
  rawToken: string
): Promise<OrganizationSummary> {
  const { data, error } = await supabase.rpc('accept_organization_invitation', {
    p_raw_token: rawToken,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Unable to accept invitation');
  }

  return data as OrganizationSummary;
}

export async function recordAuditLog(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: input.metadata,
  });
}

export async function listAuditLogsForOrg(
  supabase: SupabaseClient,
  orgId: string,
  limit = 25
): Promise<AuditLogItem[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, actor_user_id, action, entity_type, entity_id, metadata, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error('Failed to load audit logs');
  }

  const rows = data ?? [];
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => Boolean(id)))
  );
  const emailMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', actorIds);
    for (const p of profiles ?? []) {
      emailMap.set(p.id, p.email);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id ?? null,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    actorEmail: r.actor_user_id ? emailMap.get(r.actor_user_id) ?? null : null,
    createdAt: r.created_at,
  }));
}

export async function insertContactLead(
  supabase: SupabaseClient,
  input: {
    fullName: string;
    email: string;
    company: string;
    countryCode: string;
    message: string;
  }
): Promise<{ ok: true; id: string; createdAt: string }> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const { error } = await supabase.from('contact_leads').insert({
    id,
    full_name: input.fullName,
    email: input.email.toLowerCase(),
    company: input.company,
    country_code: input.countryCode.toUpperCase(),
    message: input.message,
    created_at: createdAt,
  });

  if (error) {
    throw new Error('Unable to record inquiry at this time');
  }

  return { ok: true, id, createdAt };
}
