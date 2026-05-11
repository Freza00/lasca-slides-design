// ============================================================================
// /api/admin/migrate — one-shot DB schema + seed runner, gated by ADMIN_SECRET
// ============================================================================
// Pattern matches Vercel-friendly deploy of a new schema: the maintainer hits
// this endpoint once after a deploy that introduces a schema change, with
// `?key=<ADMIN_SECRET>` (or x-admin-secret header). The migration is idempotent
// (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, INSERT ... ON CONFLICT
// DO NOTHING), so accidental re-runs are safe.
//
// SECURITY: requires ADMIN_SECRET env var to be set. Returns 401 otherwise.
// Do not expose ADMIN_SECRET in client code.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { runMigration } from '@/lib/db/migrate';

function checkAdminAuth(request: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const headerKey = request.headers.get('x-admin-secret');
  const queryKey = new URL(request.url).searchParams.get('key');
  return headerKey === expected || queryKey === expected;
}

export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json(
      { error: 'unauthorized', hint: 'pass ADMIN_SECRET as x-admin-secret header or ?key=' },
      { status: 401 },
    );
  }

  if (!process.env.POSTGRES_URL) {
    return NextResponse.json(
      { error: 'POSTGRES_URL not configured on this deployment' },
      { status: 503 },
    );
  }

  try {
    const report = await runMigration();
    return NextResponse.json({
      ok: true,
      ...report,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

// GET returns auth-only — useful for verifying ADMIN_SECRET works without
// triggering the migration.
export async function GET(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401 },
    );
  }
  return NextResponse.json({
    ok: true,
    hint: 'POST to this endpoint with the same auth to run the migration',
  });
}
