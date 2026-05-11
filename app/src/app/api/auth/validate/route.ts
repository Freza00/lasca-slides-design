import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getUserById, touchLastActive, getFlags } from '@/lib/db';

export async function GET(request: NextRequest) {
  const payload = verifyToken(request);
  if (!payload) {
    return Response.json({ error: 'Not logged in.', code: 'not_logged_in', valid: false }, { status: 401 });
  }

  const user = await getUserById(payload.userId);
  if (!user) {
    return Response.json({ error: 'User not found.', code: 'user_not_found', valid: false }, { status: 401 });
  }

  if (user.status === 'banned') {
    return Response.json({ error: 'This account has been banned.', code: 'account_banned', valid: false, banned: true }, { status: 403 });
  }

  const now = new Date();
  const expiresAt = new Date(user.session_expires_at);
  const isExpired = expiresAt <= now;
  const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000));

  if (isExpired) {
    return Response.json({ valid: false, expired: true, error: 'Your beta access has expired.', code: 'beta_expired' });
  }

  await touchLastActive(user.id);
  const flags = await getFlags();

  return Response.json({
    valid: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      sourceGroup: user.source_group,
      loginCode: user.login_code,
    },
    daysLeft,
    flags,
  });
}
