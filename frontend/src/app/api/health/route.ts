import { NextResponse } from 'next/server';
import { getDbPath } from '@/lib/server/authHelper';

export async function GET() {
  const dbPath = getDbPath();
  return NextResponse.json({
    status: 'ok',
    environment: 'nextjs-api',
    db_available: !!dbPath,
    db_path: dbPath || null,
    timestamp: new Date().toISOString(),
  });
}
