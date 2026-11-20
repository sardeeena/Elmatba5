import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkMemberEntitlement,
  checkProjectEntitlement,
  normalizeCompetitorDomain,
  normalizeWebsiteUrl,
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

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function createOrgWithBootstrap(
  supabase: SupabaseClient,
  input: {
    name: string;
    businessType: BusinessType;
    billingCountryCode: string;
  }
): Promise<OrganizationSummary> {
  return createOrganizationAtomic(supabase, {
    name: input.name,
    slug: slugifyOrgName(input.name),
    businessType: input.businessType,
    billingCountryCode: input.billingCountryCode,
  });
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

  return createProject(supabase, {
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
  rawToken: string
): Promise<OrganizationSummary> {
  try {
    return await acceptOrganizationInvitationRpc(supabase, rawToken);
  } catch (err) {
    const message = (err as Error).message || 'Unable to accept invitation';
    if (
      message.includes('not found') ||
      message.includes('expired') ||
      message.includes('already been accepted') ||
      message.includes('different email') ||
      message.includes('quota') ||
      message.includes('Invalid invitation')
    ) {
      throw new HttpError(400, message);
    }
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
