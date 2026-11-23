import { NextResponse } from 'next/server';
import { savePushSubscription, removePushSubscription } from '@/lib/server/webPush';
import { userIdOrAuthError } from 'fe-apis/todo/_shared';
import { withNeonSync } from '@/lib/server/neonSync';

// Login required (the app is login-only). The subscription is saved under the caller's own user id.

async function POSTImpl(req: Request) {
  const userId = userIdOrAuthError(req);
  if (userId instanceof Response) return userId;
  try {
    const body = await req.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Missing endpoint or keys' }, { status: 400 });
    }

    const userAgent = req.headers.get('user-agent') || undefined;

    await savePushSubscription({
      endpoint,
      keys,
      userId,
      userAgent,
    });

    return NextResponse.json({ ok: true, message: 'Subscribed to push notifications' });
  } catch (err: unknown) {
    console.error('Error in /api/push/subscribe POST:', err);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }
}

async function DELETEImpl(req: Request) {
  const auth = userIdOrAuthError(req);
  if (auth instanceof Response) return auth;
  try {
    const body = await req.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    await removePushSubscription(endpoint);
    return NextResponse.json({ ok: true, message: 'Unsubscribed' });
  } catch (err: unknown) {
    console.error('Error in /api/push/subscribe DELETE:', err);
    return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 });
  }
}

export const POST = withNeonSync(POSTImpl);

export const DELETE = withNeonSync(DELETEImpl);
