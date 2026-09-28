import { NextRequest, NextResponse } from 'next/server';
import { getUserFromAuthHeader } from '@/lib/server/authHelper';
import { transcribeAudio } from 'fe-apis/voice';

/**
 * Generic speech-to-text proxy: any authenticated module can transcribe audio
 * without knowing about Deepgram directly. Proxies server-side so
 * DEEPGRAM_API_KEY never reaches the browser. Client sends the raw recorded audio
 * blob as the request body.
 */
export async function POST(req: NextRequest) {
  try {
    const user = getUserFromAuthHeader(req.headers.get('authorization'));
    if (!user) {
      return NextResponse.json({ detail: 'Log in to use this feature.' }, { status: 401 });
    }

    const audioBuffer = await req.arrayBuffer();
    const contentType = req.headers.get('content-type') || 'audio/webm';

    const transcript = await transcribeAudio(audioBuffer, contentType);
    return NextResponse.json({ text: transcript });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Failed to transcribe audio' }, { status: 500 });
  }
}
