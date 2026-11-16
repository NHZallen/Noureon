import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import test from 'node:test';

import { createVerifier } from '../../browser-host/auth.mjs';
import { createServer } from '../../browser-host/server.mjs';
import { HostError } from '../../browser-host/session-manager.mjs';
import { BrowserHostError, createBrowserHostClient, signedHeaders } from '../../server/browser-host-client.js';

const SECRET = randomBytes(24).toString('hex');

// The real browser-host HTTP layer (its own signature check), with a manager that records what it is asked.
async function startHost(overrides = {}) {
  const calls = [];
  const manager = {
    summary: () => ({ running: 0, queued: 0, max: 2 }),
    create: (spec) => { calls.push(['create', spec]); return { state: spec.hasProfile ? 'awaiting_profile' : 'starting' }; },
    putProfile: (id, body) => { calls.push(['putProfile', id, body.length]); return { state: 'starting' }; },
    get: (id) => ({ id, state: 'ready' }),
    action: async (id, action) => { calls.push(['action', id, action]); return { ok: true, title: 'x' }; },
    save: async () => Buffer.from('archive-bytes'),
    collectProfile: async () => { throw new HostError(404, 'not_found', 'gone'); },
    stop: async (id, options) => { calls.push(['stop', id, options]); return { profile: options.save ? Buffer.from('final') : null }; },
    ...overrides
  };
  const server = createServer({ manager, verifier: createVerifier({ secrets: [SECRET], allowAnyIp: true }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { calls, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('requests signed here are accepted by browser-host, and carry what the contract says', async () => {
  const host = await startHost();
  try {
    const client = createBrowserHostClient({ url: host.url, secret: SECRET });
    assert.equal((await client.health()).ok, true);
    assert.equal((await client.create({ sessionId: 'session-aaaaaaaa', userId: 'u1', screen: { w: 1024, h: 768 }, hasProfile: true })).state, 'awaiting_profile');
    await client.putProfile('session-aaaaaaaa', Buffer.from('tar-gz-bytes'));
    assert.equal((await client.get('session-aaaaaaaa')).state, 'ready');
    assert.equal((await client.action('session-aaaaaaaa', { type: 'navigate', url: 'https://example.com/' })).ok, true);
    assert.equal((await client.save('session-aaaaaaaa')).toString(), 'archive-bytes');
    assert.equal((await client.stop('session-aaaaaaaa', { save: true })).toString(), 'final');
    assert.equal(await client.stop('session-aaaaaaaa'), null);
    assert.deepEqual(host.calls.find((call) => call[0] === 'putProfile'), ['putProfile', 'session-aaaaaaaa', 12]);
    assert.deepEqual(host.calls.filter((call) => call[0] === 'stop').map((call) => call[2].save), [true, false]);
  } finally { await host.close(); }
});

test('a wrong secret is refused (401); a host that is gone, or slow, is reported as such; errors never carry the secret', async () => {
  const host = await startHost();
  try {
    const wrong = createBrowserHostClient({ url: host.url, secret: randomBytes(24).toString('hex') });
    await assert.rejects(wrong.health(), (error) => error instanceof BrowserHostError && error.status === 401 && error.code === 'unauthorized' && !String(error.message).includes(SECRET));
    await assert.rejects(createBrowserHostClient({ url: host.url, secret: SECRET }).collect('session-aaaaaaaa'), (error) => error.status === 404);
  } finally { await host.close(); }
  const gone = createBrowserHostClient({ url: 'http://127.0.0.1:1', secret: SECRET });
  await assert.rejects(gone.health(), (error) => error.code === 'unreachable');
  const slow = http.createServer(() => {});
  await new Promise((resolve) => slow.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(createBrowserHostClient({ url: `http://127.0.0.1:${slow.address().port}`, secret: SECRET, timeoutMs: 100 }).get('session-aaaaaaaa'), (error) => error.code === 'timeout');
  } finally { slow.closeAllConnections(); await new Promise((resolve) => slow.close(resolve)); }
});

test('what is not a valid name or secret never leaves this process', async () => {
  const client = createBrowserHostClient({ url: 'http://127.0.0.1:1', secret: SECRET });
  for (const id of ['../x', 'short', 'a/b/c/d/e/f/g', '-leading-dash-aaa']) await assert.rejects(client.get(id), (error) => error.code === 'bad_session_id');
  assert.throws(() => createBrowserHostClient({ url: 'http://x', secret: 'too-short' }), /at least 32/);
  assert.throws(() => createBrowserHostClient({ url: 'ftp://x', secret: SECRET }), /address/);
  assert.throws(() => signedHeaders({ secret: 'short', method: 'GET', pathWithQuery: '/' }), /at least 32/);
});
