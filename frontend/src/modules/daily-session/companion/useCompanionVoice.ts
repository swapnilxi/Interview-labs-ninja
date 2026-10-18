'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCompanionSettings } from './useCompanion';
import { isSoundscapePlaying, playSoundscape, setSoundscapeVolume, stopSoundscape } from './soundscape';
import { speak, stopSpeaking } from './voice';
import type { Mood } from './content';

/** Companion message + voice + focus-sound lifecycle for a screen. Silences everything on unmount. */
export function useCompanionVoice(initialMsg: string) {
  const [settings, update] = useCompanionSettings();
  const [msg, setMsg] = useState(initialMsg);
  const [mood, setMood] = useState<Mood>('happy');
  const [speaking, setSpeaking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const say = useCallback(
    (text: string, m: Mood = 'happy', voice?: boolean) => {
      setMsg(text);
      setMood(m);
      const shouldSpeak = voice !== undefined ? voice : (settings.voiceOn && settings.mascotOn);
      if (shouldSpeak && settings.mascotOn) {
        speak(text, settings.voicePreset, settings.voiceURI);
        setSpeaking(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setSpeaking(false), Math.min(6000, 600 + text.length * 55));
      }
    },
    [settings.voiceOn, settings.mascotOn, settings.voicePreset, settings.voiceURI],
  );

  /** Call from a tap handler (browser autoplay policy). No-op if already playing or set to silence. */
  const startSound = useCallback(() => {
    if (settings.sound === 'off' || settings.soundMuted || isSoundscapePlaying()) return;
    playSoundscape(settings.sound);
    setSoundscapeVolume(settings.volume);
  }, [settings.sound, settings.soundMuted, settings.volume]);

  useEffect(
    () => () => {
      stopSoundscape();
      stopSpeaking();
      clearTimeout(timer.current);
    },
    [],
  );

  return { settings, update, msg, mood, speaking, say, startSound };
}
