import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import {
  checkMemberEntitlement,
  checkProjectEntitlement,
  normalizeCompetitorDomain,
  normalizeWebsiteUrl,
  resolveMarketProvider,
} from '../lib/marketRules.ts';
import type { OrgRole, User } from '../lib/types.ts';
import {
  addCompetitorToProject,
  addMarketTargetToProject,
  createOrgInvitation,
  createOrganization,
  createProject,
  createUser,
  deleteProjectForOrg,
  findUserAuthByEmail,
  findUserById,
  getDb,
  getOrgMembership,
  getOrgUsage,
  getPlanById,
  getProjectById,
  insertContactLead,
  listAuditLogsForOrg,
  listMarketRegistry,
  listOrgMembersAndInvites,
  listOrganizationsForUser,
  listPlans,
  listProjectsForOrg,
  updateUserLocale,
} from './db.ts';
import {
  hashPassword,
  parseCookies,
  SESSION_COOKIE_NAME,
  signSessionToken,
  slugifyOrgName,
  verifyPassword,
  verifySessionToken,
} from './security.ts';
import {
  contactLeadSchema,
  createOrgSchema,
  createProjectSchema,
  inviteMemberSchema,
  loginSchema,
  marketTargetInputSchema,
  onboardingSchema,
  registerSchema,
} from './validation.ts';

interface AuthenticatedRequest extends Request {
  authUser?: User;
}

const ROLE_WEIGHT: Record<OrgRole, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3,
  owner: 4,
};

// Simple per-IP sliding window rate limiter for auth & contact routes
const rateBuckets = new Map<string, number[]>();
function rateLimit(maxHits: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const history = (rateBuckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxHits) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
    }
    history.push(now);
    rateBuckets.set(key, history);
    next();
  };
}

function setSessionCookie(res: Response, user: User): void {
  const token = signSessionToken({ userId: user.id, email: user.email });
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  const db = getDb();
  const user = findUserById(db, payload.userId);
  if (!user) {
    return res.status(401).json({ error: 'Account not found' });
  }
  req.authUser = user;
  next();
}

function getValidatedOrgAccess(
  req: AuthenticatedRequest,
  res: Response,
  orgId: string,
  minRole: OrgRole = 'viewer'
) {
  const db = getDb();
  const membership = getOrgMembership(db, orgId, req.authUser!.id);
  if (!membership) {
    res.status(403).json({ error: 'Forbidden: You do not belong to this organization' });
    return null;
  }
  if (ROLE_WEIGHT[membership.role] < ROLE_WEIGHT[minRole]) {
    res.status(403).json({ error: `Forbidden: Requires ${minRole} role or higher` });
    return null;
  }
  return membership;
}

