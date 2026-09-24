export const getDeepgramKey = () =>
  process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY ||
  process.env.DEEPGRAM_API_KEY ||
  (typeof window !== 'undefined' ? window.localStorage.getItem('deepgram_api_key') || '' : '');

export async function deepgramSTT(audioBlob: Blob): Promise<string> {
  const key = getDeepgramKey();
  if (!key) throw new Error("No Deepgram key");

  const formData = new FormData();
  formData.append('buffer', audioBlob);

  const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': audioBlob.type,
    },
    body: audioBlob
  });

  if (!res.ok) throw new Error("Deepgram STT failed");
  const data = await res.json();
  return data.results?.channels[0]?.alternatives[0]?.transcript || "";
}

export async function deepgramTTS(text: string): Promise<Blob> {
  const key = getDeepgramKey();
  if (!key) throw new Error("No Deepgram key");

  const res = await fetch('https://api.deepgram.com/v1/speak?model=aura-asteria-en', {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text })
  });

  if (!res.ok) throw new Error("Deepgram TTS failed");
  return await res.blob();
}
