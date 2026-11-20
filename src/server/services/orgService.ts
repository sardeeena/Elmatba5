import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkMemberEntitlement,
  checkProjectEntitlement,
  normalizeCompetitorDomain,
  normalizeWebsiteUrl,
  resolveMarketProvider,
} from '../../lib/marketRules.ts';
import type {
  BusinessType,
  OrgRole,
  OrganizationInvitationItem,
  OrganizationSummary,
  Project,
  User,
} from '../../lib/types.ts';
import {
  acceptOrganizationInvitationRpc,
  completeOnboardingAtomicRpc,
  createOrgInvitation,
  createOrganizationAtomic,
  createProject,
  getOrgUsage,
  getPlanById,
  listAuditLogsForOrg,
  listOrgMembersAndInvites,
  listOrganizationsForUser,
  listProjectsForOrg,
} from '../repositories/supabaseRepo.ts';
import { generateInviteToken, hashInviteToken, slugifyOrgName } from '../security.ts';

/**
 * Deliberate transactional safety policy matching `public.max_owned_organizations_default()`
 * in `0002_phase_2a1_security_hardening.sql`: current `plans` attach to `organizations` and
 * do not define a per-user `max_organizations` entitlement yet.
 */
export const MAX_OWNED_ORGANIZATIONS_DEFAULT = 3;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function mapDomainRpcError(err: unknown): HttpError | null {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (!message) return null;

  if (message.includes('already been completed')) {
    return new HttpError(409, message);
  }
  if (message.includes('limit reached') || message.includes('quota')) {
    return new HttpError(402, message);
  }
  if (message.includes('must be confirmed') || message.includes('different email')) {
    return new HttpError(403, message);
  }
  if (
    message.includes('Invalid') ||
    message.includes('must use') ||
    message.includes('between 2') ||
    message.includes('At least one') ||
    message.includes('Too many') ||
    message.includes('Maximum 20') ||
    message.includes('not supported') ||
    message.includes('not found') ||
    message.includes('expired') ||
    message.includes('already been accepted') ||
    message.includes('no longer active') ||
    message.includes('duplicate key')
  ) {
    return new HttpError(400, message);
  }
  return null;
}

export async function createOrgWithBootstrap(
  supabase: SupabaseClient,
  input: {
    name: string;
    businessType: BusinessType;
    billingCountryCode: string;
  }
): Promise<OrganizationSummary> {
  try {
    return await createOrganizationAtomic(supabase, {
      name: input.name,
      slug: slugifyOrgName(input.name),
      businessType: input.businessType,
      billingCountryCode: input.billingCountryCode,
    });
  } catch (err) {
    const mapped = mapDomainRpcError(err);
    if (mapped) throw mapped;
    throw err;
  }
}

export async function completeOnboardingAtomic(
  supabase: SupabaseClient,
  input: {
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
  }
): Promise<{ organization: OrganizationSummary; project: Project }> {
  let normalizedUrl: string;
  const normalizedCompetitors: Array<{ domain: string; label?: string }> = [];

  try {
    normalizedUrl = normalizeWebsiteUrl(input.project.websiteUrl);
    for (const comp of input.project.competitors) {
      if (!comp.domain.trim()) continue;
      normalizedCompetitors.push({
        domain: normalizeCompetitorDomain(comp.domain),
        label: comp.label,
      });
    }
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }

  const seenTargets = new Set<string>();
  const normalizedTargets = input.project.marketTargets.map((target) => {
    const resolution = resolveMarketProvider(
      target.countryCode,
      target.languageCode,
      target.searchEngineCode
    );
    if (resolution.coverageStatus === 'unsupported') {
      throw new HttpError(400, resolution.explanationEn);
    }
    const tupleKey = `${resolution.countryCode}:${resolution.languageCode}:${resolution.searchEngineCode}`;
    if (seenTargets.has(tupleKey)) {
      throw new HttpError(
        400,
        `Duplicate target market configuration: ${resolution.countryCode} / ${resolution.languageCode} / ${resolution.searchEngineCode}`
      );
    }
    seenTargets.add(tupleKey);
    return {
      countryCode: resolution.countryCode,
      languageCode: resolution.languageCode,
      searchEngineCode: resolution.searchEngineCode,
      device: target.device,
    };
  });

  try {
    return await completeOnboardingAtomicRpc(supabase, {
      organization: {
        name: input.organization.name,
        slug: slugifyOrgName(input.organization.name),
        businessType: input.organization.businessType,
        billingCountryCode: input.organization.billingCountryCode,
      },
      project: {
        ...input.project,
        websiteUrl: normalizedUrl,
        primaryCountryCode: input.project.primaryCountryCode.toUpperCase(),
        marketTargets: normalizedTargets,
        competitors: normalizedCompetitors,
      },
    });
  } catch (err) {
    const mapped = mapDomainRpcError(err);
    if (mapped) throw mapped;
    throw err;
  }
}

