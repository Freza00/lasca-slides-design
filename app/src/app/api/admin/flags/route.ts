import { NextRequest } from 'next/server';
import { getFlags, setFlag } from '@/lib/db';

function checkAdmin(request: NextRequest): boolean {
  const key = request.nextUrl.searchParams.get('key');
  return !!process.env.ADMIN_SECRET && key === process.env.ADMIN_SECRET;
}

export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) return Response.json({ error: 'Unauthorized' }, { status: 403 });
  const flags = await getFlags();
  return Response.json(flags);
}

export async function PATCH(request: NextRequest) {
  if (!checkAdmin(request)) return Response.json({ error: 'Unauthorized' }, { status: 403 });
  const body = await request.json() as { key: string; value: string };
  if (!body.key) return Response.json({ error: 'key required' }, { status: 400 });
  await setFlag(body.key, body.value);
  return Response.json({ ok: true, key: body.key, value: body.value });
}
