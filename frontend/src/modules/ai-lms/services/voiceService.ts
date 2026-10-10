import { apiFetch } from '@/lib/http/apiClient';

// Only a non-secret feature flag reaches the browser -- the real Deepgram key lives
// server-side only (DEEPGRAM_API_KEY, no NEXT_PUBLIC_ prefix) inside the generic
// /api/voice/stt and /api/voice/tts proxy routes, so it can never be extracted from
// the JS bundle.
export const isDeepgramEnabled = () =>
  process.env.NEXT_PUBLIC_DEEPGRAM_ENABLED === 'true' ||
  (typeof window !== 'undefined' && window.localStorage.getItem('deepgram_enabled') === 'true');

export async function deepgramSTT(audioBlob: Blob): Promise<string> {
  const res = await apiFetch('/api/voice/stt', {
    method: 'POST',
    headers: { 'Content-Type': audioBlob.type },
    body: audioBlob,
  });
  if (!res.ok) throw new Error('Deepgram STT failed');
  const data = await res.json();
  return data.text || '';
}

export async function deepgramTTS(text: string): Promise<Blob> {
  const res = await apiFetch('/api/voice/tts', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Deepgram TTS failed');
  return await res.blob();
}
