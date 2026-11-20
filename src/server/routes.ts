import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { normalizeCompetitorDomain, resolveMarketProvider } from '../lib/marketRules.ts';
import type { ServerEnvConfig } from './config/env.ts';
import { createAnonSupabaseClient } from './config/supabase.ts';
import {
  type AuthenticatedRequest,
  createRequireAuth,
  getValidatedOrgAccess,
  isValidUuid,
} from './middleware/auth.ts';
import { rateLimit } from './middleware/security.ts';
import {
  addCompetitorToProject,
  addMarketTargetToProject,
  deleteProjectForOrg,
  getProjectById,
  insertContactLead,
  listMarketRegistry,
  listOrganizationsForUser,
  listPlans,
  listProjectsForOrg,
  updateUserLocale,
} from './repositories/supabaseRepo.ts';
import {
  acceptTeamInvitation,
  assembleGdprExport,
  assembleOrgOverview,
  completeOnboardingAtomic,
  createOrgWithBootstrap,
  createTeamInvitation,
  createTenantProject,
  HttpError,
} from './services/orgService.ts';
import {
  acceptInvitationSchema,
  addCompetitorSchema,
  contactLeadSchema,
  createOrgSchema,
  createProjectSchema,
  inviteMemberSchema,
  marketTargetInputSchema,
  onboardingSchema,
  updateLocaleSchema,
} from './validation.ts';

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
}

