/**
 * fe-apis/admin/db.ts
 *
 * nextjs-api twin of backend/modules/auth/admin_router.py's db_router (POST
 * /api/admin/db/push and /pull) -- the one admin-portal feature that has a
 * nextjs-api equivalent; the rest of the admin portal (stats, user management)
 * doesn't, consistent with that documented gap elsewhere in this app.
 */

import { NextResponse } from 'next/server';
import { getUserFromAuthHeader, type UserRecord } from '../_shared/db';
import { downloadSnapshot, uploadSnapshot } from '@/lib/server/neonSync';
import { getWritablePath } from '@/lib/server/sqliteReader';
import fs from 'fs';

function requireSuperadmin(req: Request): UserRecord | NextResponse {
  const user = getUserFromAuthHeader(req.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ detail: 'Log in to use this feature.' }, { status: 401 });
  }
  if (user.role !== 'superadmin') {
    return NextResponse.json(
      { detail: 'Only a superadmin can sync the production database' },
      { status: 403 }
    );
  }
  return user;
}

export async function handlePushDb(req: Request): Promise<NextResponse> {
  const auth = requireSuperadmin(req);
  if (auth instanceof NextResponse) return auth;

  const ok = await uploadSnapshot('lab_ninja', getWritablePath('lab_ninja'), `admin-push:${auth.email}`);
  if (!ok) {
    return NextResponse.json(
      { detail: "DATABASE_URL isn't configured, or the push to Neon failed" },
      { status: 503 }
    );
  }
  return NextResponse.json({ status: 'pushed' });
}

export async function handlePullDb(req: Request): Promise<NextResponse> {
  const auth = requireSuperadmin(req);
  if (auth instanceof NextResponse) return auth;

  const snapshot = await downloadSnapshot('lab_ninja');
  if (!snapshot) {
    return NextResponse.json(
      { detail: "DATABASE_URL isn't configured, or Neon has no snapshot yet" },
      { status: 503 }
    );
  }
  fs.writeFileSync(getWritablePath('lab_ninja'), snapshot);
  return NextResponse.json({ status: 'pulled' });
}
