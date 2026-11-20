'use client';

import { useEffect, useRef, useState } from 'react';
import { deepgramSTT, isDeepgramEnabled } from '@/modules/ai-lms/services/voiceService';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { micBlockedMessage, micStartErrorMessage } from './micPermission';

/** How long a stop waits for the recognizer's `end` before resetting the button on its own. */
const STOP_GRACE_MS = 1500;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type VoiceLang = 'en' | 'hi';

/**
 * Mic-to-text. Uses Deepgram (server proxy) when enabled and the user is logged in;
 * otherwise falls back to the browser's Web Speech API. `lang` picks English (the default) or Hindi.
 */
export function useVoiceInput(
  onTranscript: (text: string) => void,
  { lang = 'en' }: { lang?: VoiceLang } = {}
) {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopStream();
    },
    []
  );

  const startDeepgram = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stopStream();
      setState('transcribing');
      try {
        const text = await deepgramSTT(
          new Blob(chunks, { type: rec.mimeType || 'audio/webm' }),
          lang === 'hi' ? 'hi' : undefined
        );
        if (text.trim()) onTranscript(text.trim());
      } catch {
        setError('Transcription failed. Try again.');
      } finally {
        setState('idle');
      }
    };
    recorderRef.current = rec;
    rec.start();
    setState('recording');
  };

  const startBrowser = () => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      setError('Voice input is not supported in this browser.');
      return;
    }
    const rec: SpeechRecognitionLike = new Ctor();
    rec.lang = lang === 'hi' ? 'hi-IN' : 'en-US';
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onTranscript(e.results[i][0].transcript.trim());
      }
    };
    // Only the current recognizer may reset the button: a late event from an older one must not touch a newer one.
    const done = () => {
      if (recognitionRef.current !== rec) return;
      recognitionRef.current = null;
      setState('idle');
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? micBlockedMessage()
          : 'Voice input failed.'
      );
      done();
    };
    rec.onend = done;
    recognitionRef.current = rec;
    rec.start();
    setState('recording');
  };

  /** The Android WebView can go quiet after stop() and never send `end`: don't leave the button on "recording". */
  const stopBrowser = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
    setTimeout(() => {
      if (recognitionRef.current !== rec) return;
      recognitionRef.current = null;
      setState('idle');
    }, STOP_GRACE_MS);
  };

  const toggle = async () => {
    setError(null);
    if (state === 'recording') {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopBrowser();
      return;
    }
    if (state !== 'idle') return;
    try {
      if (isDeepgramEnabled() && isLoggedIn()) await startDeepgram();
      else startBrowser();
    } catch (err) {
      stopStream();
      recognitionRef.current = null;
      setState('idle');
      setError(micStartErrorMessage(err));
    }
  };

  return { state, error, toggle, clearError: () => setError(null) };
}
