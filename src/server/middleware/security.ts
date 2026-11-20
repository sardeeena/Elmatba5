import type { NextFunction, Request, Response } from 'express';
import type { ServerEnvConfig } from '../config/env.ts';

/**
 * Pluggable rate-limit store interface so multi-instance deployments can swap
 * InMemoryRateLimitStore for a durable Redis / Upstash store without changing middleware callers.
 */
export interface RateLimitStore {
  consume(key: string, maxHits: number, windowMs: number): { allowed: boolean; retryAfterSec: number };
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, number[]>();

  consume(key: string, maxHits: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const history = (this.buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxHits) {
      const oldest = history[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      return { allowed: false, retryAfterSec };
    }
    history.push(now);
    this.buckets.set(key, history);
    return { allowed: true, retryAfterSec: 0 };
  }
}

const defaultRateLimitStore = new InMemoryRateLimitStore();

export function rateLimit(
  maxHits: number,
  windowMs: number,
  store: RateLimitStore = defaultRateLimitStore
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const key = `${req.baseUrl}${req.path}:${ip}`;
    const result = store.consume(key, maxHits, windowMs);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
    }
    next();
  };
}

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

export function createCorsMiddleware(env: ServerEnvConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed =
        env.allowedOrigins.includes(origin) ||
        (!env.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin));

      if (!isAllowed) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          return res.status(403).json({ error: 'Cross-origin request blocked by CORS policy' });
        }
      } else {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  };
}
