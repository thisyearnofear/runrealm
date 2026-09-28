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
//    content-hashed `_next/static` files) and network-first for
//    navigations.
//
// Why navigations are network-first, and not stale-while-revalidate:
// the export emits an index.html that points at content-hashed chunks, and
// a deploy *deletes* the chunks the old index referenced. Serving a cached
// shell after a deploy therefore asks the browser to load files that no
// longer exist — a blank app with no console error, on the first load after
// every release. The old version did exactly that: it claimed to be "never
// stuck on stale HTML" and was, because `cached || network` puts the cache
// first. Network-first costs one round trip on a repeat visit and removes an
// entire class of "the site is down after a release" reports. Offline still
// works: the network attempt fails and the cache answers.
//
// CACHE_NAME is bumped to v3 for that change. Bumping it is what makes every
// browser drop the v2 shell on activate, which is the only mechanism that
// gets a corrected strategy to people who already have one installed.
const CACHE_NAME = 'runrealm-v3';
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

  if (request.mode === 'navigate') {
    // Network-first for the shell. See the header comment for why a cached
    // index.html is not safe to serve ahead of the network.
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            // Best-effort: a full disk must not turn a working page into an
            // error page. The next visit online will fix it.
            try {
              await cache.put(request, response.clone());
            } catch {
              /* quota or private mode */
            }
          }
          return response;
        } catch (error) {
          // Offline. The cached shell is the whole point of having one.
          const cached = await cache.match(request);
          if (cached) return cached;
          const root = await cache.match('/');
          if (root) return root;
          throw error;
        }
      })
    );
    return;
  }

  // Stale-while-revalidate for everything else that is same-origin and a
  // GET. Nothing here is the shell, so serving it a moment stale is fine.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(request, response.clone()).catch(() => {});
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
