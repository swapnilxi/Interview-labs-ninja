'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SoundscapeId } from './soundscape';
import type { VoicePresetId } from './voice';

export interface CompanionSettings {
  sound: SoundscapeId;
  volume: number; // 0..1
  voiceOn: boolean;
  voicePreset: VoicePresetId;
  voiceURI: string | null;
  spiritual: boolean;
  chimes: boolean;
  soundMuted: boolean; // one-tap mute for sound + chimes, remembers the chosen soundscape
  mascotOn: boolean; // false hides Deepu and silences his voice
}

const SETTINGS_KEY = 'ls.companion.settings.v2';
const LEGACY_SETTINGS_KEY = 'ls.companion.settings.v1';
const STATS_KEY = 'ls.companion.stats.v1';
const EVT = 'ls-companion-change';

export const DEFAULT_SETTINGS: CompanionSettings = {
  sound: 'om',
  volume: 0.5,
  voiceOn: false,
  voicePreset: 'pip',
  voiceURI: null,
  spiritual: true,
  chimes: true,
  soundMuted: false,
  mascotOn: true,
};

function readSettings(): CompanionSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
    // Migrate from v1, ensuring mascot voice starts off by default
    const legacy = window.localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      const migrated: CompanionSettings = { ...DEFAULT_SETTINGS, ...parsed, voiceOn: false };
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* storage unavailable (private mode): keep working in memory */
  }
}

export function useCompanionSettings() {
  const [settings, setSettings] = useState<CompanionSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    const sync = () => setSettings(readSettings());
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);
  const update = useCallback((patch: Partial<CompanionSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      write(SETTINGS_KEY, next);
      return next;
    });
  }, []);
  return [settings, update] as const;
}

export interface CompanionStats {
  xp: number;
  streak: number;
  lastDay: string | null; // YYYY-MM-DD of the last completed session
  sessions: number;
}

const DEFAULT_STATS: CompanionStats = { xp: 0, streak: 0, lastDay: null, sessions: 0 };

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function useCompanionStats() {
  const [stats, setStats] = useState<CompanionStats>(DEFAULT_STATS);
  useEffect(() => {
    const sync = () => setStats(read(STATS_KEY, DEFAULT_STATS));
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);

  const addXp = useCallback((n: number) => {
    const cur = read(STATS_KEY, DEFAULT_STATS);
    write(STATS_KEY, { ...cur, xp: cur.xp + n });
  }, []);

  /** Call once when a session completes. Returns the new streak and whether it grew today. */
  const completeSession = useCallback(() => {
    const cur = read(STATS_KEY, DEFAULT_STATS);
    const today = dayKey();
    if (cur.lastDay === today) {
      write(STATS_KEY, { ...cur, sessions: cur.sessions + 1 });
      return { streak: cur.streak, grew: false };
    }
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const streak = cur.lastDay === dayKey(y) ? cur.streak + 1 : 1;
    write(STATS_KEY, { ...cur, streak, lastDay: today, sessions: cur.sessions + 1 });
    return { streak, grew: true };
  }, []);

  return { stats, addXp, completeSession };
}
