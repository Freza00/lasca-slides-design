import { NextRequest } from 'next/server';
import { generateInviteCodes } from '@/lib/db';

function checkAdmin(request: NextRequest): boolean {
  const key = request.nextUrl.searchParams.get('key');
  return !!process.env.ADMIN_SECRET && key === process.env.ADMIN_SECRET;
}

export async function POST(request: NextRequest) {
  if (!checkAdmin(request)) return Response.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await request.json() as { group: string; count: number; maxUses?: number | null };
  if (!body.group || !body.count || body.count < 1 || body.count > 100) {
    return Response.json({ error: 'group required, count 1-100' }, { status: 400 });
  }

  const maxUses = body.maxUses === null ? null : (body.maxUses ?? 1);
  const codes = await generateInviteCodes(null, body.group, body.count, maxUses);
  return Response.json({ codes, count: codes.length });
}
