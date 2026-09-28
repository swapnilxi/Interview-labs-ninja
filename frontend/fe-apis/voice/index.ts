/**
 * fe-apis/voice/index.ts
 *
 * Barrel export for the shared voice client -- import everything from
 * 'fe-apis/voice'. Backed by either Deepgram (cloud) or fully local models
 * (subprocess-invoked MLX-Whisper for STT, macOS `say` for TTS), selected via
 * VOICE_STT_PROVIDER / VOICE_TTS_PROVIDER env vars (values: "deepgram" |
 * "local"; defaults to "deepgram"). Mirrors the same env vars and dispatch
 * logic as the Python backend's modules/common/voice/__init__.py, so both
 * backends behave identically regardless of which one is live.
 */

import { transcribeAudio as transcribeAudioDeepgram, synthesizeSpeech as synthesizeSpeechDeepgram } from './deepgram';
import { transcribeAudioLocal } from './localWhisper';
import { synthesizeSpeechLocal } from './localTts';

export async function transcribeAudio(audioBuffer: ArrayBuffer, contentType: string): Promise<string> {
  const provider = (process.env.VOICE_STT_PROVIDER || 'deepgram').trim().toLowerCase();
  if (provider === 'local') return transcribeAudioLocal(audioBuffer, contentType);
  return transcribeAudioDeepgram(audioBuffer, contentType);
}

export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const provider = (process.env.VOICE_TTS_PROVIDER || 'deepgram').trim().toLowerCase();
  if (provider === 'local') return synthesizeSpeechLocal(text);
  return synthesizeSpeechDeepgram(text);
}

/**
 * Content-Type of whatever synthesizeSpeech() currently returns -- audio format
 * differs by provider (Deepgram: audio/mpeg, local `say`: audio/wav). A
 * response mislabeled with the wrong Content-Type can fail to play in the
 * browser even though the bytes themselves are fine.
 */
export function getTtsContentType(): string {
  const provider = (process.env.VOICE_TTS_PROVIDER || 'deepgram').trim().toLowerCase();
  return provider === 'local' ? 'audio/wav' : 'audio/mpeg';
}
