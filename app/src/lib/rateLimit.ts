// ============================================================================
// In-memory IP rate limiter for Vercel serverless
// ============================================================================
// Single-instance Map. On cold start the Map resets — this is fine because
// cold starts are rare and the reset acts as automatic forgiveness.
// For multi-instance production, swap to Upstash Redis.
// ============================================================================

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Cleanup stale entries every 60s to prevent memory leak in long-lived instances
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
  }, 60_000);
}

/**
 * Check rate limit for a given key (typically IP + route).
 * @returns null if allowed, or a Response (429) if rate-limited.
 */
export function checkRateLimit(
  ip: string,
  route: string,
  maxRequests: number,
  windowMs: number = 60_000,
): Response | null {
  const key = `${ip}:${route}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count++;
  if (bucket.count > maxRequests) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    return new Response(
      JSON.stringify({ error: `请求太频繁，请 ${retryAfterSec} 秒后重试` }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSec),
        },
      },
    );
  }

  return null;
}

/**
 * Extract client IP from Next.js request. Works on Vercel (x-forwarded-for)
 * and local dev (falls back to 127.0.0.1).
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1'
  );
}

/**
 * Check Content-Length against a max. Returns 413 Response if over limit, null if OK.
 * Note: Content-Length may be absent (chunked transfer); in that case we allow through
 * and rely on the server/framework to enforce its own body limit.
 */
export function checkBodySize(request: Request, maxBytes: number): Response | null {
  const cl = request.headers.get('content-length');
  if (cl) {
    const len = Number(cl);
    if (!isNaN(len) && len > maxBytes) {
      return new Response(
        JSON.stringify({ error: `请求体过大（上限 ${Math.round(maxBytes / 1024)}KB）` }),
        { status: 413, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }
  return null;
}
