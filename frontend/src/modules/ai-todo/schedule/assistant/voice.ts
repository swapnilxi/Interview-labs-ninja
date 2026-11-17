'use client';

/**
 * Voice for the Assistant: speaking replies and hearing one utterance at a time (voice mode loops the two).
 *
 * Speaking: the server voice (Deepgram, /api/voice/tts) or the device's own (speechSynthesis), per the Voice settings;
 * "Auto" uses the server voice when Deepgram is switched on for this app, else the device's. A device without voices
 * (the Android WebView has none) falls back to the server voice, and a server voice that fails falls back to the device.
 *
 * Hearing: the browser's recognizer when there is one (live captions, it stops by itself at the end of a sentence), or
 * the microphone + /api/voice/stt with a simple level-based end-of-speech detector (Deepgram on, or no recognizer).
 */

import {
  deepgramSTT,
  deepgramTTS,
  isDeepgramEnabled,
} from '@/modules/ai-lms/services/voiceService';
import { isNativeApp } from '@/lib/reminders/nativeReminders';
import { micBlockedMessage, micStartErrorMessage } from '@/components/voice/micPermission';

// ── Settings ────────────────────────────────────────────────────────────────────────────────────────────────────

export type VoiceEngine = 'auto' | 'device' | 'server';

export interface VoiceSettings {
  engine: VoiceEngine;
  /** A device voice (speechSynthesis voiceURI); null = the best one for the page language. */
  voiceURI: string | null;
  rate: number;
  /** Read replies aloud when you asked by voice (voice mode always speaks). */
  autoSpeak: boolean;
}

const SETTINGS_KEY = 'labninja.assistant.voice.v1';
export const DEFAULT_VOICE: VoiceSettings = {
  engine: 'auto',
  voiceURI: null,
  rate: 1,
  autoSpeak: true,
};

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_VOICE, ...JSON.parse(raw) } : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

export function saveVoiceSettings(v: VoiceSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(v));
  } catch {
    /* not kept */
  }
}

// ── Text to say ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Markdown → plain spoken text (no symbols, no links, list items as sentences). */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, '$2')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s*\n+\s*/g, (m) => (m.includes('\n\n') ? '. ' : ' '))
    .replace(/([.!?])\.\s/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** What to read aloud for a reply: its spoken version, else the reply itself (cut to `max` at a sentence end). */
export function textToSay(reply: string, speech?: string, max = 700): string {
  const said = (speech && speech.trim()) || plainText(reply);
  if (said.length <= max) return said;
  const cut = said.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 200 ? cut.slice(0, end + 1) : `${cut}…`;
}

// ── Speaking ────────────────────────────────────────────────────────────────────────────────────────────────────

export function deviceVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/** The voice to use when none is chosen: the page language, a natural-sounding one if there is one. */
function bestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en-US').toLowerCase();
  const base = lang.split('-')[0];
  const same = voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === lang);
  const family = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  const pool = same.length ? same : family.length ? family : voices;
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|premium|enhanced/i.test(v.name) ? 4 : 0) +
    (/google|samantha|siri|aria|jenny|guy/i.test(v.name) ? 2 : 0) +
    (v.default ? 1 : 0);
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

/**
 * Sentences grouped into pieces of at most `size` characters: ~200 for the device voice (Chrome stops long utterances
 * after ~15 s), ~1500 for the server voice (one request each; Deepgram takes up to 2000).
 */
function chunks(text: string, size = 200): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > size && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

class Speaker {
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private token = 0;
  private settle: (() => void) | null = null;
  /** The server voice failed this session (no key, offline): don't keep trying it. */
  private serverBroken = false;

  /** Speaks `text`; resolves when it has been said or stop() was called. */
  async speak(text: string, settings: VoiceSettings): Promise<void> {
    this.stop();
    const said = text.trim();
    if (!said) return;
    const token = ++this.token;
    const deviceOk = deviceVoices().length > 0 && !isNativeApp();
    const wantServer =
      settings.engine === 'server' ||
      (settings.engine === 'auto' && isDeepgramEnabled()) ||
      !deviceOk;
    if (wantServer && !this.serverBroken) {
      try {
        await this.speakServer(said, token);
        return;
      } catch {
        if (token !== this.token) return;
        this.serverBroken = true;
      }
    }
    if (token !== this.token) return;
    await this.speakDevice(said, settings, token);
  }

