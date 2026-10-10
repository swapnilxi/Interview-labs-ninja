/**
 * fe-apis/voice/deepgram.ts
 *
 * Raw Deepgram STT/TTS calling logic, extracted out of the Next.js route handlers so
 * any module can transcribe or synthesize speech without going through HTTP itself.
 * Reads DEEPGRAM_API_KEY server-side only, so it never reaches the browser. These
 * functions do the raw work and throw plain Errors on failure -- they don't know
 * about NextResponse; translating a failure into an HTTP response is the calling
 * route handler's job.
 */

export async function transcribeAudio(audioBuffer: ArrayBuffer, contentType: string): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY || '';
  if (!apiKey) {
    throw new Error('Deepgram is not configured on the server.');
  }

  const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': contentType,
    },
    body: audioBuffer,
  });

  if (!res.ok) {
    throw new Error('Deepgram STT failed');
  }
  const data = await res.json();
  const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  return transcript;
}

export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const apiKey = process.env.DEEPGRAM_API_KEY || '';
  if (!apiKey) {
    throw new Error('Deepgram is not configured on the server.');
  }

  const res = await fetch('https://api.deepgram.com/v1/speak?model=aura-asteria-en', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error('Deepgram TTS failed');
  }
  return await res.arrayBuffer();
}
