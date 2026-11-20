import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SESSION_COOKIE_NAME = 'elmatba5_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

let cachedSecret: string | null = null;

export function getSessionSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    cachedSecret = process.env.SESSION_SECRET;
    return cachedSecret;
  }

  // Persist an auto-generated local dev key outside source control so sessions survive dev restarts
  const dataDir = path.resolve(process.cwd(), 'data');
  const secretPath = path.join(dataDir, '.session_secret');
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(secretPath)) {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32) {
      cachedSecret = existing;
      return cachedSecret;
    }
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretPath, generated, { mode: 0o600 });
  cachedSecret = generated;
  return cachedSecret;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, expectedHex] = parts;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derivedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedBuf, expectedBuf);
}

export interface SessionPayload {
  userId: string;
  email: string;
  exp: number;
}

export function signSessionToken(
  payload: Omit<SessionPayload, 'exp'>,
  secret = getSessionSecret(),
  ttlMs = SESSION_TTL_MS
): string {
  const fullPayload: SessionPayload = {
    userId: payload.userId,
    email: payload.email,
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(
  token: string,
  secret = getSessionSecret()
): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.email || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const val = part.slice(eqIndex + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export function slugifyOrgName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base || 'kitchen'}-${suffix}`;
}