  /** Plays the pieces in order, fetching the next one while the current one plays. Throws only on the first piece. */
  private async speakServer(text: string, token: number): Promise<void> {
    const pieces = chunks(text, 1500).map((piece) => piece.slice(0, 1900));
    let next: Promise<Blob> | null = deepgramTTS(pieces[0]);
    for (let i = 0; i < pieces.length && next; i++) {
      let blob: Blob;
      try {
        blob = await next;
      } catch (err) {
        if (i === 0) throw err;
        return;
      }
      if (token !== this.token) return;
      next = i + 1 < pieces.length ? deepgramTTS(pieces[i + 1]) : null;
      next?.catch(() => {});
      await this.play(blob, token);
      if (token !== this.token) return;
    }
  }

  private play(blob: Blob, token: number): Promise<void> {
    if (this.url) URL.revokeObjectURL(this.url);
    const url = URL.createObjectURL(blob);
    this.url = url;
    const audio = new Audio(url);
    this.audio = audio;
    return new Promise<void>((resolve, reject) => {
      this.settle = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Audio failed'));
      audio.play().catch(reject);
    }).finally(() => {
      if (token === this.token && this.audio === audio) this.audio = null;
    });
  }

  private speakDevice(text: string, settings: VoiceSettings, token: number): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve();
    const synth = window.speechSynthesis;
    const voices = deviceVoices();
    const voice = voices.find((v) => v.voiceURI === settings.voiceURI) ?? bestVoice(voices);
    const pieces = chunks(text);
    return new Promise<void>((resolve) => {
      this.settle = resolve;
      let i = 0;
      const next = () => {
        if (token !== this.token || i >= pieces.length) {
          resolve();
          return;
        }
        const u = new SpeechSynthesisUtterance(pieces[i++]);
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        }
        u.rate = settings.rate;
        // Some engines never send `end`: move on after a generous estimate of the piece's length.
        const guard = window.setTimeout(next, 4000 + (u.text.length * 95) / settings.rate);
        u.onend = () => {
          window.clearTimeout(guard);
          next();
        };
        u.onerror = () => {
          window.clearTimeout(guard);
          next();
        };
        synth.speak(u);
      };
      next();
    });
  }

  stop() {
    this.token++;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window)
      window.speechSynthesis.cancel();
    const settle = this.settle;
    this.settle = null;
    settle?.();
  }
}

export const speaker = new Speaker();

// ── Hearing one utterance ───────────────────────────────────────────────────────────────────────────────────────

type Recognizer = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognizerCtor(): (new () => Recognizer) | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export interface Listening {
  /** The words heard ('' when nothing was said). Rejects with a readable message when the mic can't be used. */
  done: Promise<string>;
  /** Stop listening now and use what was heard. */
  finish: () => void;
  /** Stop and throw away what was heard. */
  cancel: () => void;
}

export interface ListenOptions {
  /** 0–1 microphone level, for the orb. */
  onLevel?: (level: number) => void;
  /** Live caption (browser recognizer only). */
  onInterim?: (text: string) => void;
  /** Stop after this long with nothing said. */
  silenceMs?: number;
}

/** True when this device can listen at all. */
export function canListen(): boolean {
  if (typeof window === 'undefined') return false;
  return !!recognizerCtor() || !!navigator.mediaDevices?.getUserMedia;
}

export function listenOnce(opts: ListenOptions = {}): Listening {
  const useServer = isDeepgramEnabled() || !recognizerCtor();
  return useServer ? listenWithServer(opts) : listenWithBrowser(opts);
}

/** A level meter on a stream; returns a stop function. */
function meter(stream: MediaStream, onLevel: (level: number, rms: number) => void): () => void {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx: AudioContext = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    onLevel(Math.min(1, rms * 9), rms);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    try {
      source.disconnect();
    } catch {
      /* already */
    }
    void ctx.close().catch(() => {});
  };
}

