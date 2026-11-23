import { NextResponse } from 'next/server';
import { getUserFromAuthHeader } from '@/lib/server/authHelper';
import { removeFcmToken, saveFcmToken } from '@/lib/server/fcm';
import { withNeonSync } from '@/lib/server/neonSync';

export const runtime = 'nodejs';

/** The Android app registers (POST) or drops (DELETE) its FCM device token. Login required. */
async function POSTImpl(req: Request) {
  const user = getUserFromAuthHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || typeof token !== 'string' || token.length > 4096) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }
  saveFcmToken(user.id, token);
  return NextResponse.json({ ok: true });
}

async function DELETEImpl(req: Request) {
  const user = getUserFromAuthHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Login required' }, { status: 401 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (token) removeFcmToken(token);
  return NextResponse.json({ ok: true });
}

export const POST = withNeonSync(POSTImpl);

export const DELETE = withNeonSync(DELETEImpl);
