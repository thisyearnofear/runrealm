// Minimal service worker for offline territory viewing
const CACHE_NAME = 'runrealm-v1';
const STATIC_ASSETS = [
  '/',
  '/bundle.js',
  '/styles.css'
];

// Cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// Serve from cache, fallback to network
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/')) {
    return; // Don't cache API calls
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
