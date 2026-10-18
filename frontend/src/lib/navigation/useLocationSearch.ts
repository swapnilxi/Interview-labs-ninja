'use client';

import { useSyncExternalStore } from 'react';

/**
 * The current `window.location.search`, kept live. Next's router changes the query with history.pushState/
 * replaceState, which fire no event, so a component that read window.location while rendering only noticed a
 * change when something else re-rendered it, and rendered different HTML on the server and in the browser
 * (a hydration mismatch). This reads it as an external store instead: the server and the first client render
 * both see '' (so they match), then it follows every push/replace/Back/Forward.
 * Use it for things like "which sidebar link is the current ?tab=". Prefer useUrlState where a Suspense
 * boundary is already in place.
 */
const EVENT = 'labninja:locationchange';
let patched = false;

function patchHistory() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method];
    window.history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      // Next calls pushState/replaceState inside a React insertion effect, where nothing may schedule an update:
      // tell subscribers a moment later (the URL itself has already changed).
      queueMicrotask(() => window.dispatchEvent(new Event(EVENT)));
      return result;
    };
  }
}

function subscribe(onChange: () => void) {
  patchHistory();
  window.addEventListener(EVENT, onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('popstate', onChange);
  };
}

export function useLocationSearch(): string {
  return useSyncExternalStore(subscribe, () => window.location.search, () => '');
}
