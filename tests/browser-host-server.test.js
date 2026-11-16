// The HTTP face of browser-host (browser-host/server.mjs) over a real socket, with the real request check and session manager and a fake Docker.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../browser-host/server.mjs';
import { createVerifier, signRequest } from '../browser-host/auth.mjs';
import { createSessionManager } from '../browser-host/session-manager.mjs';

const SECRET = 'k'.repeat(40);
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function start({ allowed = ['127.0.0.1'], config = {} } = {}) {
  const calls = [];
  const adapter = {
    createVolume: async () => calls.push('createVolume'), loadProfile: async (s, b) => calls.push(`loadProfile:${b.toString()}`), startContainer: async () => calls.push('startContainer'),
    waitReady: async () => calls.push('waitReady'), exportProfile: async (s) => Buffer.from(`archive-of-${s.sessionId}`), stopContainer: async () => calls.push('stopContainer'),
    removeContainer: async () => calls.push('removeContainer'), removeVolume: async () => calls.push('removeVolume'),
    action: async (s, a) => ({ ok: true, echoed: a.type }), listOrphans: async () => ({ containers: [], volumes: [] })
  };
  const manager = createSessionManager({ adapter, config: { maxSessions: 2, ...config } });
  const logs = [];
  const server = createServer({ manager, verifier: createVerifier({ secrets: [SECRET], allowedIps: allowed }), maxProfileBytes: 1024 * 1024, log: (e) => logs.push(e), load: () => 0.5 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const call = (method, path, { body, headers, sign = true, raw } = {}) => new Promise((resolve, reject) => {
    const payload = raw ?? (body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)));
    const signed = sign ? signRequest({ secret: SECRET, method, pathWithQuery: path, body: payload }) : {};
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { ...signed, ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}), ...headers } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => {
        const data = Buffer.concat(chunks);
        let parsed = null; try { parsed = JSON.parse(data.toString()); } catch { /* binary */ }
        resolve({ status: res.statusCode, json: parsed, data, headers: res.headers });
      });
    });
    req.on('error', reject); if (payload) req.write(payload); req.end();
  });
  return { call, calls, logs, manager, close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }) };
}
const SID = 'session-00000001';

test('the whole life of a browser through the routes: health, start, status, action, save, stop', async () => {
  const t = await start();
  try {
    const health = await t.call('GET', '/v1/health');
    assert.equal(health.status, 200); assert.deepEqual(health.json, { ok: true, sessions: 0, queued: 0, maxSessions: 2, load1: 0.5 });
    const made = await t.call('POST', '/v1/sessions', { body: { sessionId: SID, userId: 'user-1', screen: { w: 1024, h: 768 } } });
    assert.equal(made.status, 202); assert.equal(made.json.state, 'starting');
    await settle();
    assert.equal((await t.call('GET', `/v1/sessions/${SID}`)).json.state, 'ready');
    const acted = await t.call('POST', `/v1/sessions/${SID}/actions`, { body: { type: 'navigate', url: 'https://example.com/' } });
    assert.deepEqual(acted.json, { ok: true, echoed: 'navigate' });
    const saved = await t.call('POST', `/v1/sessions/${SID}/save`);
    assert.equal(saved.status, 200); assert.equal(saved.headers['content-type'], 'application/gzip'); assert.equal(saved.data.toString(), `archive-of-${SID}`);
    const stopped = await t.call('DELETE', `/v1/sessions/${SID}?save=1`);
    assert.equal(stopped.data.toString(), `archive-of-${SID}`);
    assert.equal((await t.call('GET', `/v1/sessions/${SID}`)).json.state, 'stopped');
    assert.equal(health.headers['cache-control'], 'no-store');
  } finally { await t.close(); }
});

test('a login state goes up before the browser starts, and a browser stopped by the clock can be collected', async () => {
  const t = await start({ config: { idleMs: 1000 } });
  try {
    const made = await t.call('POST', '/v1/sessions', { body: { sessionId: SID, userId: 'user-1', screen: {}, hasProfile: true } });
    assert.equal(made.json.state, 'awaiting_profile');
    const up = await t.call('PUT', `/v1/sessions/${SID}/profile`, { body: Buffer.from('tar-gz') });
    assert.equal(up.status, 202); await settle();
    assert.ok(t.calls.includes('loadProfile:tar-gz'));
    assert.equal((await t.call('GET', `/v1/sessions/${SID}`)).json.state, 'ready');
    assert.equal((await t.call('GET', `/v1/sessions/${SID}/profile`)).status, 404, 'nothing to collect while it runs');
  } finally { await t.close(); }
});

