import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { logEventsBatch, touchLastActive } from '@/lib/db';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  // Rate limit: 30 log batches per minute per IP
  const rateLimited = checkRateLimit(getClientIp(request), 'log', 30);
  if (rateLimited) return rateLimited;

  const payload = verifyToken(request);
  const userId = payload?.userId ?? null;

  const body = await request.json() as {
    events: Array<{
      type: string;
      payload?: Record<string, unknown>;
      sessionId?: string;
      timestamp?: number;
    }>;
  };

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return Response.json({ error: 'events array required' }, { status: 400 });
  }

  // Cap at 20 events per batch to prevent abuse
  const events = body.events.slice(0, 20);

  // Skip DB write if no connection string (local dev without Postgres)
  if (!process.env.POSTGRES_URL) {
    return Response.json({ ok: true, count: events.length, skipped: true });
  }

  if (userId) {
    await touchLastActive(userId);
  }

  await logEventsBatch(
    events.map(e => ({
      userId,
      sessionId: e.sessionId ?? null,
      eventType: e.type,
      payload: e.payload,
    })),
  );

  return Response.json({ ok: true, count: events.length });
}
