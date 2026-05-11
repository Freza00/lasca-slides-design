import { NextRequest } from 'next/server';
import { requireAuth, isErrorResponse } from '@/lib/auth';
import { getMyInviteCodes, getCapStatus, countUserInvites } from '@/lib/db';

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if (isErrorResponse(result)) return result;

  const user = result;
  const codes = await getMyInviteCodes(user.id);
  const group = user.source_group || 'global';
  const cap = await getCapStatus(group);
  const total = await countUserInvites(user.id);

  return Response.json({
    codes: codes.map(c => ({
      code: c.code,
      used: c.max_uses === 1 ? !!c.used_by_user_id : false,
      usedByEmail: c.used_by_email ?? null,
      usedAt: c.used_at,
      createdAt: c.created_at,
      maxUses: c.max_uses,
      useCount: c.use_count ?? 0,
    })),
    remaining: Math.max(0, (cap?.maxChildInvites ?? 3) - total),
  });
}
