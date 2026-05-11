// ============================================================================
// /api/auth/google — verify a Google Identity Services id_token + issue our JWT
// ============================================================================
// The client uses Google Identity Services (https://accounts.google.com/gsi/client)
// to obtain a Google-signed id_token (JWT) without leaving the page. We:
//   1. Verify the id_token's signature against Google's JWKS using `jose`.
//   2. Confirm `email_verified`, audience match, and a sane issuer.
//   3. Find-or-create the user in our `users` table (sentinel invite_code_used).
//   4. Issue OUR custom 7-day JWT via signToken() — same shape as /api/auth/login.
//
// No client secret is involved. GIS uses the implicit "credential" flow.
// ============================================================================

import { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { signToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  getUserByEmail,
  getUserByGoogleSub,
  linkGoogleSub,
  registerUserViaGoogle,
  renewSession,
} from '@/lib/db';
import { logger } from '@/lib/logger';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

interface GoogleIdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(getClientIp(request), 'auth-google', 10);
  if (rateLimited) return rateLimited;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    logger.warn('general','auth/google: GOOGLE_CLIENT_ID not configured');
    return Response.json(
      { error: 'Google sign-in is not configured on the server.', code: 'oauth_not_configured' },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { idToken?: string } | null;
  const idToken = body?.idToken;
  if (!idToken) {
    return Response.json({ error: 'Missing id token.', code: 'missing_id_token' }, { status: 400 });
  }

  let payload: GoogleIdTokenPayload;
  try {
    const verified = await jwtVerify(idToken, GOOGLE_JWKS, {
      audience: clientId,
      issuer: GOOGLE_ISSUERS,
    });
    payload = verified.payload as unknown as GoogleIdTokenPayload;
  } catch (err) {
    logger.warn('general','auth/google: id_token verification failed', { error: (err as Error).message });
    return Response.json({ error: 'Invalid Google sign-in token.', code: 'invalid_id_token' }, { status: 401 });
  }

  if (!payload.email || !payload.email_verified) {
    return Response.json(
      { error: 'Your Google email is not verified.', code: 'email_not_verified' },
      { status: 400 },
    );
  }

  const email = payload.email.trim().toLowerCase();
  const name = payload.name?.trim() || null;
  const googleSub = payload.sub;

  // 1) Try the strict OAuth-identity match first (handles users who already
  //    signed in with Google before).
  let user = await getUserByGoogleSub(googleSub);

  // 2) Fall back to email — covers the legacy invite-code user who is now
  //    signing in with Google for the first time. Backfill google_sub so
  //    later visits use path (1).
  if (!user) {
    const byEmail = await getUserByEmail(email);
    if (byEmail) {
      if (byEmail.status === 'banned') {
        return Response.json(
          { error: 'This account has been restricted.', code: 'account_restricted' },
          { status: 403 },
        );
      }
      await linkGoogleSub(byEmail.id, googleSub);
      user = { ...byEmail, google_sub: googleSub };
    }
  }

  // 3) New user — register via the OAuth path (no invite consumed).
  if (!user) {
    user = await registerUserViaGoogle({ email, name, googleSub });
  }

  if (user.status === 'banned') {
    return Response.json(
      { error: 'This account has been restricted.', code: 'account_restricted' },
      { status: 403 },
    );
  }

  // Always refresh the 7-day session window on a successful Google sign-in.
  // Without this, a legacy invite-era user whose session_expires_at lapsed
  // would receive a fresh JWT here, but /api/auth/validate would immediately
  // reject it as `expired: true` — leaving the user looping between /register
  // and /editor with no visible error.
  await renewSession(user.id);

  const token = signToken({ userId: user.id, email: user.email });

  return Response.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      sessionExpiresAt: user.session_expires_at,
    },
  });
}
