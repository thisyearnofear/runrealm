// Minimal service worker for offline territory viewing
const CACHE_NAME = 'runrealm-v1';
const STATIC_ASSETS = ['/', '/bundle.js', '/styles.css'];

// Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

// Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    return; // Don't cache API calls
  }

  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
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
