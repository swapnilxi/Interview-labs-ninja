'use client';

import { useEffect, useRef, useState } from 'react';
import { deepgramSTT, isDeepgramEnabled } from '@/modules/ai-lms/services/voiceService';
import { isLoggedIn } from '@/lib/auth/tokenStore';

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

/**
 * Mic-to-text. Uses Deepgram (server proxy) when enabled and the user is logged in;
 * otherwise falls back to the browser's Web Speech API.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
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
        const text = await deepgramSTT(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
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
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onTranscript(e.results[i][0].transcript.trim());
      }
    };
    rec.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Microphone permission denied.' : 'Voice input failed.');
      setState('idle');
    };
    rec.onend = () => setState('idle');
    recognitionRef.current = rec;
    rec.start();
    setState('recording');
  };

  const toggle = async () => {
    setError(null);
    if (state === 'recording') {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      recognitionRef.current?.stop();
      return;
    }
    if (state !== 'idle') return;
    try {
      if (isDeepgramEnabled() && isLoggedIn()) await startDeepgram();
      else startBrowser();
    } catch {
      stopStream();
      setError('Microphone permission denied.');
    }
  };

  return { state, error, toggle, clearError: () => setError(null) };
}
