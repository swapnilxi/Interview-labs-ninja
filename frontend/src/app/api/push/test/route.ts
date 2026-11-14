import { NextResponse } from 'next/server';
import { sendWebPush } from '@/lib/server/webPush';
import { withTodoDb } from 'fe-apis/todo/_shared';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { endpoint, keys } = body;

    let subToSend: { endpoint: string; p256dh: string; auth: string } | null = null;

    if (endpoint && keys?.p256dh && keys?.auth) {
      subToSend = { endpoint, p256dh: keys.p256dh, auth: keys.auth };
    } else if (endpoint) {
      subToSend = withTodoDb((db) => {
        return (
          db.get<{ endpoint: string; p256dh: string; auth: string }>(
            'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ? LIMIT 1;',
            endpoint
          ) || null
        );
      });
    } else {
      // Find the most recent active subscription
      subToSend = withTodoDb((db) => {
        return (
          db.get<{ endpoint: string; p256dh: string; auth: string }>(
            'SELECT endpoint, p256dh, auth FROM push_subscriptions ORDER BY updated_at DESC LIMIT 1;'
          ) || null
        );
      });
    }

    if (!subToSend) {
      return NextResponse.json(
        { ok: false, error: 'No push subscription found to test. Allow notifications on mobile first.' },
        { status: 404 }
      );
    }

    const ok = await sendWebPush(subToSend, {
      title: 'LabNinja Android Push 🔔',
      body: 'Web Push is working on your Android device! Even when the app is closed.',
      href: '/ai-todo?tab=today',
      tag: 'labninja-push-test',
      requireInteraction: true,
    });

    return NextResponse.json({
      ok,
      message: ok ? 'Push notification delivered to device gateway!' : 'Push gateway rejected delivery.',
    });
  } catch (err: unknown) {
    console.error('Error in /api/push/test:', err);
    return NextResponse.json({ ok: false, error: 'Server failed to send test push' }, { status: 500 });
  }
}

