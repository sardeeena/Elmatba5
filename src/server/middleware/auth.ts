import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import type { OrgRole, User } from '../../lib/types.ts';
import type { ServerEnvConfig } from '../config/env.ts';
import { createAnonSupabaseClient, createUserSupabaseClient } from '../config/supabase.ts';
import { ensureUserProfile, getOrgMembership } from '../repositories/supabaseRepo.ts';

export interface AuthenticatedRequest extends Request {
  authUser?: User;
  authEmailConfirmed?: boolean;
  accessToken?: string;
  supabase?: SupabaseClient;
}

const ROLE_WEIGHT: Record<OrgRole, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3,
  owner: 4,
};

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    return null;
  }
  return parts[1];
}

/**
 * Strictly requires `email_confirmed_at` on the Supabase Auth user record.
 * Never treats `confirmed_at` alone as email confirmation (since phone/other channels
 * can populate `confirmed_at`).
 */
export function isStrictEmailConfirmed(
  user: { email_confirmed_at?: string | null } | null | undefined
): boolean {
  return typeof user?.email_confirmed_at === 'string' && user.email_confirmed_at.trim().length > 0;
}

export function createRequireAuth(env: ServerEnvConfig) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!env.supabaseConfigured) {
      return res.status(503).json({
        error: 'Database and authentication service are not configured.',
      });
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const anonClient = createAnonSupabaseClient(env);
      const { data, error } = await anonClient.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ error: 'Session expired or invalid' });
      }

      const userClient = createUserSupabaseClient(token, env);
      const profile = await ensureUserProfile(userClient, {
        id: data.user.id,
        email: data.user.email ?? '',
        fullName:
          typeof data.user.user_metadata?.full_name === 'string'
            ? data.user.user_metadata.full_name
            : '',
        preferredLocale: data.user.user_metadata?.preferred_locale === 'ar' ? 'ar' : 'en',
        createdAt: data.user.created_at ?? new Date().toISOString(),
      });

      req.authUser = profile;
      req.authEmailConfirmed = isStrictEmailConfirmed(data.user);
      req.accessToken = token;
      req.supabase = userClient;
      next();
    } catch {
      return res.status(401).json({ error: 'Unable to verify authentication token' });
    }
  };
}

export async function getValidatedOrgAccess(
  req: AuthenticatedRequest,
  res: Response,
  orgId: string,
  minRole: OrgRole = 'viewer'
): Promise<{ organizationId: string; userId: string; role: OrgRole } | null> {
  if (!req.supabase || !req.authUser) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const membership = await getOrgMembership(req.supabase, orgId, req.authUser.id);
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
