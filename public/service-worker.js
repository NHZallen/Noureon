const CACHE_PREFIX = 'noureon-cache-';
const CACHE_NAME = `${CACHE_PREFIX}v20`;
const SHELL_READY_KEY = '/__noureon-shell-ready-v20__';
const BUILD_MANIFEST_PATH = '/build-manifest.json';
const NAVIGATION_TIMEOUT_MS = 2500;
const NAVIGATION_TIMEOUT = Symbol('navigation-timeout');

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/vendor/mhchem.min.js'
];

const NETWORK_ONLY_PATH_PREFIXES = [
  '/api/',
  '/auth/',
  '/rest/v1/',
  '/realtime/v1/',
  '/storage/v1/',
  '/functions/v1/',
  '/graphql/v1/'
];

function pathMatchesPrefix(pathname, prefix) {
  const withoutTrailingSlash = prefix.slice(0, -1);
  return pathname === withoutTrailingSlash || pathname.startsWith(prefix);
}

function isNetworkOnlyRequest(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return true;
  if (NETWORK_ONLY_PATH_PREFIXES.some(prefix => pathMatchesPrefix(url.pathname, prefix))) return true;
  return Boolean(request.headers?.has('authorization') || request.headers?.has('apikey'));
}

function isCacheableStaticAsset(url) {
  if (STATIC_ASSETS.includes(url.pathname)) return true;
  return /^\/assets\/.+-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+$/.test(url.pathname);
}

function isSuccessfulHtml(response) {
  return Boolean(
    response?.ok
    && response.headers?.get('content-type')?.toLowerCase().includes('text/html')
  );
}

function collectManifestAssets(manifest) {
  const assets = new Set();
  for (const entry of Object.values(manifest || {})) {
    for (const path of [entry?.file, ...(entry?.css || []), ...(entry?.assets || [])]) {
      if (!path || !/\.(?:js|css)$/i.test(path)) continue;
      assets.add(`/${path.replace(/^\//, '')}`);
    }
  }
  return [...assets];
}

async function precacheCurrentShell() {
  const cache = await caches.open(CACHE_NAME);
  const shellResponse = await fetch('/');
  if (!isSuccessfulHtml(shellResponse)) throw new Error('The current application shell is unavailable.');

  const manifestResponse = await fetch(BUILD_MANIFEST_PATH);
  if (!manifestResponse?.ok) throw new Error('The current build manifest is unavailable.');
  const buildAssets = collectManifestAssets(await manifestResponse.json());
  await cache.addAll([
    ...STATIC_ASSETS.filter(path => path !== '/'),
    ...buildAssets
  ]);
  await cache.put('/', shellResponse.clone());
  await cache.put(SHELL_READY_KEY, shellResponse.clone());
}

async function cacheNavigationResponse(response) {
  if (!isSuccessfulHtml(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put('/', response.clone());
}

async function matchCachedShell() {
  const currentCache = await caches.open(CACHE_NAME);
  const currentRoot = await currentCache.match('/') || await currentCache.match('/index.html');
  if (currentRoot) return currentRoot;
  const root = await caches.match('/');
  return root || caches.match('/index.html');
}

async function networkFirstNavigation(event) {
  const networkResponse = fetch(event.request);
  event.waitUntil(
    networkResponse
      .then(response => cacheNavigationResponse(response))
      .catch(() => undefined)
  );

  let timeoutId;
  const timeout = new Promise(resolve => {
    timeoutId = setTimeout(() => resolve(NAVIGATION_TIMEOUT), NAVIGATION_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([networkResponse, timeout]);
    if (response !== NAVIGATION_TIMEOUT) {
      clearTimeout(timeoutId);
      if (!response?.ok) {
        const cached = await matchCachedShell();
        if (cached) return cached;
      }
      return response;
    }

    const cached = await matchCachedShell();
    if (cached) return cached;
    return await networkResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    const cached = await matchCachedShell();
    if (cached) return cached;
    throw error;
  }
}

function cacheFirstStaticAsset(event) {
  const cachedResponse = caches.match(event.request);
  const networkResponse = cachedResponse.then(cached => (
    cached ? null : fetch(event.request)
  ));
  const response = Promise.all([cachedResponse, networkResponse])
    .then(([cached, fetched]) => cached || fetched);

  event.waitUntil(
    networkResponse
      .then(async fetched => {
        if (!fetched?.ok) return;
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, fetched.clone());
      })
      .catch(() => undefined)
  );
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheCurrentShell()
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.warn('Service Worker install retained the previous offline shell:', error);
        throw error;
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    const staleCaches = cacheNames.filter((cacheName) => (
      cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME
    )).sort((left, right) => {
      const leftVersion = Number(left.slice(CACHE_PREFIX.length).replace(/^v/, '')) || 0;
      const rightVersion = Number(right.slice(CACHE_PREFIX.length).replace(/^v/, '')) || 0;
      return leftVersion - rightVersion;
    });
    const currentCache = await caches.open(CACHE_NAME);
    const currentShellReady = await currentCache.match(SHELL_READY_KEY);
    const retainedStaleCaches = currentShellReady ? staleCaches.slice(-1) : staleCaches;
    const deletedCaches = currentShellReady
      ? staleCaches.filter(cacheName => !retainedStaleCaches.includes(cacheName))
      : [];
    await Promise.all(deletedCaches.map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();

    if (currentShellReady && staleCaches.length > 0) {
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

  if (isNetworkOnlyRequest(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  if (!isCacheableStaticAsset(url)) return;

  event.respondWith(cacheFirstStaticAsset(event));
});
