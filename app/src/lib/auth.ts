/**
 * Lasca Auth — JWT sign/verify + request helpers
 *
 * Token stored in localStorage['lasca-session'] on client,
 * sent as Authorization: Bearer <token> header on API calls.
 */

import jwt from 'jsonwebtoken';
import { getUserById } from './db';
import type { DbUser } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

export interface TokenPayload {
  userId: number;
  email: string;
}

// ---------------------------------------------------------------------------
// Token operations
// ---------------------------------------------------------------------------

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request helpers (for API routes)
// ---------------------------------------------------------------------------

/** Extract token from Authorization header or cookie */
function extractToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  // Fallback: read from cookie (not used yet, but future-proofs)
  const cookie = request.headers.get('cookie');
  if (cookie) {
    const match = cookie.match(/lasca-session=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

/** Verify token from request. Returns payload or null. */
export function verifyToken(request: Request): TokenPayload | null {
  const token = extractToken(request);
  if (!token) return null;
  return decodeToken(token);
}

/** Require auth — returns user or a 401 Response. */
export async function requireAuth(request: Request): Promise<DbUser | Response> {
  const payload = verifyToken(request);
  if (!payload) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = await getUserById(payload.userId);
  if (!user || user.status === 'banned') {
    return new Response(JSON.stringify({ error: '账号已被限制' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return user;
}

/** Check if the authenticated user is an admin. */
export function isAdmin(user: DbUser): boolean {
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

/** Require admin — returns user or a 403 Response. */
export async function requireAdmin(request: Request): Promise<DbUser | Response> {
  const result = await requireAuth(request);
  if (result instanceof Response) return result;
  if (!isAdmin(result)) {
    return new Response(JSON.stringify({ error: '无权限' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return result;
}

/** Helper: check if requireAuth/requireAdmin returned an error Response */
export function isErrorResponse(result: DbUser | Response): result is Response {
  return result instanceof Response;
}