export function createApiRouter() {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'el-matba5-api', timestamp: new Date().toISOString() });
  });

  // --- AUTH ---
  router.post('/auth/register', rateLimit(20, 60_000), (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const db = getDb();
    const existing = findUserAuthByEmail(db, parsed.data.email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const user = createUser(db, {
      email: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
      fullName: parsed.data.fullName,
      preferredLocale: parsed.data.preferredLocale,
    });
    setSessionCookie(res, user);
    res.status(201).json({ user, organizations: [] });
  });

  router.post('/auth/login', rateLimit(20, 60_000), (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid credentials' });
    }
    const db = getDb();
    const found = findUserAuthByEmail(db, parsed.data.email);
    if (!found || !verifyPassword(parsed.data.password, found.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user: User = {
      id: found.id,
      email: found.email,
      fullName: found.fullName,
      preferredLocale: found.preferredLocale,
      createdAt: found.createdAt,
    };
    setSessionCookie(res, user);
    const organizations = listOrganizationsForUser(db, user.id);
    res.json({ user, organizations });
  });

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  router.get('/auth/session', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) {
      return res.json({ authenticated: false, user: null, organizations: [] });
    }
    const payload = verifySessionToken(token);
    if (!payload) {
      return res.json({ authenticated: false, user: null, organizations: [] });
    }
    const db = getDb();
    const user = findUserById(db, payload.userId);
    if (!user) {
      return res.json({ authenticated: false, user: null, organizations: [] });
    }
    const organizations = listOrganizationsForUser(db, user.id);
    return res.json({ authenticated: true, user, organizations });
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const organizations = listOrganizationsForUser(db, req.authUser!.id);
    res.json({ user: req.authUser, organizations });
  });

  router.patch('/auth/locale', requireAuth, (req: AuthenticatedRequest, res) => {
    const locale = req.body?.locale === 'ar' ? 'ar' : 'en';
    const db = getDb();
    updateUserLocale(db, req.authUser!.id, locale);
    res.json({ preferredLocale: locale });
  });

  // --- MARKETS & PROVIDER REGISTRY (Public Reference) ---
  router.get('/markets/registry', (_req, res) => {
    const db = getDb();
    res.json(listMarketRegistry(db));
  });

  router.post('/markets/resolve', (req, res) => {
    const parsed = marketTargetInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid market target' });
    }
    const resolution = resolveMarketProvider(
      parsed.data.countryCode,
      parsed.data.languageCode,
      parsed.data.searchEngineCode
    );
    res.json(resolution);
  });

  // --- PLANS & BILLING ---
  router.get('/billing/plans', (_req, res) => {
    const db = getDb();
    res.json({
      plans: listPlans(db),
      paymentProviders: [
        {
          code: 'paymob',
          name: 'Paymob Egypt',
          status: 'ready_for_credentials',
          note: 'Server-side HMAC webhook verification required before enabling live charges.',
        },
      ],
    });
  });

  // --- GUIDED ONBOARDING ---
  router.post('/onboarding', requireAuth, (req: AuthenticatedRequest, res) => {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid onboarding input' });
    }

    let normalizedUrl: string;
    const normalizedCompetitors: Array<{ domain: string; label?: string }> = [];
    try {
      normalizedUrl = normalizeWebsiteUrl(parsed.data.project.websiteUrl);
      for (const comp of parsed.data.project.competitors) {
        if (!comp.domain.trim()) continue;
        normalizedCompetitors.push({
          domain: normalizeCompetitorDomain(comp.domain),
          label: comp.label,
        });
      }
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const db = getDb();
    const org = createOrganization(db, {
      name: parsed.data.organization.name,
      slug: slugifyOrgName(parsed.data.organization.name),
      businessType: parsed.data.organization.businessType,
      billingCountryCode: parsed.data.organization.billingCountryCode,
      ownerUserId: req.authUser!.id,
    });

    const project = createProject(db, {
      organizationId: org.id,
      createdByUserId: req.authUser!.id,
      name: parsed.data.project.name,
      websiteUrl: normalizedUrl,
      businessDescription: parsed.data.project.businessDescription,
      industry: parsed.data.project.industry,
      targetAudience: parsed.data.project.targetAudience,
      primaryCountryCode: parsed.data.project.primaryCountryCode,
      businessGoals: parsed.data.project.businessGoals,
      marketTargets: parsed.data.project.marketTargets,
      competitors: normalizedCompetitors,
    });

    res.status(201).json({ organization: org, project });
  });

  // --- ORGANIZATIONS ---
  router.get('/organizations', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    res.json({ organizations: listOrganizationsForUser(db, req.authUser!.id) });
  });

  router.post('/organizations', requireAuth, (req: AuthenticatedRequest, res) => {
    const parsed = createOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid organization data' });
    }
    const db = getDb();
    const org = createOrganization(db, {
      name: parsed.data.name,
      slug: slugifyOrgName(parsed.data.name),
      businessType: parsed.data.businessType,
      billingCountryCode: parsed.data.billingCountryCode,
      ownerUserId: req.authUser!.id,
    });
    res.status(201).json({ organization: org });
  });

  router.get('/organizations/:orgId/overview', requireAuth, (req: AuthenticatedRequest, res) => {
    const access = getValidatedOrgAccess(req, res, String(req.params.orgId), 'viewer');
    if (!access) return;

    const db = getDb();
    const orgs = listOrganizationsForUser(db, req.authUser!.id);
    const org = orgs.find((o) => o.id === access.organizationId);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const plan = getPlanById(db, org.planId);
    const usage = getOrgUsage(db, org.id);
    const projects = listProjectsForOrg(db, org.id);
    const { members, invitations } = listOrgMembersAndInvites(db, org.id);
    const auditLogs = listAuditLogsForOrg(db, org.id, 25);

    res.json({
      organization: org,
      plan,
      usage,
      projects,
      members,
      invitations,
      auditLogs,
    });
  });

  router.post('/organizations/:orgId/invitations', requireAuth, (req: AuthenticatedRequest, res) => {
    const access = getValidatedOrgAccess(req, res, String(req.params.orgId), 'admin');
    if (!access) return;

    const parsed = inviteMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid invitation' });
    }

    const db = getDb();
    const orgs = listOrganizationsForUser(db, req.authUser!.id);
    const org = orgs.find((o) => o.id === access.organizationId);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const plan = getPlanById(db, org.planId);
    const { members } = listOrgMembersAndInvites(db, org.id);
    if (plan) {
      const check = checkMemberEntitlement(plan, members.length);
      if (!check.allowed) {
        return res.status(402).json({ error: check.reason });
      }
    }

    const invitation = createOrgInvitation(db, {
      organizationId: org.id,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedByUserId: req.authUser!.id,
    });
    res.status(201).json({ invitation });
  });

  // GDPR Self-Service Data Export (Scoped strictly to authorized org)
  router.get('/organizations/:orgId/gdpr-export', requireAuth, (req: AuthenticatedRequest, res) => {
    const access = getValidatedOrgAccess(req, res, String(req.params.orgId), 'admin');
    if (!access) return;

    const db = getDb();
    const orgs = listOrganizationsForUser(db, req.authUser!.id);
    const org = orgs.find((o) => o.id === access.organizationId);
    const projects = listProjectsForOrg(db, access.organizationId);
    const { members, invitations } = listOrgMembersAndInvites(db, access.organizationId);
    const auditLogs = listAuditLogsForOrg(db, access.organizationId, 100);

    res.setHeader('Content-Disposition', `attachment; filename="elmatba5-gdpr-export-${access.organizationId}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      requestedBy: req.authUser,
      organization: org,
      projects,
      members,
      invitations,
      auditLogs,
    });
  });

  // --- PROJECTS (Strictly Tenant-Scoped) ---
  router.get('/organizations/:orgId/projects', requireAuth, (req: AuthenticatedRequest, res) => {
    const access = getValidatedOrgAccess(req, res, String(req.params.orgId), 'viewer');
    if (!access) return;
    const db = getDb();
    res.json({ projects: listProjectsForOrg(db, access.organizationId) });
  });

  router.post('/organizations/:orgId/projects', requireAuth, (req: AuthenticatedRequest, res) => {
    const access = getValidatedOrgAccess(req, res, String(req.params.orgId), 'analyst');
    if (!access) return;

    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid project data' });
    }

    let normalizedUrl: string;
    const normalizedCompetitors: Array<{ domain: string; label?: string }> = [];
    try {
      normalizedUrl = normalizeWebsiteUrl(parsed.data.websiteUrl);
      for (const comp of parsed.data.competitors) {
        if (!comp.domain.trim()) continue;
        normalizedCompetitors.push({
          domain: normalizeCompetitorDomain(comp.domain),
          label: comp.label,
        });
      }
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const db = getDb();
    const orgs = listOrganizationsForUser(db, req.authUser!.id);
    const org = orgs.find((o) => o.id === access.organizationId);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const plan = getPlanById(db, org.planId);
    const usage = getOrgUsage(db, org.id);
    if (plan) {
      const check = checkProjectEntitlement(plan, usage);
      if (!check.allowed) {
        return res.status(402).json({ error: check.reason });
      }
    }

    const project = createProject(db, {
      organizationId: access.organizationId,
      createdByUserId: req.authUser!.id,
      name: parsed.data.name,
      websiteUrl: normalizedUrl,
      businessDescription: parsed.data.businessDescription,
      industry: parsed.data.industry,
      targetAudience: parsed.data.targetAudience,
      primaryCountryCode: parsed.data.primaryCountryCode,
      businessGoals: parsed.data.businessGoals,
      marketTargets: parsed.data.marketTargets,
      competitors: normalizedCompetitors,
    });

    res.status(201).json({ project });
  });

  router.get(
    '/organizations/:orgId/projects/:projectId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const access = getValidatedOrgAccess(req, res, String(req.params.orgId), 'viewer');
      if (!access) return;
      const db = getDb();
      const project = getProjectById(db, access.organizationId, String(req.params.projectId));
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json({ project });
    }
  );

  router.post(
    '/organizations/:orgId/projects/:projectId/markets',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const access = getValidatedOrgAccess(req, res, String(req.params.orgId), 'analyst');
      if (!access) return;

      const parsed = marketTargetInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid market target' });
      }

      const db = getDb();
      const updated = addMarketTargetToProject(
        db,
        access.organizationId,
        String(req.params.projectId),
        req.authUser!.id,
        parsed.data
      );
      if (!updated) return res.status(404).json({ error: 'Project not found' });
      res.status(201).json({ project: updated });
    }
  );

  router.post(
    '/organizations/:orgId/projects/:projectId/competitors',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const access = getValidatedOrgAccess(req, res, String(req.params.orgId), 'analyst');
      if (!access) return;

      let domain: string;
      try {
        domain = normalizeCompetitorDomain(String(req.body?.domain ?? ''));
      } catch (err) {
        return res.status(400).json({ error: (err as Error).message });
      }

      const db = getDb();
      const updated = addCompetitorToProject(
        db,
        access.organizationId,
        String(req.params.projectId),
        req.authUser!.id,
        { domain, label: typeof req.body?.label === 'string' ? req.body.label.trim() : '' }
      );
      if (!updated) return res.status(404).json({ error: 'Project not found' });
      res.status(201).json({ project: updated });
    }
  );

  router.delete(
    '/organizations/:orgId/projects/:projectId',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      const access = getValidatedOrgAccess(req, res, String(req.params.orgId), 'admin');
      if (!access) return;

      const db = getDb();
      const deleted = deleteProjectForOrg(
        db,
        access.organizationId,
        String(req.params.projectId),
        req.authUser!.id
      );
      if (!deleted) return res.status(404).json({ error: 'Project not found' });
      res.json({ deleted: true });
    }
  );

  // --- PUBLIC CONTACT LEAD CAPTURE ---
  router.post('/contact', rateLimit(15, 60_000), (req, res) => {
    const parsed = contactLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid contact form' });
    }
    const db = getDb();
    const lead = insertContactLead(db, parsed.data);
    res.status(201).json({ ok: true, id: lead.id, createdAt: lead.createdAt });
  });

  return router;
}
