const CACHE_NAME = 'astra-chat-vite-cache-v15';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png'
];

const API_HOSTS = ['openrouter.ai', 'googleapis.com', 'api.tavily.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch((error) => {
        console.warn('Service Worker precache skipped:', error);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    const staleCaches = cacheNames.filter((cacheName) => cacheName !== CACHE_NAME);
    await Promise.all(staleCaches.map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();

    if (staleCaches.length > 0) {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clientsList.forEach((client) => {
        client.postMessage({ type: 'NEW_VERSION_ACTIVATED' });
      });
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || API_HOSTS.some((host) => url.hostname.includes(host))) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/') || caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response && response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
