/**
 * fe-apis/health/health.ts
 *
 * Business logic for GET /api/health.
 * Returns DB availability and environment metadata for liveness probes.
 */

import { NextResponse } from 'next/server';
import { getDbPath } from '../_shared/db';

export function handleHealth(): NextResponse {
  const dbPath = getDbPath();
  return NextResponse.json({
    status: 'ok',
    environment: 'nextjs-api',
    db_available: !!dbPath,
    db_path: dbPath || null,
    timestamp: new Date().toISOString(),
  });
}
