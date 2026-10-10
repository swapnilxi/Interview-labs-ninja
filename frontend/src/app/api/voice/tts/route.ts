import { NextRequest, NextResponse } from 'next/server';
import { getUserFromAuthHeader } from '@/lib/server/authHelper';
import { synthesizeSpeech, getTtsContentType } from 'fe-apis/voice';

/**
 * Generic text-to-speech proxy: any authenticated module can synthesize speech
 * without knowing about Deepgram directly. Proxies server-side so
 * DEEPGRAM_API_KEY never reaches the browser. Returns raw audio bytes for the
 * client to play directly.
 */
export async function POST(req: NextRequest) {
  try {
    const user = getUserFromAuthHeader(req.headers.get('authorization'));
    if (!user) {
      return NextResponse.json({ detail: 'Log in to use this feature.' }, { status: 401 });
    }

    const { text } = await req.json();
    if (!text) {
      return NextResponse.json({ detail: 'text is required' }, { status: 400 });
    }

    const audioBuffer = await synthesizeSpeech(text);
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: { 'Content-Type': getTtsContentType() },
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to synthesize speech' }, { status: 500 });
  }
}
