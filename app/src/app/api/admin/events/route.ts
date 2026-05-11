import { NextRequest } from 'next/server';
import { listEvents } from '@/lib/db';

function checkAdmin(request: NextRequest): boolean {
  const key = request.nextUrl.searchParams.get('key');
  return !!process.env.ADMIN_SECRET && key === process.env.ADMIN_SECRET;
}

export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const type = request.nextUrl.searchParams.get('type') || undefined;
  const q = request.nextUrl.searchParams.get('q') || undefined;
  const days = Number(request.nextUrl.searchParams.get('days') || '7');
  const limit = Number(request.nextUrl.searchParams.get('limit') || '100');

  const data = await listEvents({ type, q, days, limit });
  return Response.json(data);
}