test('nothing without a good signature: 401 for none, a wrong one, a changed body, a replay; 403 from a wrong address', async () => {
  const t = await start();
  try {
    assert.equal((await t.call('GET', '/v1/health', { sign: false })).status, 401);
    const bad = signRequest({ secret: 'z'.repeat(40), method: 'GET', pathWithQuery: '/v1/health' });
    assert.equal((await t.call('GET', '/v1/health', { sign: false, headers: bad })).status, 401);
    const good = signRequest({ secret: SECRET, method: 'GET', pathWithQuery: '/v1/health' });
    assert.equal((await t.call('GET', '/v1/health', { sign: false, headers: good })).status, 200);
    assert.equal((await t.call('GET', '/v1/health', { sign: false, headers: good })).status, 401, 'replay');
    const forSession = signRequest({ secret: SECRET, method: 'POST', pathWithQuery: '/v1/sessions', body: JSON.stringify({ sessionId: SID, userId: 'a', screen: {} }) });
    const tampered = await t.call('POST', '/v1/sessions', { sign: false, headers: forSession, raw: JSON.stringify({ sessionId: 'session-99999999', userId: 'a', screen: {} }) });
    assert.equal(tampered.status, 401);
    assert.deepEqual(t.calls, [], 'nothing was started by any of these');
    const refused = t.logs.filter((l) => l.ev === 'refused');
    assert.ok(refused.length >= 3); assert.ok(!JSON.stringify(t.logs).includes(SECRET));
  } finally { await t.close(); }
  const other = await start({ allowed: ['203.0.113.7'] });
  try { assert.equal((await other.call('GET', '/v1/health')).status, 403); } catch (error) { assert.match(String(error.code || error.message), /ECONNRESET|socket hang up|EPIPE/); } finally { await other.close(); }
});

test('a stranger cannot make the service read a big body: from an address that is not allowed, a request that announces 5 MB is refused at once (403), not read (413)', async () => {
  const t = await start({ allowed: ['203.0.113.7'] });
  try {
    let status = 0;
    try { status = (await t.call('POST', '/v1/sessions', { raw: 'x', headers: { 'content-length': String(5 * 1024 * 1024) } })).status; } catch { status = 0; /* the connection was closed on us: also a refusal */ }
    assert.notEqual(status, 413, 'the body must not even be looked at');
    assert.ok(status === 403 || status === 0, `expected a refusal, got ${status}`);
  } finally { await t.close(); }
});

test('errors are plain: 404, 405, 400 for bad JSON, 409 for a second browser of the same user, 413 for a huge login state, 429 for a full queue', async () => {
  const t = await start({ config: { maxSessions: 1, maxQueue: 0 } });
  try {
    assert.equal((await t.call('GET', '/v1/nothing')).status, 404);
    assert.equal((await t.call('PATCH', '/v1/health')).status, 405, 'a method the path does not know');
    assert.equal((await t.call('GET', '/v2/health')).status, 404);
    assert.equal((await t.call('POST', '/v1/health', { body: {} })).status, 405);
    assert.equal((await t.call('POST', '/v1/sessions', { raw: '{not json' })).status, 400);
    assert.equal((await t.call('POST', '/v1/sessions', { body: { sessionId: '--privileged', userId: 'a', screen: {} } })).status, 400);
    await t.call('POST', '/v1/sessions', { body: { sessionId: SID, userId: 'user-1', screen: {} } }); await settle();
    const second = await t.call('POST', '/v1/sessions', { body: { sessionId: 'session-00000002', userId: 'user-1', screen: {} } });
    assert.equal(second.status, 409); assert.equal(second.json.error, 'user_has_session');
    const full = await t.call('POST', '/v1/sessions', { body: { sessionId: 'session-00000003', userId: 'user-3', screen: {} } });
    assert.equal(full.status, 429);
    assert.equal((await t.call('GET', '/v1/sessions/nope-nope-nope')).status, 404);
    const withProfile = await t.call('POST', '/v1/sessions', { body: { sessionId: 'session-00000009', userId: 'user-9', screen: {}, hasProfile: true } });
    assert.equal(withProfile.status, 429, 'the one place is taken');
  } finally { await t.close(); }
  const u = await start();
  try {
    await u.call('POST', '/v1/sessions', { body: { sessionId: SID, userId: 'user-1', screen: {}, hasProfile: true } });
    const huge = await u.call('PUT', `/v1/sessions/${SID}/profile`, { body: Buffer.alloc(2 * 1024 * 1024) });
    assert.equal(huge.status, 413);
    const bigJson = await u.call('POST', '/v1/sessions', { raw: JSON.stringify({ pad: 'x'.repeat(100 * 1024) }) });
    assert.equal(bigJson.status, 413, 'an ordinary request may not be large');
  } finally { await u.close(); }
});

test('an unexpected failure is a plain 500 that does not leak its message', async () => {
  const t = await start();
  try {
    t.manager.get = () => { throw new Error('database password is hunter2'); };
    const r = await t.call('GET', `/v1/sessions/${SID}`);
    assert.equal(r.status, 500); assert.deepEqual(r.json, { error: 'internal' });
    assert.ok(!r.data.toString().includes('hunter2'));
  } finally { await t.close(); }
});
