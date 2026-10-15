'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { sameAddress } from './urlState';

/** The Navigation API (Chromium, Safari 26+): the same-origin entry just before this one, if any. */
interface NavigationLike {
  canGoBack: boolean;
  currentEntry: { index: number } | null;
  entries(): { url: string | null }[];
}

function previousEntryAddress(): string | null {
  if (typeof window === 'undefined') return null;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (!nav || !nav.canGoBack || !nav.currentEntry) return null;
  const prev = nav.entries()[nav.currentEntry.index - 1];
  if (!prev?.url) return null;
  try {
    const url = new URL(prev.url);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

export interface SmartBackOptions {
  /**
   * For a screen reachable from several places (a question's review page, a lesson): go back to wherever
   * the user actually came from whenever the previous entry is in this app, and use `parent` only as the
   * fallback (a refresh, a shared link). Default false: only go back in history when the previous entry
   * IS the parent.
   */
  preferHistory?: boolean;
}

/**
 * A Back that always lands somewhere sensible:
 * - if the entry before this one already IS the parent, it goes back in history (no duplicate entry,
 *   and Forward still returns here);
 * - otherwise (a refresh, a shared link, a different route in between) it navigates to the parent.
 * It never leaves the app: an external or missing previous entry just means "go to the parent".
 */
export function useSmartBack() {
  const router = useRouter();
  return useCallback(
    (parent: string, options: SmartBackOptions = {}) => {
      const previous = previousEntryAddress();
      const current = typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`;
      const usable = previous && !sameAddress(previous, current);
      if (usable && (options.preferHistory || sameAddress(previous, parent))) router.back();
      else router.push(parent);
    },
    [router]
  );
}
