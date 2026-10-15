/** Companion voice via the browser's built-in speech synthesis (free, offline-capable, no API key). */

export type VoicePresetId = 'pip' | 'robo' | 'calm';

export interface VoicePreset {
  id: VoicePresetId;
  label: string;
  emoji: string;
  pitch: number;
  rate: number;
}

export const VOICE_PRESETS: VoicePreset[] = [
  { id: 'pip', label: 'Tiny & cute', emoji: '🐥', pitch: 1.9, rate: 1.12 },
  { id: 'robo', label: 'Cute robot', emoji: '🤖', pitch: 1.35, rate: 0.92 },
  { id: 'calm', label: 'Calm guide', emoji: '🧘', pitch: 1.0, rate: 0.9 },
];

export function voicesAvailable(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function speak(text: string, preset: VoicePresetId, voiceURI: string | null, volume = 1) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const p = VOICE_PRESETS.find((x) => x.id === preset) ?? VOICE_PRESETS[0];
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
  if (!clean) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.pitch = p.pitch; // some browsers/voices (notably iOS) clamp or ignore pitch
  u.rate = p.rate;
  u.volume = volume;
  const voices = voicesAvailable();
  const chosen = voices.find((v) => v.voiceURI === voiceURI) ?? voices[0];
  if (chosen) u.voice = chosen;
  window.speechSynthesis.speak(u);
}
