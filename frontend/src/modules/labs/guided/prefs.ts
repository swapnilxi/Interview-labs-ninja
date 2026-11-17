'use client';

/**
 * How the learner likes Guided Practice to look and feel: the toggles of the Preferences sheet and of the page. They are
 * a per-browser convenience (localStorage, like the Config page's theme), not progress: switching Game mode off hides the
 * XP, rings and rewards but the game keeps counting underneath, so switching it back on loses nothing.
 */

import { useSyncExternalStore } from 'react';

export type FontSize = 's' | 'm' | 'l';

export interface Prefs {
  /** XP, levels, rings, streaks, badges and reward banners on screen. Progress is tracked either way. */
  game: boolean;
  /** Reward banners and the small animations that go with them. */
  celebrate: boolean;
  /** A short tone and a tap of haptics when something is earned. */
  feedback: boolean;
  /** Tighter rows in the path. */
  compact: boolean;
  /** Only the workspace: the dashboard and the path are hidden. */
  focus: boolean;
  /** Only the questions that are still to do, in the path. */
  todoOnly: boolean;
  /** Line numbers in the code editor. */
  lineNumbers: boolean;
  fontSize: FontSize;
  /** Questions to complete a day (the Today ring). */
  dailyGoal: number;
}

export const DEFAULT_PREFS: Prefs = {
  game: true,
  celebrate: true,
  feedback: false,
  compact: false,
  focus: false,
  todoOnly: false,
  lineNumbers: true,
  fontSize: 'm',
  dailyGoal: 3,
};

const KEY = 'gp.prefs.v1';

function sanitize(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (k: keyof Prefs) =>
    typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_PREFS[k] as boolean);
  const goal = Number(r.dailyGoal);
  return {
    game: bool('game'),
    celebrate: bool('celebrate'),
    feedback: bool('feedback'),
    compact: bool('compact'),
    focus: bool('focus'),
    todoOnly: bool('todoOnly'),
    lineNumbers: bool('lineNumbers'),
    fontSize: r.fontSize === 's' || r.fontSize === 'l' ? r.fontSize : 'm',
    dailyGoal: Number.isInteger(goal) && goal >= 1 && goal <= 10 ? goal : DEFAULT_PREFS.dailyGoal,
  };
}

let current: Prefs = DEFAULT_PREFS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) current = sanitize(JSON.parse(raw));
  } catch {
    /* private window, blocked storage or a corrupt value: the defaults stand */
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try {
      current = sanitize(e.newValue ? JSON.parse(e.newValue) : null);
    } catch {
      current = DEFAULT_PREFS;
    }
    listeners.forEach((l) => l());
  });
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  load();
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* kept for this visit only */
  }
  listeners.forEach((l) => l());
}

export function getPrefs(): Prefs {
  load();
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The learner's preferences; re-renders when any of them changes (here or in another tab). */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);
}
