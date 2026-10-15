'use client';

/**
 * Screen state lives in the URL, so every screen has an address: Back/Forward, refresh, bookmarks and
 * shared links all land on the same screen. Conventions used across the app:
 *
 * - `?tab=` picks a section of a page; further params (`session=`, `q=`, `view=`, `project=`, …) pick the
 *   screen inside it. Keep them flat and readable.
 * - `push` when the user moves to a different screen (list → detail, setup → quiz, tab → tab): it adds a
 *   history entry, so Back returns to the previous screen.
 * - `replace` when the same screen is only refined (next/previous step, a filter, a search box): no new
 *   history entry, so Back doesn't have to be pressed ten times to leave a quiz.
 * - A param that is missing or unknown must fall back to the parent screen, never to a blank page.
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type NavMode = 'push' | 'replace';
export type ParamUpdates = Record<string, string | number | boolean | null | undefined>;

/** `pathname?query` with `updates` applied to `current`. null, undefined and '' remove a key. */
export function buildUrl(pathname: string, current: URLSearchParams | string, updates: ParamUpdates): string {
  const params = new URLSearchParams(typeof current === 'string' ? current : current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Same address? Compares the path and the params, ignoring param order. */
export function sameAddress(a: string, b: string): boolean {
  try {
    const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const ua = new URL(a, base);
    const ub = new URL(b, base);
    if (ua.origin !== ub.origin || ua.pathname !== ub.pathname) return false;
    ua.searchParams.sort();
    ub.searchParams.sort();
    return ua.searchParams.toString() === ub.searchParams.toString();
  } catch {
    return a === b;
  }
}

/**
 * Read and change the current page's query params.
 *
 *   const { get, update } = useUrlState();
 *   const session = get('session');
 *   update({ session: id, q: 1 });                 // new screen   → push
 *   update({ q: next }, 'replace');                // same screen  → replace
 *
 * Needs a Suspense boundary above it (it uses useSearchParams), as every page that reads the URL does.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (updates: ParamUpdates, mode: NavMode = 'push') => {
      const url = buildUrl(pathname, searchParams.toString(), updates);
      if (sameAddress(url, `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`)) return;
      router[mode](url, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const get = useCallback((key: string) => searchParams.get(key), [searchParams]);

  return { pathname, searchParams, get, update };
}
