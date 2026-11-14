import { NextResponse } from 'next/server';
import { getUserFromAuthHeader } from '@/lib/server/authHelper';
import { fcmConfigured, sendFcmToUser } from '@/lib/server/fcm';

export const runtime = 'nodejs';

/** Sends a test FCM push to the logged-in user's Android devices. */
export async function POST(req: Request) {
  const user = getUserFromAuthHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ ok: false, error: 'Login required' }, { status: 401 });
  if (!fcmConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'FIREBASE_SERVICE_ACCOUNT is not set on the server' },
      { status: 503 }
    );
  }
  const sent = await sendFcmToUser(user.id, {
    title: 'LabNinja push 🔔',
    body: 'Firebase push is working on this phone.',
    href: '/ai-todo?tab=today',
    tag: 'labninja-fcm-test',
  });
  return NextResponse.json({
    ok: sent > 0,
    sent,
    error: sent ? undefined : 'No registered device accepted the push',
  });
}
