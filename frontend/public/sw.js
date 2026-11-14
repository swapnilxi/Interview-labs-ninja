/*
 * sw.js — the app's service worker: offline support for the Swipe PDF Reader, and the delivery side of
 * task reminders (notification taps, and server push once that is set up — see notification-setup.html).
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

// ── Reminders ─────────────────────────────────────────────────────────────────────────────────────────────────
// A tapped notification brings the app to the front on the task it is about (or opens it if it was closed).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.href || '/ai-todo?tab=today', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) {
          try {
            await client.navigate(target);
          } catch {
            /* an uncontrolled tab can't be navigated from here; it is in front at least */
          }
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// Server push (pending: needs VAPID keys and a scheduler, see notification-setup.html). Payload:
// { "title": "...", "body": "...", "href": "/ai-todo?tab=today&task=12", "tag": "reminder-12" }
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Reminder';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { href: payload.href || '/ai-todo?tab=today' },
      requireInteraction: true,
    }),
  );
});
