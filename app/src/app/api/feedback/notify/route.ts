import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { logEvent } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const ALLOWED_CATEGORIES = new Set(['bug', 'feature', 'design', 'confused', 'other', 'generation_rating']);
const MAX_FEEDBACK_LENGTH = 4000;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(getClientIp(request), 'feedback', 10);
  if (rateLimited) return rateLimited;

  const payload = verifyToken(request);
  let body: {
    category?: string;
    text?: string;
    sessionId?: string;
    meta?: Record<string, unknown>;
  };
  try {
    body = await request.json() as {
      category?: string;
      text?: string;
      sessionId?: string;
      meta?: Record<string, unknown>;
    };
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const category = body.category?.trim();
  const text = body.text?.trim();
  const sessionId = body.sessionId?.trim() || null;
  const meta = body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)
    ? body.meta
    : undefined;

  if (!category || !text) {
    return Response.json({ error: 'category and text are required' }, { status: 400 });
  }
  if (!ALLOWED_CATEGORIES.has(category)) {
    return Response.json({ error: 'Invalid feedback category' }, { status: 400 });
  }

  const safeText = text.slice(0, MAX_FEEDBACK_LENGTH);
  let stored = false;
  let emailed = false;

  try {
    await logEvent(payload?.userId ?? null, sessionId, 'feedback', {
      category,
      text: safeText,
      ...(meta ?? {}),
    });
    stored = true;
  } catch (err) {
    logger.error('general', 'feedback persistence failed', {
      error: (err as Error).message,
      category,
      hasSessionId: !!sessionId,
      userId: payload?.userId ?? null,
      textLen: safeText.length,
    });
  }

  if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Lasca Beta <noreply@lasca.ai>',
        to: process.env.ADMIN_EMAIL,
        subject: `[Lasca Feedback] ${category} from ${payload?.email ?? 'anonymous'}`,
        text: [
          `Category: ${category}`,
          `User: ${payload?.email ?? 'anonymous'}`,
          `Session: ${sessionId ?? 'anonymous'}`,
          ``,
          safeText,
          ``,
          `---`,
          `Time: ${new Date().toISOString()}`,
        ].join('\n'),
      });
      emailed = true;
    } catch (err) {
      logger.warn('general', 'feedback email failed', {
        error: (err as Error).message,
        category,
        userId: payload?.userId ?? null,
      });
    }
  }

  if (!stored && !emailed) {
    return Response.json({ error: 'Failed to capture feedback' }, { status: 500 });
  }

  return Response.json({ ok: true, stored, emailed });
}
