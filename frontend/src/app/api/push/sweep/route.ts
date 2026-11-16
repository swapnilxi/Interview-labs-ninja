import { NextResponse } from 'next/server';
import { sweepDueReminders } from '@/lib/server/webPush';
import { userIdOrAuthError } from 'fe-apis/todo/_shared';

// Login required (the app is login-only). Nothing in the repo calls this yet; a scheduled caller (cron) would
// need its own credential.
export async function GET(req: Request) {
  const auth = userIdOrAuthError(req);
  if (auth instanceof Response) return auth;
  try {
    const result = await sweepDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    console.error('Error in /api/push/sweep GET:', err);
    return NextResponse.json({ ok: false, error: 'Sweep failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}

