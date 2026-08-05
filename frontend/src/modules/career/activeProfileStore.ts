/**
 * Plain (non-React) "active Career Data Profile" store, backed by localStorage.
 *
 * Career Studio pages (Generate, the view editor, the profile editor) all want
 * to default to "whichever profile the user was last working with" and stay in
 * sync when it changes anywhere. Mirrors lib/auth/tokenStore.ts's pattern: a
 * module-level cache + listener set, so components can subscribe without a
 * context provider.
 *
 * Stores only the id (+ a cached title for instant display before the profile
 * list loads) — never content. If the stored id no longer exists (deleted, or
 * a different account), callers fall back to "first profile in the list".
 */

const KEY = 'labninja.career.activeProfile.v1';

export interface ActiveProfileRef {
  id: string;
  title?: string;
}

let cached: ActiveProfileRef | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    cached = raw ? JSON.parse(raw) : null;
  } catch {
    cached = null;
  }
}

export function getActiveProfile(): ActiveProfileRef | null {
  hydrate();
  return cached;
}

export function setActiveProfile(ref: ActiveProfileRef | null): void {
  cached = ref;
  hydrated = true;
  if (typeof window !== 'undefined') {
    if (ref) window.localStorage.setItem(KEY, JSON.stringify(ref));
    else window.localStorage.removeItem(KEY);
  }
  listeners.forEach((cb) => cb());
}

/** Subscribe to active-profile changes (e.g. switched on another tab/page). Returns an unsubscribe function. */
export function onActiveProfileChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
