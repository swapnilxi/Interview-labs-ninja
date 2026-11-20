'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ReadAloudState = 'idle' | 'playing' | 'paused';
export const READ_RATES = [0.75, 1, 1.25, 1.5] as const;
export type ReadRate = (typeof READ_RATES)[number];

const RATE_KEY = 'labninja.workbook.read-rate';
const DEVANAGARI = /[ऀ-ॿ]/;

/** Hindi (Devanagari) text gets a Hindi voice, everything else English. */
export const speechLang = (text: string) => (DEVANAGARI.test(text) ? 'hi-IN' : 'en-US');

export const canReadAloud = () =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  typeof window.SpeechSynthesisUtterance === 'function';

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.slice(0, 2);
  return (
    voices.find((v) => v.lang === lang && v.localService) ??
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.startsWith(base))
  );
}

function readStoredRate(): ReadRate {
  try {
    const value = Number(window.localStorage.getItem(RATE_KEY));
    return (READ_RATES as readonly number[]).includes(value) ? (value as ReadRate) : 1;
  } catch {
    return 1;
  }
}

/**
 * Reads a list of paragraphs aloud with the browser's own voice, one paragraph at a time, so the page can highlight
 * the one being read (`current`). Play / pause / resume / stop, a speed that is remembered on this device, and a Hindi
 * voice for Devanagari text. Only one reader speaks at a time: starting one stops any other. Nothing leaves the
 * device. Stops on unmount and when the tab is hidden.
 */
export function useReadAloud() {
  const [state, setState] = useState<ReadAloudState>('idle');
  const [current, setCurrent] = useState<number | null>(null);
  const [rate, setRateState] = useState<ReadRate>(1);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<string[]>([]);
  const index = useRef(0);
  const token = useRef(0); // bumped on stop/start so callbacks from an older run do nothing
  const rateRef = useRef<ReadRate>(1);
  const self = useRef(`reader-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const stored = readStoredRate();
    rateRef.current = stored;
    setRateState(stored);
  }, []);

  const stop = useCallback(() => {
    token.current += 1;
    if (canReadAloud()) window.speechSynthesis.cancel();
    setState('idle');
    setCurrent(null);
  }, []);

  const speakFrom = useCallback((at: number, run: number) => {
    if (run !== token.current) return;
    if (at >= queue.current.length) {
      setState('idle');
      setCurrent(null);
      return;
    }
    index.current = at;
    setCurrent(at);
    const text = queue.current[at];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLang(text);
    const voice = pickVoice(utterance.lang);
    if (voice) utterance.voice = voice;
    utterance.rate = rateRef.current;
    utterance.onend = () => speakFrom(at + 1, run);
    utterance.onerror = (event) => {
      if (run !== token.current || event.error === 'interrupted' || event.error === 'canceled')
        return;
      setError('Reading aloud stopped. Try again.');
      setState('idle');
      setCurrent(null);
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  /** Start reading these paragraphs (from `from`). Call it from a tap: some browsers need that. */
  const play = useCallback(
    (paragraphs: string[], from = 0) => {
      setError(null);
      if (!canReadAloud()) {
        setError('Reading aloud is not supported in this browser.');
        return;
      }
      const list = paragraphs.map((p) => p.trim()).filter(Boolean);
      if (!list.length) return;
      window.speechSynthesis.cancel();
      token.current += 1;
      // Only one reader on the page: tell the others to stop.
      window.dispatchEvent(new CustomEvent('wb-read-aloud', { detail: self.current }));
      queue.current = list;
      setState('playing');
      speakFrom(Math.max(0, Math.min(from, list.length - 1)), token.current);
    },
    [speakFrom]
  );

  const pause = useCallback(() => {
    if (!canReadAloud()) return;
    window.speechSynthesis.pause();
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    if (!canReadAloud()) return;
    window.speechSynthesis.resume();
    setState('playing');
  }, []);

  /** A new speed applies at once: the current paragraph starts again at that speed. */
  const setRate = useCallback(
    (next: ReadRate) => {
      rateRef.current = next;
      setRateState(next);
      try {
        window.localStorage.setItem(RATE_KEY, String(next));
      } catch {
        /* private mode: the speed is just not remembered */
      }
      if (state !== 'idle' && canReadAloud()) {
        window.speechSynthesis.cancel();
        token.current += 1;
        setState('playing');
        speakFrom(index.current, token.current);
      }
    },
    [state, speakFrom]
  );

  // Another reader started: this one stops (without cancelling the new one's speech).
  useEffect(() => {
    const onOther = (event: Event) => {
      if ((event as CustomEvent).detail !== self.current) {
        token.current += 1;
        setState('idle');
        setCurrent(null);
      }
    };
    window.addEventListener('wb-read-aloud', onOther);
    return () => window.removeEventListener('wb-read-aloud', onOther);
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      token.current += 1;
      if (canReadAloud()) window.speechSynthesis.cancel();
    };
  }, [stop]);

  return { state, current, rate, error, play, pause, resume, stop, setRate };
}
