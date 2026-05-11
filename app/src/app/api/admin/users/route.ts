import { NextRequest } from 'next/server';
import { listUsers } from '@/lib/db';

function checkAdmin(request: NextRequest): boolean {
  const key = request.nextUrl.searchParams.get('key');
  return !!process.env.ADMIN_SECRET && key === process.env.ADMIN_SECRET;
}

export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) return Response.json({ error: 'Unauthorized' }, { status: 403 });
  const page = Number(request.nextUrl.searchParams.get('page') || '1');
  const data = await listUsers(page);
  return Response.json(data);
}
