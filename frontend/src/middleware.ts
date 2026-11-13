import { NextRequest, NextResponse } from 'next/server';

/**
 * Per-IP rate limiting for the Next.js API routes (the `nextjs-api` deployment mode and
 * the /auth, /todo, /pareto rewrites). Fixed-window counters held in memory: per server
 * instance, so on Vercel the real limit is multiplied by the number of warm instances —
 * a speed bump against brute force and scraping, not a hard quota. The FastAPI backend
 * has its own limiter (backend/modules/common/rate_limit.py).
 *
 * Disabled in local dev. Override with RATE_LIMIT_ENABLED=0|1.
 */
const WINDOW_MS = 60_000;
const GENERAL_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120);
const AUTH_LIMIT = Number(process.env.RATE_LIMIT_AUTH_PER_MINUTE ?? 10);
const UPLOAD_LIMIT = Number(process.env.RATE_LIMIT_UPLOAD_PER_MINUTE ?? 10);
const MAX_UPLOAD_BYTES = 26 * 1024 * 1024;
const MAX_JSON_BYTES = 5 * 1024 * 1024;

const buckets = new Map<string, { start: number; count: number }>();

function enabled(): boolean {
  const o = process.env.RATE_LIMIT_ENABLED;
  if (o !== undefined) return o === '1' || o === 'true';
  return process.env.NODE_ENV === 'production';
}

function hit(key: string, limit: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now - v.start > WINDOW_MS) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || now - b.start >= WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  return { ok: b.count <= limit, retryAfter: Math.ceil((WINDOW_MS - (now - b.start)) / 1000) };
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  );
}

function reject(status: number, detail: string, retryAfter?: number) {
  return NextResponse.json(
    { detail },
    { status, headers: retryAfter ? { 'Retry-After': String(retryAfter) } : undefined }
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Body size guard (Content-Length based) on writes.
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const len = Number(req.headers.get('content-length') ?? 0);
    const isUpload = pathname.startsWith('/api/pdf/upload');
    if (len > (isUpload ? MAX_UPLOAD_BYTES : MAX_JSON_BYTES)) {
      return reject(413, 'Request body too large.');
    }
  }

  if (!enabled() || method === 'OPTIONS') return NextResponse.next();

  const ip = clientIp(req);
  let scope = 'general';
  let limit = GENERAL_LIMIT;
  if (/^\/(api\/)?auth\/(login|signup)/.test(pathname)) {
    scope = 'auth';
    limit = AUTH_LIMIT;
  } else if (pathname.startsWith('/api/pdf/upload')) {
    scope = 'upload';
    limit = UPLOAD_LIMIT;
  }
  const r = hit(`${scope}:${ip}`, limit);
  if (!r.ok) return reject(429, 'Too many requests. Please slow down.', r.retryAfter);
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/auth/:path*', '/todo/:path+', '/pareto/:path*', '/admin/:path*'],
};
