import { NextRequest } from 'next/server';
import { getUserById, updateUserStatus } from '@/lib/db';

function checkAdmin(request: NextRequest): boolean {
  const key = request.nextUrl.searchParams.get('key');
  return !!process.env.ADMIN_SECRET && key === process.env.ADMIN_SECRET;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAdmin(request)) return Response.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  const userId = Number(id);
  if (isNaN(userId)) return Response.json({ error: 'Invalid user ID' }, { status: 400 });

  const body = await request.json() as {
    action: 'warn' | 'ban' | 'activate';
  };

  const user = await getUserById(userId);
  if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

  switch (body.action) {
    case 'warn':
      await updateUserStatus(userId, 'warned');
      break;
    case 'ban':
      await updateUserStatus(userId, 'banned');
      break;
    case 'activate':
      await updateUserStatus(userId, 'active');
      break;
    default:
      return Response.json({ error: 'Unknown action' }, { status: 400 });
  }

  return Response.json({ ok: true, userId, action: body.action });
}
