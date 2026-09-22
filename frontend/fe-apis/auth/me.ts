/**
 * fe-apis/auth/me.ts
 *
 * Business logic for GET /api/auth/me.
 * Validates the Bearer token and returns the authenticated user's profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromAuthHeader } from '../_shared/db';

export function handleMe(req: NextRequest): NextResponse {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromAuthHeader(authHeader);

  if (!user) {
    return NextResponse.json(
      { detail: 'Could not validate credentials' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
  });
}
