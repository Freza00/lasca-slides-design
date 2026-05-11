import { NextRequest } from 'next/server';
import { signToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getUserByEmail } from '@/lib/db';
import { sql } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  // Rate limit: 5 login attempts per minute per IP
  const rateLimited = checkRateLimit(getClientIp(request), 'login', 5);
  if (rateLimited) return rateLimited;

  const body = await request.json() as { email?: string; code?: string };

  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim().toUpperCase();

  if (!email && !code) {
    return Response.json({ error: 'Please enter your email or invite code.', code: 'email_or_code_required' }, { status: 400 });
  }

  let user;

  if (email) {
    // Login by email
    user = await getUserByEmail(email);
  } else if (code) {
    // Login by private login code (not the shared invite code)
    const { rows } = await sql`
      SELECT u.* FROM users u
      WHERE u.login_code = ${code}
      LIMIT 1
    `;
    user = rows[0] ?? null;
  }

  if (!user) {
    return Response.json({ error: 'Account not found.', code: 'account_not_found' }, { status: 404 });
  }

  if (user.status === 'banned') {
    return Response.json({ error: 'This account has been restricted.', code: 'account_restricted' }, { status: 403 });
  }

  // Issue new token
  const token = signToken({ userId: user.id, email: user.email });

  return Response.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
    },
  });
}
