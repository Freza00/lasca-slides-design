import { NextRequest } from 'next/server';
import { requireAuth, isErrorResponse } from '@/lib/auth';
import { countUserInvites, generateInviteCodes, getCapStatus } from '@/lib/db';

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if (isErrorResponse(result)) return result;

  const user = result;
  const group = user.source_group || 'global';
  const cap = await getCapStatus(group);
  const maxChild = cap?.maxChildInvites ?? 3;

  const existing = await countUserInvites(user.id);
  if (existing >= maxChild) {
    return Response.json({
      error: `You can generate up to ${maxChild} invite codes. ${existing} already generated.`, code: 'invite_limit',
    }, { status: 400 });
  }

  const codes = await generateInviteCodes(user.id, group, 1);
  return Response.json({ code: codes[0], remaining: maxChild - existing - 1 });
}
