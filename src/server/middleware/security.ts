import type { NextFunction, Request, Response } from 'express';
import type { ServerEnvConfig } from '../config/env.ts';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Pluggable rate-limit store interface supporting synchronous or asynchronous backends.
 *
 * IMPORTANT PRODUCTION LIMITATION:
 * `InMemoryRateLimitStore` below is strictly per-process and non-distributed. It is suitable
 * for local development or single-instance deployments, but horizontally scaled deployments
 * (multiple containers / Cloud Run autoscaling) MUST provide a shared distributed
 * `RateLimitStore` implementation (such as Redis / Upstash) so quotas apply globally.
 */
export interface RateLimitStore {
  consume(key: string, maxHits: number, windowMs: number): RateLimitResult | Promise<RateLimitResult>;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, number[]>();
  private readonly maxBuckets: number;

  constructor(maxBuckets = 10_000) {
    this.maxBuckets = Math.max(1, maxBuckets);
  }

  consume(key: string, maxHits: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const isNewKey = !this.buckets.has(key);

    if (isNewKey && this.buckets.size >= this.maxBuckets) {
      this.pruneExpired(now, windowMs);
      while (this.buckets.size >= this.maxBuckets) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey === undefined) break;
        this.buckets.delete(oldestKey);
      }
    }

    const history = (this.buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxHits) {
      const oldest = history[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      this.buckets.delete(key);
      this.buckets.set(key, history);
      return { allowed: false, retryAfterSec };
    }
    history.push(now);
    this.buckets.delete(key);
    this.buckets.set(key, history);
    return { allowed: true, retryAfterSec: 0 };
  }

  private pruneExpired(now: number, windowMs: number) {
    for (const [bucketKey, timestamps] of this.buckets.entries()) {
      const active = timestamps.filter((ts) => now - ts < windowMs);
      if (active.length === 0) {
        this.buckets.delete(bucketKey);
      } else {
        this.buckets.set(bucketKey, active);
      }
    }
  }
}

const defaultRateLimitStore = new InMemoryRateLimitStore();

export function resolveClientIp(req: Request): string {
  // Rely exclusively on Express req.ip (which honors validated TRUST_PROXY config rather than raw spoofable headers)
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function userOrIpRateLimitKey(req: Request): string {
  const authed = req as Request & { authUser?: { id?: string } };
  const ip = resolveClientIp(req);
  const routeKey = `${req.baseUrl}${req.path}`;
  if (authed.authUser?.id) {
    return `${routeKey}:user:${authed.authUser.id}:ip:${ip}`;
  }
  return `${routeKey}:ip:${ip}`;
}

export function rateLimit(
  maxHits: number,
  windowMs: number,
  options: {
    store?: RateLimitStore;
    keyGenerator?: (req: Request) => string;
  } = {}
) {
  const store = options.store ?? defaultRateLimitStore;
  const keyGenerator = options.keyGenerator ?? userOrIpRateLimitKey;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    Promise.resolve(store.consume(key, maxHits, windowMs))
      .then((result) => {
        if (!result.allowed) {
          res.setHeader('Retry-After', String(result.retryAfterSec));
          return res.status(429).json({
            error: 'Too many requests. Please wait a moment before trying again.',
          });
        }
        next();
      })
      .catch(next);
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
