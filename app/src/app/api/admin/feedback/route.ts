import { NextRequest } from 'next/server';
import { listFeedback } from '@/lib/db';

function checkAdmin(request: NextRequest): boolean {
  const key = request.nextUrl.searchParams.get('key');
  return !!process.env.ADMIN_SECRET && key === process.env.ADMIN_SECRET;
}

export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const page = Number(request.nextUrl.searchParams.get('page') || '1');
  const pageSize = Number(request.nextUrl.searchParams.get('pageSize') || '100');
  const category = request.nextUrl.searchParams.get('category') || undefined;
  const q = request.nextUrl.searchParams.get('q') || undefined;
  const days = Number(request.nextUrl.searchParams.get('days') || '0');

  const data = await listFeedback({ page, pageSize, category, q, days });
  return Response.json(data);
}
