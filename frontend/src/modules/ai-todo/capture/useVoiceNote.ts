'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deepgramSTT, isDeepgramEnabled } from '@/modules/ai-lms/services/voiceService';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { micBlockedMessage, micStartErrorMessage } from '@/components/voice/micPermission';

/**
 * Records one spoken note for task capture.
 *
 * - Browser speech recognition (Chrome, Edge, Safari): live words while you talk, stops by itself after a pause.
 * - Deepgram (server proxy) when it is switched on and you are logged in: records, then transcribes; a level meter
 *   drives the waveform and a pause after speech stops the recording.
 *
 * Unlike the shared `useVoiceInput` (dictation into any text box), this one shows the words as they come and hands
 * over the whole note once, so it can be turned into tasks.
 */

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type VoiceNoteState = 'idle' | 'listening' | 'transcribing';

const SILENCE_MS = 2600;
/** How long stop() waits for the recognizer's `end` before finishing on its own. */
const STOP_GRACE_MS = 1500;

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) ?? null;
}

export function voiceNoteSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    Boolean(recognitionCtor()) || (isDeepgramEnabled() && isLoggedIn() && 'MediaRecorder' in window)
  );
}

export function useVoiceNote(onFinal: (text: string) => void) {
  const [state, setState] = useState<VoiceNoteState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const recognitionRef = useRef<Recognition | null>(null);
  const finalTextRef = useRef('');
  const cancelledRef = useRef(false);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopGuardRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Ends the current browser-recognition session (once); set by startBrowser. */
  const endBrowserRef = useRef<(() => void) | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const clearSilence = () => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = null;
  };

  const clearStopGuard = () => {
    if (stopGuardRef.current) clearTimeout(stopGuardRef.current);
    stopGuardRef.current = null;
  };

  /**
   * Ask the recognizer to stop and hand over what was said. Engines normally answer with `end`, but the Android
   * WebView can go quiet (after a refused microphone, for one) and never send it, which left the sheet stuck on
   * "listening" with only Cancel working. So if `end` doesn't come soon, finish anyway.
   */
  const stopBrowser = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
    if (!stopGuardRef.current) {
      stopGuardRef.current = setTimeout(() => endBrowserRef.current?.(), STOP_GRACE_MS);
    }
  };

  /** Drop the browser recognizer without delivering anything; its late events can't touch a newer session. */
  const discardBrowser = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    endBrowserRef.current = null;
    if (stopGuardRef.current) clearTimeout(stopGuardRef.current);
    stopGuardRef.current = null;
    if (!rec) return;
    rec.onresult = rec.onerror = rec.onend = null;
    try {
      rec.abort();
    } catch {
      /* not started */
    }
  }, []);

  const releaseAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      clearSilence();
      discardBrowser();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      releaseAudio();
    },
    [releaseAudio, discardBrowser]
  );

  const finish = useCallback((text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    setInterim('');
    setState('idle');
    if (!cancelledRef.current && clean) onFinalRef.current(clean);
  }, []);

  const startBrowser = (Ctor: new () => Recognition) => {
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    finalTextRef.current = '';
    rec.onresult = (e: any) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTextRef.current += ` ${piece}`;
        else live += piece;
      }
      setInterim(`${finalTextRef.current} ${live}`.trim());
      clearSilence();
      silenceRef.current = setTimeout(stopBrowser, SILENCE_MS);
    };
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      rec.onresult = rec.onerror = rec.onend = null;
      clearSilence();
      clearStopGuard();
      if (recognitionRef.current === rec) recognitionRef.current = null;
      if (endBrowserRef.current === end) endBrowserRef.current = null;
      finish(finalTextRef.current || '');
    };
    rec.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? micBlockedMessage()
          : 'Voice input stopped. Try again, or type the task.'
      );
      // A real error ends the session now: don't wait for an `end` that the Android WebView may never send.
      end();
    };
    rec.onend = end;
    recognitionRef.current = rec;
    endBrowserRef.current = end;
    rec.start();
    // Nothing said at all: give up quietly after a while instead of listening forever.
    silenceRef.current = setTimeout(stopBrowser, SILENCE_MS * 3);
  };

  const startRecorder = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      releaseAudio();
      if (cancelledRef.current) {
        setState('idle');
        return;
      }
      setState('transcribing');
      try {
        const text = await deepgramSTT(
          new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        );
        finish(text);
      } catch {
        setError('Could not transcribe that. Try again, or type the task.');
        setState('idle');
      }
    };
    recorderRef.current = recorder;
    recorder.start();

    // Level meter for the waveform, and stop after a pause that follows some speech.
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let heard = false;
      let quietSince = performance.now();
      const startedAt = performance.now();
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += ((data[i] - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 6));
        const now = performance.now();
        if (rms > 0.04) {
          heard = true;
          quietSince = now;
        }
        const stopForPause = heard && now - quietSince > SILENCE_MS;
        const stopForNothing = !heard && now - startedAt > SILENCE_MS * 3;
        if ((stopForPause || stopForNothing) && recorder.state === 'recording') {
          recorder.stop();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* no meter: the person taps stop */
    }
  };

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    setError(null);
    setInterim('');
    cancelledRef.current = false;
    const useRecorder = isDeepgramEnabled() && isLoggedIn() && typeof MediaRecorder !== 'undefined';
    const Ctor = recognitionCtor();
    try {
      if (useRecorder) await startRecorder();
      else if (Ctor) startBrowser(Ctor);
      else {
        setError('Voice input isn’t available in this browser. Type the task instead.');
        return;
      }
      setState('listening');
    } catch (err) {
      clearSilence();
      discardBrowser();
      releaseAudio();
      setError(micStartErrorMessage(err));
      setState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, releaseAudio]);

  /** Stop and use what was said. */
  const stop = useCallback(() => {
    clearSilence();
    if (recognitionRef.current) stopBrowser();
    else if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  /** Stop and throw it away. */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    clearSilence();
    discardBrowser();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    releaseAudio();
    setInterim('');
    setState('idle');
  }, [releaseAudio, discardBrowser]);

  return { state, interim, error, level, start, stop, cancel, clearError: () => setError(null) };
}
