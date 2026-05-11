// ============================================================================
// /api/admin/recent-users — debugging aid: peek at the most-recently-created
// user rows. ADMIN_SECRET-gated. Returns no PII beyond what's needed to
// reason about the OAuth flow (sub claim, status, expiry, source channel).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

function checkAdminAuth(request: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const headerKey = request.headers.get('x-admin-secret');
  const queryKey = new URL(request.url).searchParams.get('key');
  return headerKey === expected || queryKey === expected;
}

export async function GET(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: 'POSTGRES_URL not configured' }, { status: 503 });
  }
  const url = new URL(request.url);
  const emailFilter = url.searchParams.get('email');
  const linkedOnly = url.searchParams.get('linked') === '1';
  const orderBy = url.searchParams.get('order') === 'last_active'
    ? 'last_active_at DESC NULLS LAST'
    : 'created_at DESC';

  let rows;
  if (emailFilter) {
    const result = await sql`
      SELECT id, email, status, invite_code_used, source_group,
             google_sub IS NOT NULL AS has_google_sub,
             session_expires_at, created_at, last_active_at
      FROM users WHERE email = ${emailFilter.toLowerCase()}
    `;
    rows = result.rows;
  } else if (linkedOnly) {
    const result = await sql`
      SELECT id, email, status, invite_code_used, source_group,
             google_sub IS NOT NULL AS has_google_sub,
             session_expires_at, created_at, last_active_at
      FROM users WHERE google_sub IS NOT NULL
      ORDER BY last_active_at DESC NULLS LAST LIMIT 20
    `;
    rows = result.rows;
  } else {
    const result = await sql.query(
      `SELECT id, email, status, invite_code_used, source_group,
             google_sub IS NOT NULL AS has_google_sub,
             session_expires_at, created_at, last_active_at
      FROM users ORDER BY ${orderBy} LIMIT 20`,
    );
    rows = result.rows;
  }
  return NextResponse.json({
    count: rows.length,
    now: new Date().toISOString(),
    users: rows,
  });
}
