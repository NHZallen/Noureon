import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { PYODIDE_CDN, PYODIDE_VERSION, WHEEL_ORIGIN_PLACEHOLDER } from '../../public/sandbox/protocol.js';

// The sandbox's service worker (public/sandbox/sw.js, a classic script): it keeps Pyodide and its packages in the cache, and refuses any file that does
// not match the hash committed with the app. Loaded with a service worker's globals of its own.

const ORIGIN = 'https://run.noureon.com';
const swUrl = new URL('../../public/sandbox/sw.js', import.meta.url).href;
const sha = (text) => createHash('sha256').update(text).digest('hex');
const CORE_FILE = `${PYODIDE_CDN}pyodide.asm.wasm`;
const CORE_BODY = 'wasm bytes';
const WHEEL_PATH = '/sandbox/wheels/pkg-1.0-py3-none-any.whl';

const makeCaches = (names = []) => {
  const stores = new Map(names.map((name) => [name, new Map()]));
  return {
    stores,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        match: async (request) => store.get(typeof request === 'string' ? request : request.url)?.clone(),
        put: async (request, response) => { store.set(typeof request === 'string' ? request : request.url, response); }
      };
    }
  };
};

// The network: the hash lists of the app, a core file of Pyodide and a wheel. `down` makes everything fail.
const makeNetwork = ({ coreBody = CORE_BODY, down = false } = {}) => {
  const asked = [];
  const files = {
    [`${ORIGIN}/sandbox/pyodide/integrity.json`]: JSON.stringify({ core: { 'pyodide.asm.wasm': sha(CORE_BODY) } }),
    [`${ORIGIN}/sandbox/pyodide/pyodide-lock.json`]: JSON.stringify({ packages: { pkg: { file_name: `${WHEEL_ORIGIN_PLACEHOLDER}${WHEEL_PATH}`, sha256: sha('wheel bytes') } } }),
    [CORE_FILE]: coreBody,
    [`${ORIGIN}${WHEEL_PATH}`]: 'wheel bytes',
    [`${PYODIDE_CDN}unlisted.js`]: 'x',
    [`${ORIGIN}/sandbox/host.js`]: 'host code'
  };
  const fetchImpl = async (input) => {
    const url = String(input?.url || input);
    asked.push(url);
    if (down) throw new TypeError('offline');
    return url in files ? new Response(files[url], { status: 200 }) : new Response('missing', { status: 404 });
  };
  return { asked, fetchImpl };
};

// Loads sw.js fresh with the worker's globals and returns its listeners.
let loads = 0;
const load = async ({ network = makeNetwork(), caches = makeCaches() } = {}) => {
  const listeners = {};
  const self = {
    location: new URL(`${ORIGIN}/sandbox/sw.js`),
    addEventListener: (type, listener) => { listeners[type] = listener; },
    skipWaiting: () => { self.skipped = true; },
    clients: { claim: async () => { self.claimed = true; } }
  };
  const saved = {};
  for (const [name, value] of Object.entries({ self, caches, fetch: network.fetchImpl })) {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  await import(`${swUrl}?case=${loads += 1}`);
  const restore = () => { for (const [name, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } };
  // A fetch event: what the worker answers with (null when it leaves the request to the browser).
  const request = async (url, method = 'GET') => {
    let answer = null;
    listeners.fetch({ request: Object.assign(new Request(url, { method }), {}), respondWith: (promise) => { answer = promise; } });
    return answer;
  };
  return { self, listeners, request, restore, network, caches };
};

test('installing takes over at once; activating removes the sandbox\'s older caches and nobody else\'s, then claims the pages', async () => {
  const caches = makeCaches([`noureon-sandbox-${PYODIDE_VERSION}-1`, 'noureon-sandbox-1.0.0-1', 'other-site-cache']);
  const worker = await load({ caches });
  try {
    worker.listeners.install();
    assert.equal(worker.self.skipped, true);
    let waited;
    worker.listeners.activate({ waitUntil: (promise) => { waited = promise; } });
    await waited;
    assert.deepEqual([...caches.stores.keys()].sort(), [`noureon-sandbox-${PYODIDE_VERSION}-1`, 'other-site-cache']);
    assert.equal(worker.self.claimed, true);
  } finally { worker.restore(); }
});

test('only GET requests for the sandbox itself, Pyodide and its wheels are answered; everything else is left to the browser', async () => {
  const worker = await load();
  try {
    assert.equal(await worker.request(CORE_FILE, 'POST'), null);
    assert.equal(await worker.request('https://example.com/anything.js'), null);
    assert.equal(await worker.request(`${ORIGIN}/other/place.js`), null, 'a path outside the sandbox\'s scope');
    assert.ok(await worker.request(`${ORIGIN}/sandbox/host.js`));
  } finally { worker.restore(); }
});

test('a Pyodide file is downloaded once, checked against its pinned hash, cached, and then served from the cache', async () => {
  const network = makeNetwork();
  const caches = makeCaches();
  const worker = await load({ network, caches });
  try {
    const first = await (await worker.request(CORE_FILE));
    assert.equal(first.status, 200);
    assert.equal(await first.text(), CORE_BODY);
    assert.equal(first.headers.get('x-sandbox-cache'), null, 'came from the network');
    const downloads = network.asked.filter((url) => url === CORE_FILE).length;
    const second = await (await worker.request(CORE_FILE));
    assert.equal(second.headers.get('x-sandbox-cache'), 'hit');
    assert.equal(await second.text(), CORE_BODY);
    assert.equal(network.asked.filter((url) => url === CORE_FILE).length, downloads, 'not downloaded again');
  } finally { worker.restore(); }
});

test('a file whose bytes do not match the pinned hash is refused and never cached; a file that is not pinned at all is refused', async () => {
  const network = makeNetwork({ coreBody: 'tampered bytes' });
  const caches = makeCaches();
  const worker = await load({ network, caches });
  try {
    const tampered = await (await worker.request(CORE_FILE));
    assert.equal(tampered.status, 502);
    assert.match(await tampered.text(), /pinned hash/);
    const cache = await caches.open(`noureon-sandbox-${PYODIDE_VERSION}-1`);
    assert.equal(await cache.match(CORE_FILE), undefined);
    const unlisted = await (await worker.request(`${PYODIDE_CDN}unlisted.js`));
    assert.equal(unlisted.status, 403);
  } finally { worker.restore(); }
});

test('a wheel of the sandbox is checked the same way, against the hash in the lock file', async () => {
  const worker = await load();
  try {
    const wheel = await (await worker.request(`${ORIGIN}${WHEEL_PATH}`));
    assert.equal(wheel.status, 200);
    assert.equal(await wheel.text(), 'wheel bytes');
  } finally { worker.restore(); }
});

test('the sandbox\'s own code comes from the network first, is cached for when the network is gone, and fails when it was never fetched', async () => {
  const online = makeNetwork();
  const caches = makeCaches();
  const worker = await load({ network: online, caches });
  try {
    assert.equal(await (await worker.request(`${ORIGIN}/sandbox/host.js`)).text(), 'host code');
  } finally { worker.restore(); }

  const offline = await load({ network: makeNetwork({ down: true }), caches });
  try {
    assert.equal(await (await offline.request(`${ORIGIN}/sandbox/host.js`)).text(), 'host code', 'served from the cache');
    await assert.rejects(Promise.resolve(offline.request(`${ORIGIN}/sandbox/never-seen.js`)).then((promise) => promise), /offline/);
  } finally { offline.restore(); }
});
