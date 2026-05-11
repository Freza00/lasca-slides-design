import { NextResponse } from 'next/server';
import { inferLayout } from '@/lib/ai/harness/inferLayout';

export const runtime = 'nodejs';

// Diagnostic-only: expose env + fire one inferLayout call to verify tracing.
// Safe to delete after debug.
export function GET() {
  const page = {
    pageType: 'content' as const,
    title: 'Probe test page',
    corePoint: '房价 3 月同比下降 3.6%',
    body: '销售疲软。',
    subPoints: ['A', 'B'],
    evidence: ['NAR'],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chosen = inferLayout(page as any, 2, 16, undefined, [], undefined, []);
  return NextResponse.json({
    env: {
      NODE_ENV: process.env.NODE_ENV ?? null,
      LASCA_TRACE: process.env.LASCA_TRACE ?? null,
    },
    inferLayoutResult: chosen,
  });
}
