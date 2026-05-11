import { NextRequest } from 'next/server';
import { getAdminStats } from '@/lib/db';

function checkAdmin(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const key = request.nextUrl.searchParams.get('key');
  return key === secret;
}

export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) return Response.json({ error: 'Unauthorized' }, { status: 403 });
  const stats = await getAdminStats();
  return Response.json(stats);
}
