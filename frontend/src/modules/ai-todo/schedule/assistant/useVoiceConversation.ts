'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThreadItem } from '@/lib/services/agentService';
import { listenOnce, speaker, textToSay, type Listening, type VoiceSettings } from './voice';

/**
 * Voice mode: listen → think → speak → listen again, until it is closed. You can tap to finish speaking early, tap to
 * interrupt the answer (it listens again at once), or pause. It also pauses by itself after silence, after an error,
 * and when an answer is waiting for a tap (deleting a schedule asks for confirmation).
 */

export type VoicePhase = 'off' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';

interface Options {
  send: (text: string, opts: { voice?: boolean }) => Promise<ThreadItem | null>;
  settings: VoiceSettings;
  /** 0–1 microphone level while listening (called often: keep it cheap). */
  onLevel?: (level: number) => void;
}

export function useVoiceConversation({ send, settings, onLevel }: Options) {
  const [phase, setPhase] = useState<VoicePhase>('off');
  const [caption, setCaption] = useState('');
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState<ThreadItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef(false);
  const phaseRef = useRef<VoicePhase>('off');
  const listening = useRef<Listening | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const levelRef = useRef(onLevel);
  levelRef.current = onLevel;

  const go = (p: VoicePhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const listen = useCallback(async () => {
    if (!openRef.current || phaseRef.current === 'listening') return;
    speaker.stop();
    go('listening');
    setCaption('');
    setError(null);
    const l = listenOnce({
      onLevel: (v) => levelRef.current?.(v),
      onInterim: setCaption,
    });
    listening.current = l;
    let text = '';
    try {
      text = await l.done;
    } catch (err) {
      listening.current = null;
      levelRef.current?.(0);
      if (!openRef.current) return;
      setError(err instanceof Error ? err.message : 'Voice input failed.');
      go('error');
      return;
    }
    listening.current = null;
    levelRef.current?.(0);
    if (!openRef.current) return;
    if (!text) {
      go('paused');
      return;
    }
    setHeard(text);
    setCaption('');
    setAnswer(null);
    go('thinking');
    const reply = await send(text, { voice: true });
    if (!openRef.current) return;
    setAnswer(reply);
    if (!reply) {
      go('paused');
      return;
    }
    if (reply.failed) {
      setError(reply.text);
      go('error');
      return;
    }
    go('speaking');
    await speaker.speak(textToSay(reply.text, reply.speech), settingsRef.current);
    if (!openRef.current || phaseRef.current !== 'speaking') return;
    if (reply.actions?.some((a) => a.state === 'confirm')) {
      go('paused');
      return;
    }
    void listen();
  }, [send]);

  const open = useCallback(() => {
    openRef.current = true;
    setHeard('');
    setAnswer(null);
    setError(null);
    phaseRef.current = 'off';
    void listen();
  }, [listen]);

  const close = useCallback(() => {
    openRef.current = false;
    listening.current?.cancel();
    listening.current = null;
    speaker.stop();
    levelRef.current?.(0);
    go('off');
  }, []);

  /** The big button: done talking / interrupt the answer / start listening again. */
  const tap = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'listening') listening.current?.finish();
    else if (p === 'speaking') {
      phaseRef.current = 'paused';
      speaker.stop();
      void listen();
    } else if (p === 'paused' || p === 'error') void listen();
  }, [listen]);

  /** Stop listening (or speaking) and wait. */
  const pause = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'listening') {
      listening.current?.cancel();
    } else if (p === 'speaking') {
      phaseRef.current = 'paused';
      speaker.stop();
      go('paused');
    }
  }, []);

  useEffect(
    () => () => {
      openRef.current = false;
      listening.current?.cancel();
      speaker.stop();
    },
    []
  );

  return { phase, caption, heard, answer, error, open, close, tap, pause };
}
