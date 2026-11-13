'use client';

/**
 * offlineAssets.ts — keeps the Swipe PDF Reader usable without a connection.
 *
 * Registers `public/sw.js` (scope: whole app, but it only intercepts the reader
 * route and static assets) and then hands the worker the list of assets this
 * page actually loaded, so the *first* visit is cached too. Without that warm
 * step a service worker can only cache the second visit onwards.
 */

const SW_URL = '/sw.js';
const SHELL_PATHS = ['/swipe-pdf-reader', '/swipepdfreader'];

let registrationPromise: Promise<void> | null = null;

function collectLoadedAssets(): string[] {
  if (typeof performance === 'undefined') return [];

  const urls = new Set<string>(SHELL_PATHS);

  for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    const name = entry?.name;
    if (!name || !name.startsWith(window.location.origin)) continue;
    if (!name.includes('/_next/static/') && !name.includes('/pdfjs/')) continue;
    urls.add(name);
  }

  return Array.from(urls);
}

function warmCache(worker: ServiceWorker | null): void {
  if (!worker) return;
  try {
    worker.postMessage({ type: 'cache-assets', urls: collectLoadedAssets() });
  } catch {
    /* non-fatal */
  }
}

export function registerReaderOfflineSupport(): Promise<void> {
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });

      // Warm the cache with what is already on the page.
      warmCache(registration.active ?? navigator.serviceWorker.controller);

      // And again once this page is controlled (first-ever visit case).
      navigator.serviceWorker.ready.then(() => {
        warmCache(navigator.serviceWorker.controller);
      });

      // Late assets (e.g. the pdf.js worker fetched on the first PDF) are
      // cached by the worker itself, but a second warm pass after extraction
      // is cheap insurance.
      setTimeout(() => warmCache(registration.active ?? navigator.serviceWorker.controller), 5000);
    } catch (err) {
      console.warn('[offline] Service worker registration failed:', err);
    }
  })();

  return registrationPromise;
}
