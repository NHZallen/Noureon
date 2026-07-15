import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const serviceWorkerUrl = new URL('../public/service-worker.js', import.meta.url);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createResponse(label, { ok = true, contentType = 'text/html', jsonValue = {} } = {}) {
  return {
    label,
    ok,
    headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
    clone() { return createResponse(`${label}:clone`, { ok, contentType, jsonValue }); },
    async json() { return jsonValue; }
  };
}

async function createHarness({
  fetchImpl,
  cacheMatches = new Map(),
  cacheNames = [],
  currentCacheMatches = new Map([['/__noureon-shell-ready-v21__', createResponse('precache-shell')]])
} = {}) {
  const source = await readFile(serviceWorkerUrl, 'utf8');
  const handlers = new Map();
  const timers = [];
  const cachePuts = [];
  const cacheAddAll = [];
  const cacheDeletes = [];
  const clientMessages = [];
  const fetchCalls = [];
  const cache = {
    addAll: async paths => { cacheAddAll.push([...paths]); },
    match: async key => currentCacheMatches.get(key),
    put: async (key, response) => { cachePuts.push([key, response]); }
  };
  const caches = {
    open: async () => cache,
    match: async key => cacheMatches.get(typeof key === 'string' ? key : key.url),
    keys: async () => [...cacheNames],
    delete: async name => { cacheDeletes.push(name); return true; }
  };
  const self = {
    location: { origin: 'https://noureon.test' },
    addEventListener(type, handler) { handlers.set(type, handler); },
    skipWaiting() { this.skipWaitingCalls = (this.skipWaitingCalls || 0) + 1; },
    clients: {
      claim: async () => {},
      matchAll: async () => [{ postMessage: message => clientMessages.push(message) }]
    }
  };
  const context = vm.createContext({
    URL,
    Symbol,
    Promise,
    console: { warn() {} },
    self,
    caches,
    fetch: request => {
      fetchCalls.push(request);
      return fetchImpl ? fetchImpl(request) : Promise.resolve(createResponse('network'));
    },
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    }
  });
  vm.runInContext(source, context, { filename: serviceWorkerUrl.pathname });
  return { handlers, timers, cachePuts, cacheAddAll, cacheDeletes, clientMessages, fetchCalls, self };
}

function createFetchEvent(url, {
  method = 'GET',
  mode = 'cors',
  headers = []
} = {}) {
  const pendingTasks = [];
  const request = {
    url,
    method,
    mode,
    headers: { has: name => headers.some(header => header.toLowerCase() === name.toLowerCase()) }
  };
  return {
    request,
    pendingTasks,
    response: null,
    respondWith(value) { this.response = Promise.resolve(value); },
    waitUntil(value) { pendingTasks.push(Promise.resolve(value)); }
  };
}

test('navigation timeout returns the cached shell while the successful network HTML revalidates it', async () => {
  const network = deferred();
  const cachedShell = createResponse('cached-shell');
  const harness = await createHarness({
    fetchImpl: () => network.promise,
    cacheMatches: new Map([['/', cachedShell]])
  });
  const event = createFetchEvent('https://noureon.test/chat', { mode: 'navigate' });

  harness.handlers.get('fetch')(event);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 2500);

  harness.timers[0].callback();
  assert.equal(await event.response, cachedShell);

  network.resolve(createResponse('fresh-html'));
  await Promise.all(event.pendingTasks);
  assert.equal(harness.cachePuts.length, 1);
  assert.equal(harness.cachePuts[0][0], '/');
  assert.equal(harness.cachePuts[0][1].label, 'fresh-html:clone');
});

test('fast navigation returns the network response and refreshes the cached shell', async () => {
  const fresh = createResponse('fresh-html');
  const harness = await createHarness({ fetchImpl: async () => fresh });
  const event = createFetchEvent('https://noureon.test/', { mode: 'navigate' });

  harness.handlers.get('fetch')(event);

  assert.equal(await event.response, fresh);
  await Promise.all(event.pendingTasks);
  assert.equal(harness.timers[0].cleared, true);
  assert.equal(harness.cachePuts[0][0], '/');
});

test('a fast server error falls back to the cached application shell', async () => {
  const cachedShell = createResponse('cached-shell');
  const harness = await createHarness({
    fetchImpl: async () => createResponse('server-error', { ok: false }),
    cacheMatches: new Map([['/', cachedShell]])
  });
  const event = createFetchEvent('https://noureon.test/', { mode: 'navigate' });

  harness.handlers.get('fetch')(event);

  assert.equal(await event.response, cachedShell);
});

