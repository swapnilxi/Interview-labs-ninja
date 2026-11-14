import { NextResponse } from 'next/server';
import { savePushSubscription, removePushSubscription } from '@/lib/server/webPush';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { endpoint, keys, userId } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Missing endpoint or keys' }, { status: 400 });
    }

    const userAgent = req.headers.get('user-agent') || undefined;

    await savePushSubscription({
      endpoint,
      keys,
      userId: typeof userId === 'number' ? userId : 0,
      userAgent,
    });

    return NextResponse.json({ ok: true, message: 'Subscribed to push notifications' });
  } catch (err: unknown) {
    console.error('Error in /api/push/subscribe POST:', err);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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

