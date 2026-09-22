/**
 * fe-apis/auth/logout.ts
 *
 * Business logic for POST /api/auth/logout.
 * Stateless JWT logout — client is responsible for dropping the token.
 * Extend here when server-side token revocation (blocklist/session) is added.
 */

import { NextResponse } from 'next/server';

export function handleLogout(): NextResponse {
  return NextResponse.json({ ok: true });
}
