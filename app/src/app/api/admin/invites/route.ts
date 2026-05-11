import { NextRequest } from 'next/server';
import { listInvites } from '@/lib/db';

function checkAdmin(request: NextRequest): boolean {
  const key = request.nextUrl.searchParams.get('key');
  return !!process.env.ADMIN_SECRET && key === process.env.ADMIN_SECRET;
}

export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) return Response.json({ error: 'Unauthorized' }, { status: 403 });
  const group = request.nextUrl.searchParams.get('group') || undefined;
  const invites = await listInvites(group);
  return Response.json({ invites });
}
