// Service worker of the sandbox origin (scope /sandbox/). Keeps Pyodide and
// the packages in Cache Storage so the sandbox loads quickly and works
// offline, and checks every CDN file and wheel against the hashes committed
// with the app (pyodide/integrity.json and the lock file) before using it.
// A file that does not match, or is not listed, is refused.
//
// A classic script: some browsers cannot run module service workers. The
// constants are kept equal to protocol.js by a test.

const PYODIDE_VERSION = '314.0.7';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const WHEEL_ORIGIN_PLACEHOLDER = 'https://sandbox.invalid';
const CACHE_PREFIX = 'noureon-sandbox-';
const CACHE_NAME = `${CACHE_PREFIX}${PYODIDE_VERSION}-1`;
const SCOPE_PATH = new URL('./', self.location.href).pathname;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

const toHex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

// Expected hashes by absolute URL, built from the committed files.
let expectedHashes = null;
const loadExpectedHashes = () => {
  expectedHashes ||= (async () => {
    const [integrity, lock] = await Promise.all(['pyodide/integrity.json', 'pyodide/pyodide-lock.json'].map(async (path) => {
      const response = await networkFirst(new Request(new URL(path, self.location.href).href));
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.json();
    }));
    const hashes = new Map();
    for (const [file, hash] of Object.entries(integrity.core || {})) hashes.set(`${PYODIDE_CDN}${file}`, hash);
    for (const entry of Object.values(lock.packages || {})) {
      const url = String(entry.file_name).replace(WHEEL_ORIGIN_PLACEHOLDER, self.location.origin);
      hashes.set(new URL(url, PYODIDE_CDN).href, entry.sha256);
    }
    return hashes;
  })();
  expectedHashes.catch(() => { expectedHashes = null; });
  return expectedHashes;
};

const markedAsCached = (response) => {
  const headers = new Headers(response.headers);
  headers.set('x-sandbox-cache', 'hit');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

// Pinned files: from the cache, or downloaded, checked and then cached.
async function verified(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.url);
  if (cached) return markedAsCached(cached);
  const expected = (await loadExpectedHashes()).get(request.url);
  if (!expected) return new Response('Not a pinned sandbox file.', { status: 403 });
  const response = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) return response;
  const body = await response.arrayBuffer();
  if (toHex(await crypto.subtle.digest('SHA-256', body)) !== expected) {
    return new Response('The file does not match its pinned hash.', { status: 502 });
  }
  const checked = new Response(body, { status: 200, headers: response.headers });
  await cache.put(request.url, checked.clone());
  return checked;
}

// The sandbox's own code: the network first so updates arrive, the cache
// when offline.
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.url.startsWith(PYODIDE_CDN) || (url.origin === self.location.origin && url.pathname.startsWith(`${SCOPE_PATH}wheels/`))) {
    event.respondWith(verified(request));
  } else if (url.origin === self.location.origin && url.pathname.startsWith(SCOPE_PATH)) {
    event.respondWith(networkFirst(request));
  }
});
