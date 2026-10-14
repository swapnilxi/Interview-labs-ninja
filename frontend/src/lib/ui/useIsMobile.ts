'use client';

import { useSyncExternalStore } from 'react';

/** Phones and small tablets in portrait: below Tailwind's `md` breakpoint (768px). */
const QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** False on the server and during hydration, so desktop markup renders first and never mismatches. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
