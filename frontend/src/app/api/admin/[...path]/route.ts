import { handleAdmin } from 'fe-apis/admin';
import { withNeonSync } from '@/lib/server/neonSync';

// Admin portal: stats, user management, permission overrides, access-request review.
// The two DB-sync routes (db/push, db/pull) have dedicated files that take priority
// in Next.js App Router, so they never reach this catch-all.

type Ctx = { params: Promise<{ path: string[] }> };

const writeAdmin = withNeonSync((req: Request, segments: string[]) => handleAdmin(req, segments));

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return req.method === 'GET' ? handleAdmin(req, path) : writeAdmin(req, path);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
