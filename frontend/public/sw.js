/*
 * sw.js — offline support for the Swipe PDF Reader.
 *
 * Strategy
 * ────────
 * • App shell (the reader route HTML)  → network-first, cache fallback.
 * • Static assets (/_next/static/…, /pdfjs/…, images) → cache-first.
 * • Everything else (API calls, RSC data fetches, other routes) → untouched.
 *
 * The page itself sends the list of assets it actually loaded (see
 * `utils/offlineAssets.ts`) so the very first visit is cached too.
 */

const CACHE_NAME = 'swipe-reader-v1';
const SHELL_PATHS = ['/swipe-pdf-reader', '/swipepdfreader'];
const STATIC_PREFIXES = ['/_next/static/', '/pdfjs/', '/assets/', '/icons/'];

function isShellNavigation(url) {
  return SHELL_PATHS.some(
    (path) => url.pathname === path || url.pathname === `${path}/`,
  );
}

const MAX_STATIC_ENTRIES = 500;

/**
 * Hashed build chunks pile up across deploys. Keeping the newest few hundred
 * stops the offline cache from eating the phone's storage quota.
 */
async function pruneCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_STATIC_ENTRIES) return;
    const excess = keys.length - MAX_STATIC_ENTRIES;
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  } catch {
    /* non-fatal */
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    cache.put(request, response.clone()).catch(() => {});
    pruneCache(cache);
  }
  return response;
}

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(cacheKey, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        SHELL_PATHS.map(async (path) => {
          try {
            const response = await fetch(path, { cache: 'reload' });
            if (response.ok) await cache.put(path, response);
          } catch {
            /* offline during install — the page warms the cache instead */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          // Only drop our own old caches — never another app's on this origin.
          .filter((key) => key.startsWith('swipe-reader-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache-assets' || !Array.isArray(data.urls)) return;

  const urls = data.urls.filter((url) => typeof url === 'string').slice(0, 200);

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        urls.map(async (url) => {
          if (await cache.match(url)) return;
          try {
            const response = await fetch(url);
            if (response.ok) await cache.put(url, response.clone());
          } catch {
            /* skip */
          }
        }),
      );
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Next.js router data requests share the page URL; never answer those with
  // cached HTML — only real navigations get the shell.
  // Keyed by pathname so `/swipe-pdf-reader?_rsc=…` never overwrites the
  // cached HTML shell.
  if (request.mode === 'navigate' && isShellNavigation(url)) {
    event.respondWith(networkFirst(request, url.pathname));
    return;
  }

  if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(request));
  }
});
