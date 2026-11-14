import { NextResponse } from 'next/server';
import { sweepDueReminders } from '@/lib/server/webPush';

export async function GET() {
  try {
    const result = await sweepDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    console.error('Error in /api/push/sweep GET:', err);
    return NextResponse.json({ ok: false, error: 'Sweep failed' }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