export async function createTenantProject(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    actorUserId: string;
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
  let normalizedUrl: string;
  const normalizedCompetitors: Array<{ domain: string; label?: string }> = [];

  try {
    normalizedUrl = normalizeWebsiteUrl(input.websiteUrl);
    for (const comp of input.competitors) {
      if (!comp.domain.trim()) continue;
      normalizedCompetitors.push({
        domain: normalizeCompetitorDomain(comp.domain),
        label: comp.label,
      });
    }
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }

  for (const target of input.marketTargets) {
    const resolution = resolveMarketProvider(
      target.countryCode,
      target.languageCode,
      target.searchEngineCode
    );
    if (resolution.coverageStatus === 'unsupported') {
      throw new HttpError(400, resolution.explanationEn);
    }
  }

  const orgs = await listOrganizationsForUser(supabase, input.actorUserId);
  const org = orgs.find((o) => o.id === input.organizationId);
  if (!org) {
    throw new HttpError(404, 'Organization not found');
  }

  const [plan, usage] = await Promise.all([
    getPlanById(supabase, org.planId),
    getOrgUsage(supabase, org.id),
  ]);

  if (plan) {
    const check = checkProjectEntitlement(plan, usage);
    if (!check.allowed) {
      throw new HttpError(402, check.reason ?? 'Project plan limit reached');
    }
  }

  try {
    return await createProject(supabase, {
      organizationId: input.organizationId,
      createdByUserId: input.actorUserId,
      name: input.name,
      websiteUrl: normalizedUrl,
      businessDescription: input.businessDescription,
      industry: input.industry,
      targetAudience: input.targetAudience,
      primaryCountryCode: input.primaryCountryCode,
      businessGoals: input.businessGoals,
      marketTargets: input.marketTargets,
      competitors: normalizedCompetitors,
    });
  } catch (err) {
    const mapped = mapDomainRpcError(err);
    if (mapped) throw mapped;
    throw err;
  }
}

export async function createTeamInvitation(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    actorUserId: string;
    email: string;
    role: 'admin' | 'analyst' | 'viewer';
  }
): Promise<{ invitation: OrganizationInvitationItem; inviteToken: string }> {
  const orgs = await listOrganizationsForUser(supabase, input.actorUserId);
  const org = orgs.find((o) => o.id === input.organizationId);
  if (!org) {
    throw new HttpError(404, 'Organization not found');
  }

  const [plan, membersResult] = await Promise.all([
    getPlanById(supabase, org.planId),
    listOrgMembersAndInvites(supabase, org.id, true),
  ]);

  if (plan) {
    const check = checkMemberEntitlement(plan, membersResult.members.length);
    if (!check.allowed) {
      throw new HttpError(402, check.reason ?? 'Team member quota reached');
    }
  }

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAtIso = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  const invitation = await createOrgInvitation(supabase, {
    organizationId: org.id,
    email: input.email,
    role: input.role,
    tokenHash,
    invitedByUserId: input.actorUserId,
    expiresAtIso,
  });

  return { invitation, inviteToken: rawToken };
}

export async function acceptTeamInvitation(
  supabase: SupabaseClient,
  rawToken: string,
  options: { emailConfirmed?: boolean } = {}
): Promise<OrganizationSummary> {
  if (options.emailConfirmed === false) {
    throw new HttpError(403, 'Email address must be confirmed before accepting an invitation');
  }

  try {
    return await acceptOrganizationInvitationRpc(supabase, rawToken);
  } catch (err) {
    const mapped = mapDomainRpcError(err);
    if (mapped) throw mapped;
    throw err;
  }
}

export async function assembleOrgOverview(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  role: OrgRole
) {
  const orgs = await listOrganizationsForUser(supabase, userId);
  const org = orgs.find((o) => o.id === orgId);
  if (!org) {
    throw new HttpError(404, 'Organization not found');
  }

  const canViewInvites = role === 'owner' || role === 'admin';

  const [plan, usage, projects, membersAndInvites, auditLogs] = await Promise.all([
    getPlanById(supabase, org.planId),
    getOrgUsage(supabase, org.id),
    listProjectsForOrg(supabase, org.id),
    listOrgMembersAndInvites(supabase, org.id, canViewInvites),
    listAuditLogsForOrg(supabase, org.id, 25),
  ]);

  return {
    organization: org,
    plan,
    usage,
    projects,
    members: membersAndInvites.members,
    invitations: membersAndInvites.invitations,
    auditLogs,
  };
}

export async function assembleGdprExport(
  supabase: SupabaseClient,
  orgId: string,
  authUser: User
) {
  const orgs = await listOrganizationsForUser(supabase, authUser.id);
  const org = orgs.find((o) => o.id === orgId);
  if (!org) {
    throw new HttpError(404, 'Organization not found');
  }

  const [projects, membersAndInvites, auditLogs] = await Promise.all([
    listProjectsForOrg(supabase, orgId),
    listOrgMembersAndInvites(supabase, orgId, true),
    listAuditLogsForOrg(supabase, orgId, 100),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    requestedBy: authUser,
    organization: org,
    projects,
    members: membersAndInvites.members,
    invitations: membersAndInvites.invitations,
    auditLogs,
  };
}
