import { NextRequest } from 'next/server';
import { signToken } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  validateInvite, markInviteUsed, getUserByEmail, registerUser,
  getCapStatus, incrementCap, generateInviteCodes, getFlags,
} from '@/lib/db';

export async function POST(request: NextRequest) {
  // Rate limit: 5 registration attempts per minute per IP
  const rateLimited = checkRateLimit(getClientIp(request), 'register', 5);
  if (rateLimited) return rateLimited;

  const body = await request.json() as {
    code: string;
    email: string;
    turnstileToken?: string;
    survey?: {
      currentTool?: string[];
      useCase?: string[];
      role?: string;
      painPoint?: string;
    };
  };

  const { code, email, survey } = body;
  if (!code || !email) {
    return Response.json({ error: 'Invite code and email are required.', code: 'code_email_required' }, { status: 400 });
  }

  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();

  // Turnstile verification (skip in dev)
  if (process.env.TURNSTILE_SECRET_KEY && body.turnstileToken) {
    try {
      const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: body.turnstileToken,
        }),
      });
      const turnstileData = await turnstileRes.json() as { success: boolean };
      if (!turnstileData.success) {
        return Response.json({ error: 'Human verification failed. Please try again.', code: 'captcha_failed' }, { status: 400 });
      }
    } catch {
      // Turnstile down → allow through (don't block registration on a CDN failure)
    }
  }

  // Check if registration is open
  const flags = await getFlags();
  if (flags.registration_open === 'false') {
    return Response.json({ error: 'Registration is temporarily closed.', code: 'registration_closed' }, { status: 403 });
  }

  // Check if email is banned (permanent block from admin ban)
  const existingUser = await getUserByEmail(normalizedEmail);
  if (existingUser?.status === 'banned') {
    return Response.json({ error: 'This email has been restricted.', code: 'email_restricted' }, { status: 403 });
  }
  if (existingUser) {
    return Response.json({ error: 'This email is already registered.', code: 'email_taken' }, { status: 409 });
  }

  // Validate invite code
  const invite = await validateInvite(code.trim().toUpperCase());
  if (!invite) {
    return Response.json({ error: 'Invite code is invalid or has already been used.', code: 'code_invalid' }, { status: 400 });
  }

  // Check caps (source group + global)
  const groupCap = await getCapStatus(invite.source_group);
  const globalCap = await getCapStatus('global');
  if (groupCap && groupCap.current >= groupCap.max) {
    return Response.json({ error: 'This invite channel is at full capacity.', code: 'channel_full' }, { status: 403 });
  }
  if (globalCap && globalCap.current >= globalCap.max) {
    return Response.json({ error: 'The beta program is at full capacity.', code: 'beta_full' }, { status: 403 });
  }

  // Register user
  const referrerUserId = invite.created_by_user_id;
  const user = await registerUser({
    email: normalizedEmail,
    code: invite.code,
    sourceGroup: invite.source_group,
    referrerUserId,
    survey: survey ?? {},
  });

  // Mark invite as used
  await markInviteUsed(invite.code, user.id);

  // Update caps
  if (groupCap) await incrementCap(invite.source_group);
  if (globalCap) await incrementCap('global');

  // Generate 3 child invite codes for the new user
  const maxChild = groupCap?.maxChildInvites ?? 3;
  const inviteCodes = await generateInviteCodes(user.id, invite.source_group, Math.min(3, maxChild));

  // Sign JWT
  const token = signToken({ userId: user.id, email: user.email });

  return Response.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      sessionExpiresAt: user.session_expires_at,
    },
    inviteCodes,
  });
}
