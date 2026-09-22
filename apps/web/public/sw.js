// RunRealm service worker — offline shell + runtime caching + push.
//
// Caching strategy (perf pass):
//  - Precache: only assets that actually exist in the static export.
//    The old precache listed `/bundle.js` and `/styles.css`, which
//    don't exist in this Next.js build → `cache.addAll` rejected on
//    the 404 and SW installation silently failed, so NO caching ever
//    worked. Now only `/` is precached; everything else is cached at
//    runtime.
//  - Runtime: cache-first for static build assets (immutable,
//    content-hashed `_next/static` files), stale-while-revalidate for
//    navigation + other same-origin GETs so repeat visits are
//    instant but never stuck on stale HTML.
const CACHE_NAME = 'runrealm-v2';
const PRECACHE_ASSETS = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  // Content-hashed Next.js build output — safe to cache forever.
  return url.pathname.startsWith('/_next/static/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // never cache API calls

  if (isStaticAsset(url)) {
    // Cache-first: hashed filenames are immutable.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Stale-while-revalidate for navigations and other same-origin gets:
  // serve from cache when available, refresh in the background.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Push notifications: territory decay alerts, ghost race results.
// Payload shape: { title, body, tag? } (JSON string).
self.addEventListener('push', (event) => {
  let payload = { title: 'RunRealm', body: 'Your territories await.' };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (err) {
    // Non-JSON push — fall back to defaults.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/apple-touch-icon-180x180.png',
      badge: '/apple-touch-icon-180x180.png',
    })
  );
});

// Clicking a notification focuses the app (dashboard opens via app code).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