export function createApiRouter(env: ServerEnvConfig) {
  const router = express.Router();
  const requireAuth = createRequireAuth(env);

  // Safe public runtime configuration (ONLY public URL & Publishable key — never secrets)
  router.get('/config/public', (_req, res) => {
    res.json({
      configured: env.supabaseConfigured,
      supabaseUrl: env.supabaseUrl,
      supabasePublishableKey: env.supabasePublishableKey,
    });
  });

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      if (!env.supabaseConfigured) {
        return res.json({
          status: 'degraded',
          service: 'el-matba5-api',
          database: 'unconfigured',
          schemaReady: false,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const anon = createAnonSupabaseClient(env);
        const { error } = await anon.from('plans').select('id').limit(1);
        return res.json({
          status: error ? 'degraded' : 'ok',
          service: 'el-matba5-api',
          database: 'supabase-postgresql',
          schemaReady: !error,
          timestamp: new Date().toISOString(),
        });
      } catch {
        return res.json({
          status: 'degraded',
          service: 'el-matba5-api',
          database: 'supabase-postgresql',
          schemaReady: false,
          timestamp: new Date().toISOString(),
        });
      }
    })
  );

  // --- AUTHENTICATED USER PROFILE & WORKSPACES ---
  router.get(
    '/profile',
    requireAuth,
    asyncHandler(async (req, res) => {
      const organizations = await listOrganizationsForUser(req.supabase!, req.authUser!.id);
      res.json({ user: req.authUser, organizations });
    })
  );

  router.patch(
    '/profile/locale',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = updateLocaleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid locale' });
      }
      await updateUserLocale(req.supabase!, req.authUser!.id, parsed.data.locale);
      res.json({ preferredLocale: parsed.data.locale });
    })
  );

  // --- MARKETS & PROVIDER REGISTRY (Public Reference from PostgreSQL) ---
  router.get(
    '/markets/registry',
    asyncHandler(async (_req, res) => {
      if (!env.supabaseConfigured) {
        return res.status(503).json({
          error: 'Supabase database is not configured.',
        });
      }
      const anon = createAnonSupabaseClient(env);
      try {
        const registry = await listMarketRegistry(anon);
        res.json(registry);
      } catch {
        res.status(503).json({
          error:
            'Database schema is not initialized yet. Apply ordered migrations 0001 through 0005 under supabase/migrations/ in Supabase.',
        });
      }
    })
  );

  router.post('/markets/resolve', rateLimit(60, 60_000), (req, res) => {
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
  router.get(
    '/billing/plans',
    asyncHandler(async (_req, res) => {
      if (!env.supabaseConfigured) {
        return res.status(503).json({
          error: 'Supabase database is not configured.',
        });
      }
      const anon = createAnonSupabaseClient(env);
      try {
        const plans = await listPlans(anon);
        res.json({
          plans,
          paymentProviders: [
            {
              code: 'paymob',
              name: 'Paymob Egypt',
              status: 'coming_soon_phase_6',
              note: 'Server-side HMAC webhook verification required before enabling live charges.',
            },
          ],
        });
      } catch {
        res.status(503).json({
          error:
            'Database schema is not initialized yet. Apply ordered migrations 0001 through 0005 under supabase/migrations/ in Supabase.',
        });
      }
    })
  );

  // --- GUIDED ONBOARDING (Single Atomic DB Transaction) ---
  router.post(
    '/onboarding',
    requireAuth,
    rateLimit(10, 60_000),
    asyncHandler(async (req, res) => {
      const parsed = onboardingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message ?? 'Invalid onboarding input' });
      }

      const result = await completeOnboardingAtomic(req.supabase!, {
        organization: parsed.data.organization,
        project: parsed.data.project,
      });

      res.status(201).json(result);
    })
  );

  // --- ORGANIZATIONS ---
  router.get(
    '/organizations',
    requireAuth,
    asyncHandler(async (req, res) => {
      const organizations = await listOrganizationsForUser(req.supabase!, req.authUser!.id);
      res.json({ organizations });
    })
  );

  router.post(
    '/organizations',
    requireAuth,
    rateLimit(10, 60_000),
    asyncHandler(async (req, res) => {
      const parsed = createOrgSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message ?? 'Invalid organization data' });
      }
      const organization = await createOrgWithBootstrap(req.supabase!, parsed.data);
      res.status(201).json({ organization });
    })
  );

  router.get(
    '/organizations/:orgId/overview',
    requireAuth,
    asyncHandler(async (req, res) => {
      const access = await getValidatedOrgAccess(req, res, String(req.params.orgId), 'viewer');
      if (!access) return;

      const overview = await assembleOrgOverview(
        req.supabase!,
        access.organizationId,
        req.authUser!.id,
        access.role
      );
      res.json(overview);
    })
  );

  router.post(
    '/organizations/:orgId/invitations',
    requireAuth,
    rateLimit(20, 60_000),
    asyncHandler(async (req, res) => {
      const access = await getValidatedOrgAccess(req, res, String(req.params.orgId), 'admin');
      if (!access) return;

      const parsed = inviteMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid invitation' });
      }

      const result = await createTeamInvitation(req.supabase!, {
        organizationId: access.organizationId,
        actorUserId: req.authUser!.id,
        email: parsed.data.email,
        role: parsed.data.role,
      });

      res.status(201).json(result);
    })
  );

  router.post(
    '/invitations/accept',
    requireAuth,
    rateLimit(10, 60_000),
    asyncHandler(async (req, res) => {
      const parsed = acceptInvitationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message ?? 'Invalid invitation token' });
      }

      const organization = await acceptTeamInvitation(req.supabase!, parsed.data.token, {
        emailConfirmed: Boolean(req.authEmailConfirmed),
      });
      res.json({ organization });
    })
  );

  // GDPR Self-Service Data Export (Bearer Auth + Org Admin+ + RLS Enforced)
  router.get(
    '/organizations/:orgId/gdpr-export',
    requireAuth,
    rateLimit(10, 60_000),
    asyncHandler(async (req, res) => {
      const access = await getValidatedOrgAccess(req, res, String(req.params.orgId), 'admin');
      if (!access) return;

      const exportData = await assembleGdprExport(req.supabase!, access.organizationId, req.authUser!);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="elmatba5-gdpr-export-${access.organizationId}.json"`
      );
      res.json(exportData);
    })
  );

  // --- PROJECTS (Strictly Tenant-Scoped via RLS + App-Level Checks) ---
  router.get(
    '/organizations/:orgId/projects',
    requireAuth,
    asyncHandler(async (req, res) => {
      const access = await getValidatedOrgAccess(req, res, String(req.params.orgId), 'viewer');
      if (!access) return;
      const projects = await listProjectsForOrg(req.supabase!, access.organizationId);
      res.json({ projects });
    })
  );

  router.post(
    '/organizations/:orgId/projects',
    requireAuth,
    rateLimit(20, 60_000),
    asyncHandler(async (req, res) => {
      const access = await getValidatedOrgAccess(req, res, String(req.params.orgId), 'analyst');
      if (!access) return;

      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid project data' });
      }

      const project = await createTenantProject(req.supabase!, {
        organizationId: access.organizationId,
        actorUserId: req.authUser!.id,
        ...parsed.data,
      });
      res.status(201).json({ project });
    })
  );

  router.get(
    '/organizations/:orgId/projects/:projectId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const access = await getValidatedOrgAccess(req, res, String(req.params.orgId), 'viewer');
      if (!access) return;

      const projectId = String(req.params.projectId).trim();
      if (!isValidUuid(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID format' });
      }

      const project = await getProjectById(req.supabase!, access.organizationId, projectId);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json({ project });
    })
  );

  router.post(
    '/organizations/:orgId/projects/:projectId/markets',
    requireAuth,
    rateLimit(30, 60_000),
    asyncHandler(async (req, res) => {
      const access = await getValidatedOrgAccess(req, res, String(req.params.orgId), 'analyst');
      if (!access) return;

      const projectId = String(req.params.projectId).trim();
      if (!isValidUuid(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID format' });
      }

      const parsed = marketTargetInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message ?? 'Invalid market target' });
      }

      const updated = await addMarketTargetToProject(
        req.supabase!,
        access.organizationId,
        projectId,
        req.authUser!.id,
        parsed.data
      );
      if (!updated) return res.status(404).json({ error: 'Project not found' });
      res.status(201).json({ project: updated });
    })
  );

  router.post(
    '/organizations/:orgId/projects/:projectId/competitors',
    requireAuth,
    rateLimit(30, 60_000),
    asyncHandler(async (req, res) => {
      const access = await getValidatedOrgAccess(req, res, String(req.params.orgId), 'analyst');
      if (!access) return;

      const projectId = String(req.params.projectId).trim();
      if (!isValidUuid(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID format' });
      }

      const parsed = addCompetitorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid competitor domain' });
      }

      let domain: string;
      try {
        domain = normalizeCompetitorDomain(parsed.data.domain);
      } catch (err) {
        return res.status(400).json({ error: (err as Error).message });
      }

      const updated = await addCompetitorToProject(
        req.supabase!,
        access.organizationId,
        projectId,
        req.authUser!.id,
        { domain, label: parsed.data.label }
      );
      if (!updated) return res.status(404).json({ error: 'Project not found' });
      res.status(201).json({ project: updated });
    })
  );

  router.delete(
    '/organizations/:orgId/projects/:projectId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const access = await getValidatedOrgAccess(req, res, String(req.params.orgId), 'admin');
      if (!access) return;

      const projectId = String(req.params.projectId).trim();
      if (!isValidUuid(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID format' });
      }

      const deleted = await deleteProjectForOrg(
        req.supabase!,
        access.organizationId,
        projectId,
        req.authUser!.id
      );
      if (!deleted) return res.status(404).json({ error: 'Project not found' });
      res.json({ deleted: true });
    })
  );

  // --- PUBLIC CONTACT LEAD CAPTURE ---
  router.post(
    '/contact',
    rateLimit(15, 60_000),
    asyncHandler(async (req, res) => {
      if (!env.supabaseConfigured) {
        return res.status(503).json({
          error: 'Contact service is temporarily unavailable until Supabase configuration is set.',
        });
      }

      const parsed = contactLeadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid contact form' });
      }

      const anon = createAnonSupabaseClient(env);
      const lead = await insertContactLead(anon, parsed.data);
      res.status(201).json(lead);
    })
  );

  // Centralized error handler — never leak raw SQL or stack traces to callers
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    const status =
      typeof (err as { status?: unknown })?.status === 'number'
        ? ((err as { status: number }).status)
        : 500;
    const rawMsg = err instanceof Error ? err.message : 'Unexpected server error';
    if (status >= 500) {
      console.error('[API Error]', rawMsg);
      return res.status(status).json({ error: 'Internal server error' });
    }
    return res.status(status).json({ error: rawMsg });
  });

  return router;
}
