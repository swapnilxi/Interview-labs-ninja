/**
 * Topics a session can focus on. The preset labels are matched case-insensitively by the backend
 * (`_TOPIC_SLOTS` in backend/modules/daily_session/daily_session.py): keep the two in step. Any other
 * string is a custom topic and is sent as free text.
 */
export const TOPIC_OPTIONS = ['DSA', 'System Design', 'Debugging', 'Behavioral', 'Computer Vision', 'ML Infra'] as const;

const CUSTOM_KEY = 'labninja.ds.customTopics.v1';
export const MAX_TOPIC_LENGTH = 60;

/** Normalises a typed topic: collapsed whitespace, capped length. */
export function cleanTopic(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC_LENGTH);
}

/** Focus areas the user saved in My Space (same key MySpace writes). Empty when none saved. */
export function readFocusTopics(userKey: string): string[] {
  try {
    const raw = localStorage.getItem(`myspace_targets_${userKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.focusTopics) ? parsed.focusTopics.filter((t: unknown) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/** Custom topics remembered in this browser, so they stay available as chips. */
export function readCustomTopics(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((t: unknown): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function writeCustomTopics(topics: string[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(topics));
  } catch {
    /* storage unavailable: custom topics just are not remembered */
  }
}

export const isPresetTopic = (t: string) => TOPIC_OPTIONS.some((o) => o.toLowerCase() === t.toLowerCase());
