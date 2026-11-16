'use client';

/**
 * Listen mode for the reading sheets: reads text aloud with the app's text-to-speech (POST /api/voice/tts, Deepgram,
 * through ai-lms' voiceService) and falls back to the browser's own speechSynthesis when that fails (no Deepgram key,
 * offline). Playback only ever starts from a tap (iOS needs that): `play()` must be called from a click handler,
 * where it also unlocks the audio element for the pieces that follow. Stops on unmount and when the page is hidden.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { deepgramTTS } from '@/modules/ai-lms/services/voiceService';

export type ListenState = 'idle' | 'loading' | 'playing' | 'paused';
export const LISTEN_RATES = [1, 1.25, 1.5] as const;
export type ListenRate = (typeof LISTEN_RATES)[number];

/** Deepgram takes up to ~2000 characters a request; the browser voice is steadier with short pieces. */
const SERVER_PIECE = 1500;
const BROWSER_PIECE = 260;
/** A 0.1s silent WAV: played inside the tap so later, async plays are allowed (iOS Safari). */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/** Set once the server voice fails in this tab, so later plays go straight to the browser voice. */
let serverVoiceDown = false;

/** Markdown to plain, speakable text (code blocks are skipped, not spelled out). */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' (There is a code example here.) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/(\*\*|__|\*|_)(\S[\s\S]*?\S|\S)\1/g, '$2')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\n{2,}/g, '.\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Split at sentence ends (then at spaces) into pieces of at most `max` characters. */
export function splitForSpeech(text: string, max: number): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]*[\s\n]*|[\n]+/g) ?? [text];
  const pieces: string[] = [];
  let cur = '';
  const push = () => {
    if (cur.trim()) pieces.push(cur.trim());
    cur = '';
  };
  for (const s of sentences) {
    if ((cur + s).length <= max) {
      cur += s;
      continue;
    }
    push();
    if (s.length <= max) {
      cur = s;
      continue;
    }
    for (const word of s.split(/\s+/)) {
      if ((cur + ' ' + word).length > max) push();
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  push();
  return pieces;
}

export function useListen({ onEnd }: { onEnd?: () => void } = {}) {
  const [state, setState] = useState<ListenState>('idle');
  const [rate, setRateState] = useState<ListenRate>(1);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audio = useRef<HTMLAudioElement | null>(null);
  const run = useRef(0);
  const engine = useRef<'server' | 'browser'>('server');
  const pieces = useRef<string[]>([]);
  const at = useRef(0);
  const urls = useRef<string[]>([]);
  const rateRef = useRef<ListenRate>(1);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const release = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
  };

  const stop = useCallback(() => {
    run.current += 1;
    const a = audio.current;
    if (a) {
      a.onended = null;
      a.pause();
      a.removeAttribute('src');
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window)
      window.speechSynthesis.cancel();
    release();
    pieces.current = [];
    at.current = 0;
    setState('idle');
  }, []);

  const finish = (id: number) => {
    if (id !== run.current) return;
    stop();
    onEndRef.current?.();
  };

  // ── The browser's voice ──
  const speakBrowser = (id: number) => {
    if (id !== run.current) return;
    if (at.current >= pieces.current.length) return finish(id);
    const u = new SpeechSynthesisUtterance(pieces.current[at.current]);
    u.rate = rateRef.current;
    u.onend = () => {
      if (id !== run.current) return;
      at.current += 1;
      speakBrowser(id);
    };
    u.onerror = (e) => {
      if (id !== run.current || e.error === 'interrupted' || e.error === 'canceled') return;
      stop();
      setError('Your device could not read this aloud.');
    };
    window.speechSynthesis.speak(u);
    setState('playing');
  };

  const startBrowser = (id: number, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      stop();
      setError(
        'Listening is not available here: the voice service did not answer and this browser has no voice.'
      );
      return;
    }
    engine.current = 'browser';
    pieces.current = splitForSpeech(text, BROWSER_PIECE);
    at.current = 0;
    window.speechSynthesis.cancel();
    speakBrowser(id);
  };

  // ── The app's voice (Deepgram) ──
  const fetchPiece = async (i: number): Promise<string> => {
    const blob = await deepgramTTS(pieces.current[i]);
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  };

  const playServer = async (id: number, url: Promise<string>, text: string) => {
    const a = audio.current!;
    let src: string;
    try {
      src = await url;
    } catch {
      if (id !== run.current) return;
      // No Deepgram key, offline, or the server failed: carry on with the browser's voice from this piece.
      serverVoiceDown = true;
      setNote('Reading with your device’s voice.');
      startBrowser(id, pieces.current.slice(at.current).join(' ') || text);
      return;
    }
    if (id !== run.current) return;
    // Fetch the next piece while this one plays.
    const next = at.current + 1 < pieces.current.length ? fetchPiece(at.current + 1) : null;
    next?.catch(() => {});
    a.src = src;
    a.playbackRate = rateRef.current;
    a.onended = () => {
      if (id !== run.current) return;
      at.current += 1;
      if (!next) return finish(id);
      void playServer(id, next, text);
    };
    try {
      await a.play();
      if (id === run.current) setState('playing');
    } catch (e) {
      if (id !== run.current || (e instanceof DOMException && e.name === 'AbortError')) return;
      // The audio could not start (an unsupported format, or the browser refused): try the browser's voice.
      setNote('Reading with your device’s voice.');
      startBrowser(id, pieces.current.slice(at.current).join(' ') || text);
    }
  };

  /** Read `text` from the start. Call it from a tap. */
  const play = useCallback(
    (text: string) => {
      stop();
      const id = run.current;
      setError(null);
      const clean = text.trim();
      if (!clean) return;
      // Unlock playback inside the tap: the audio element and the speech engine.
      if (!audio.current && typeof Audio !== 'undefined') audio.current = new Audio();
      if (audio.current) {
        audio.current.src = SILENT_WAV;
        audio.current.play().catch(() => {});
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      }
      setState('loading');
      if (serverVoiceDown || !audio.current) {
        if (serverVoiceDown) setNote('Reading with your device’s voice.');
        startBrowser(id, clean);
        return;
      }
      engine.current = 'server';
      pieces.current = splitForSpeech(clean, SERVER_PIECE);
      at.current = 0;
      void playServer(id, fetchPiece(0), clean);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stop]
  );

  const pause = useCallback(() => {
    if (engine.current === 'server') audio.current?.pause();
    // The browser voice cannot pause reliably everywhere (Android): stop, and start this piece again on resume.
    else {
      run.current += 1;
      window.speechSynthesis.cancel();
    }
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    if (engine.current === 'server') {
      audio.current
        ?.play()
        .then(() => setState('playing'))
        .catch(() => setState('paused'));
      return;
    }
    run.current += 1;
    speakBrowser(run.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRate = useCallback((r: ListenRate) => {
    rateRef.current = r;
    setRateState(r);
    if (audio.current) audio.current.playbackRate = r;
  }, []);

  // Stop when the page is hidden (screen off, app switch) and when the sheet or page goes away.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [stop]);

  return { state, rate, setRate, note, error, play, pause, resume, stop };
}
