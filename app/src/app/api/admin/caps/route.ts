import { NextRequest } from 'next/server';
import { listCaps, upsertCap } from '@/lib/db';

function checkAdmin(request: NextRequest): boolean {
  const key = request.nextUrl.searchParams.get('key');
  return !!process.env.ADMIN_SECRET && key === process.env.ADMIN_SECRET;
}

export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) return Response.json({ error: 'Unauthorized' }, { status: 403 });
  const caps = await listCaps();
  return Response.json(caps);
}

export async function POST(request: NextRequest) {
  if (!checkAdmin(request)) return Response.json({ error: 'Unauthorized' }, { status: 403 });
  const body = await request.json() as { groupName: string; maxUsers: number; maxChildInvites: number };
  if (!body.groupName) return Response.json({ error: 'groupName required' }, { status: 400 });
  await upsertCap(body.groupName, body.maxUsers ?? 100, body.maxChildInvites ?? 3);
  return Response.json({ ok: true });
}
