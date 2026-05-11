/**
 * Next.js Middleware — CORS enforcement for all /api/ routes plus a gate that
 * hides developer-only pages (`/harness-test`, `/test-laser`, `/test-paged`)
 * outside local development.
 */

import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ORIGINS = 'http://localhost:3000';

const DEV_ONLY_PATHS = ['/harness-test', '/test-laser', '/test-paged'];

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS)
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
}

function isDevPagesAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.NEXT_PUBLIC_ENABLE_DEV_PAGES === '1';
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Hide developer-only test pages on production deploys unless explicitly
  // enabled via NEXT_PUBLIC_ENABLE_DEV_PAGES=1.
  if (DEV_ONLY_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!isDevPagesAllowed()) {
      return new NextResponse('Not Found', { status: 404 });
    }
    return NextResponse.next();
  }

  // Only enforce CORS on API routes from here on.
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const origin = request.headers.get('origin');
  const allowed = getAllowedOrigins();

  // Preflight (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0],
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Actual request — check origin if present (same-origin requests may not have it)
  if (origin && !allowed.includes(origin)) {
    return new NextResponse(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Proceed + add CORS headers to response
  const response = NextResponse.next();
  if (origin && allowed.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/harness-test/:path*',
    '/harness-test',
    '/test-laser/:path*',
    '/test-laser',
    '/test-paged/:path*',
    '/test-paged',
  ],
};