function listenWithBrowser(opts: ListenOptions): Listening {
  const Ctor = recognizerCtor()!;
  const rec = new Ctor();
  rec.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  let interim = '';
  let cancelled = false;
  let settled = false;
  let stopMeter: () => void = () => {};
  let stream: MediaStream | null = null;
  const cleanup = () => {
    stopMeter();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  // A level meter on its own stream (not in the Android app, where a second capture can starve the recognizer).
  if (opts.onLevel && !isNativeApp() && navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (settled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        stopMeter = meter(s, (level) => opts.onLevel?.(level));
      })
      .catch(() => {});
  }

  const done = new Promise<string>((resolve, reject) => {
    const finish = (err?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(new Error(err));
      else resolve(cancelled ? '' : `${finalText} ${interim}`.replace(/\s+/g, ' ').trim());
    };
    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += ` ${r[0].transcript}`;
        else live += r[0].transcript;
      }
      interim = live;
      opts.onInterim?.(`${finalText} ${interim}`.replace(/\s+/g, ' ').trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return finish();
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        return finish(micBlockedMessage());
      finish(
        e.error === 'network'
          ? 'Voice input needs an internet connection.'
          : 'Voice input failed. Try again.'
      );
    };
    rec.onend = () => finish();
    try {
      rec.start();
    } catch (err) {
      finish(micStartErrorMessage(err));
    }
    // The Android WebView can go quiet without sending `end`.
    window.setTimeout(() => {
      if (!settled) {
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
        window.setTimeout(() => finish(), 1500);
      }
    }, 60_000);
  });

  return {
    done,
    finish: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
    cancel: () => {
      cancelled = true;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    },
  };
}

function listenWithServer(opts: ListenOptions): Listening {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let stopMeter: () => void = () => {};
  let cancelled = false;
  let stopRequested = false;
  let manual = false;
  const silenceMs = opts.silenceMs ?? 8000;

  const stopRecorder = () => {
    stopRequested = true;
    if (recorder && recorder.state === 'recording') recorder.stop();
  };

  const done = new Promise<string>((resolve, reject) => {
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        reject(new Error(micStartErrorMessage(err)));
        return;
      }
      if (stopRequested) {
        stream.getTracks().forEach((t) => t.stop());
        resolve('');
        return;
      }
      const rec = new MediaRecorder(stream);
      recorder = rec;
      const parts: Blob[] = [];
      const started = performance.now();
      let floor = 0.01;
      let calibrated = 0;
      let heard = false;
      let lastLoud = performance.now();
      stopMeter = meter(stream, (level, rms) => {
        opts.onLevel?.(level);
        const now = performance.now();
        if (now - started < 350) {
          floor = (floor * calibrated + rms) / (calibrated + 1);
          calibrated++;
          return;
        }
        const loud = rms > Math.max(floor * 2.6, 0.012);
        if (loud) {
          heard = true;
          lastLoud = now;
        }
        if (heard && now - lastLoud > 1300) stopRecorder();
        else if (!heard && now - started > silenceMs) stopRecorder();
        else if (now - started > 45_000) stopRecorder();
      });
      rec.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data);
      };
      rec.onstop = async () => {
        stopMeter();
        stream?.getTracks().forEach((t) => t.stop());
        // Nothing loud enough was heard: skip the round trip, unless you said you were done yourself.
        if (cancelled || (!heard && !manual)) {
          resolve('');
          return;
        }
        try {
          const text = await deepgramSTT(new Blob(parts, { type: rec.mimeType || 'audio/webm' }));
          resolve(text.trim());
        } catch {
          reject(new Error('Couldn’t turn that into text. Try again.'));
        }
      };
      rec.start();
    })();
  });

  return {
    done,
    finish: () => {
      manual = true;
      stopRecorder();
    },
    cancel: () => {
      cancelled = true;
      stopRecorder();
    },
  };
}