test('API, authenticated, and Supabase requests bypass the service worker cache', async () => {
  const harness = await createHarness();
  const events = [
    createFetchEvent('https://noureon.test/api/tavily-search'),
    createFetchEvent('https://noureon.test/assets/private-data.json', { headers: ['Authorization'] }),
    createFetchEvent('https://project.supabase.co/rest/v1/workspace_messages'),
    createFetchEvent('https://noureon.test/auth/v1/token')
  ];

  for (const event of events) {
    harness.handlers.get('fetch')(event);
    assert.equal(event.response, null);
  }
  assert.equal(harness.fetchCalls.length, 0);
});

test('hashed same-origin assets remain cache-first', async () => {
  const requestUrl = 'https://noureon.test/assets/index-Ab12_cd3.js';
  const cachedAsset = createResponse('cached-asset', { contentType: 'text/javascript' });
  const harness = await createHarness({ cacheMatches: new Map([[requestUrl, cachedAsset]]) });
  const event = createFetchEvent(requestUrl);

  harness.handlers.get('fetch')(event);

  assert.equal(await event.response, cachedAsset);
  assert.equal(harness.fetchCalls.length, 0);
});

test('the non-hashed mhchem startup dependency remains explicitly cache-first', async () => {
  const requestUrl = 'https://noureon.test/vendor/mhchem.min.js';
  const cachedAsset = createResponse('cached-mhchem', { contentType: 'text/javascript' });
  const harness = await createHarness({ cacheMatches: new Map([[requestUrl, cachedAsset]]) });
  const event = createFetchEvent(requestUrl);

  harness.handlers.get('fetch')(event);

  assert.equal(await event.response, cachedAsset);
  assert.equal(harness.fetchCalls.length, 0);
});

test('a missing hashed asset is fetched once and stored in the current version cache', async () => {
  const requestUrl = 'https://noureon.test/assets/index-Ab12_cd3.js';
  const fetchedAsset = createResponse('fetched-asset', { contentType: 'text/javascript' });
  const harness = await createHarness({ fetchImpl: async () => fetchedAsset });
  const event = createFetchEvent(requestUrl);

  harness.handlers.get('fetch')(event);

  assert.equal(await event.response, fetchedAsset);
  await Promise.all(event.pendingTasks);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.cachePuts.length, 1);
  assert.equal(harness.cachePuts[0][0], event.request);
  assert.equal(harness.cachePuts[0][1].label, 'fetched-asset:clone');
});

test('activation removes only stale Noureon caches and notifies open clients', async () => {
  const harness = await createHarness({
    cacheNames: ['noureon-cache-v19', 'noureon-cache-v20', 'noureon-cache-v21', 'another-app-cache']
  });
  const completion = [];

  harness.handlers.get('activate')({ waitUntil: value => completion.push(Promise.resolve(value)) });
  await Promise.all(completion);

  assert.deepEqual(harness.cacheDeletes, ['noureon-cache-v19']);
  assert.equal(harness.clientMessages.length, 1);
  assert.equal(harness.clientMessages[0].type, 'NEW_VERSION_ACTIVATED');
});

test('activation retains the previous Noureon cache when the new shell was not precached', async () => {
  const harness = await createHarness({
    cacheNames: ['noureon-cache-v20', 'noureon-cache-v21'],
    currentCacheMatches: new Map()
  });
  const completion = [];

  harness.handlers.get('activate')({ waitUntil: value => completion.push(Promise.resolve(value)) });
  await Promise.all(completion);

  assert.deepEqual(harness.cacheDeletes, []);
  assert.deepEqual(harness.clientMessages, []);
});

test('install precaches every manifest code asset before activating the new worker', async () => {
  const manifest = {
    'index.html': {
      file: 'assets/index-Ab12_cd3.js',
      css: ['assets/index-Zx98_yw7.css'],
      assets: ['assets/ui-font-Aa12_bb3.woff2'],
      dynamicImports: ['src/cloud.js']
    },
    'src/cloud.js': { file: 'assets/cloud-Qw12_er3.js' }
  };
  const harness = await createHarness({
    fetchImpl: async request => String(request).includes('/build-manifest.json')
      ? createResponse('manifest', { contentType: 'application/json', jsonValue: manifest })
      : createResponse('shell')
  });
  const completion = [];

  harness.handlers.get('install')({ waitUntil: value => completion.push(Promise.resolve(value)) });
  await Promise.all(completion);

  assert.equal(harness.self.skipWaitingCalls, 1);
  assert.ok(harness.cacheAddAll[0].includes('/assets/index-Ab12_cd3.js'));
  assert.ok(harness.cacheAddAll[0].includes('/assets/index-Zx98_yw7.css'));
  assert.ok(harness.cacheAddAll[0].includes('/assets/cloud-Qw12_er3.js'));
  assert.equal(harness.cacheAddAll[0].includes('/assets/ui-font-Aa12_bb3.woff2'), false);
  assert.ok(harness.cachePuts.some(([key]) => key === '/__noureon-shell-ready-v21__'));
});
