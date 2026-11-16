// The live screen routes of the main server (server/browser-live-routes.js): only the owner, only who may use the browser agent, nothing of the host leaks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserLiveRoutes } from '../server/browser-live-routes.js';
import { BrowserSessionError } from '../server/browser-sessions.js';
import { BrowserHostError, createBrowserHostClient } from '../server/browser-host-client.js';

const SID = 'b0123456789abcdef';
function setup({ allowed = true, sessions = {} } = {}) {
  const calls = [];
  const browser = {
    mayUse: async (id) => allowed && id === 'user-1',
    sessions: {
      viewer: async (...a) => { calls.push(['viewer', ...a]); return sessions.viewer ? sessions.viewer() : { viewerId: 'v-1', token: 'tok', host: 'live.example.com', wsPath: '/s/x/api/ws' }; },
      closeViewer: async (...a) => { calls.push(['closeViewer', ...a]); },
      control: async (...a) => { calls.push(['control', ...a]); return { control: a[2].mode }; },
      screen: async (...a) => { calls.push(['screen', ...a]); return { ratio: a[2], width: 1280, height: 720 }; }
    }
  };
  const handle = createBrowserLiveRoutes({ browser });
  const run = async (method, path, body, { user = { id: 'user-1' } } = {}) => {
    const out = { sent: null, failed: null };
    const ctx = {
      url: new URL(path, 'http://local'), authenticate: async () => user, readJson: async () => body ?? {},
      send: (status, payload) => { out.sent = { status, payload }; }, fail: (code, message, extra) => { const e = new Error(message); e.code = code; e.extra = extra; throw e; }
    };
    try { out.handled = await handle({ method }, ctx); } catch (error) { out.failed = error; }
    return out;
  };
  return { run, calls, browser };
}

test('the owner gets a viewer, control, a screen size, and can close the viewer', async () => {
  const t = setup();
  const v = await t.run('POST', `/v1/browser/${SID}/viewer`);
  assert.equal(v.sent.status, 200); assert.equal(v.sent.payload.viewerId, 'v-1');
  assert.deepEqual(t.calls[0], ['viewer', SID, 'user-1']);
  assert.equal((await t.run('POST', `/v1/browser/${SID}/control`, { mode: 'user', viewerId: 'v-1' })).sent.payload.control, 'user');
  assert.equal((await t.run('POST', `/v1/browser/${SID}/control`, { mode: 'model' })).sent.payload.control, 'model');
  assert.equal((await t.run('POST', `/v1/browser/${SID}/screen`, { ratio: '16:9' })).sent.payload.width, 1280);
  assert.equal((await t.run('DELETE', `/v1/browser/${SID}/viewer/v-1`)).sent.payload.ok, true);
});

test('bad input is refused before the host hears of it', async () => {
  const t = setup();
  assert.equal((await t.run('POST', `/v1/browser/${SID}/control`, { mode: 'god' })).failed.code, 'bad_request');
  assert.equal((await t.run('POST', `/v1/browser/${SID}/control`, { mode: 'user' })).failed.code, 'bad_request');
  assert.equal((await t.run('POST', `/v1/browser/${SID}/screen`, { ratio: '99:1' })).failed.code, 'bad_request');
  assert.equal(t.calls.length, 0);
});

test('a person who may not use the browser agent, and a browser of someone else, look the same: not found', async () => {
  const closed = setup({ allowed: false });
  assert.equal((await closed.run('POST', `/v1/browser/${SID}/viewer`)).failed.code, 'not_found');
  const other = setup({ sessions: { viewer: () => { throw new BrowserSessionError('There is no such browser.', 'not_found'); } } });
  assert.equal((await other.run('POST', `/v1/browser/${SID}/viewer`)).failed.code, 'not_found');
});

test('what the host says becomes a plain error without the host\'s words', async () => {
  const notReady = setup({ sessions: { viewer: () => { throw new BrowserHostError('the live screen is not ready', { status: 409, code: 'not_live' }); } } });
  const a = await notReady.run('POST', `/v1/browser/${SID}/viewer`);
  assert.equal(a.failed.code, 'wrong_phase'); assert.equal(a.failed.message, 'The live screen is not ready.');
  const many = setup({ sessions: { viewer: () => { throw new BrowserHostError('x', { status: 429, code: 'too_many_viewers' }); } } });
  assert.equal((await many.run('POST', `/v1/browser/${SID}/viewer`)).failed.code, 'rate_limited');
  const down = setup({ sessions: { viewer: () => { throw new BrowserHostError('x', { code: 'unreachable' }); } } });
  assert.equal((await down.run('POST', `/v1/browser/${SID}/viewer`)).failed.code, 'runs_unavailable');
});

test('other paths are not ours, and with no browser service nothing is', async () => {
  const t = setup();
  assert.equal((await t.run('GET', '/v1/browser/x')).handled, false);
  assert.equal((await t.run('POST', `/v1/browser/${SID}/other`)).handled, false);
  const off = createBrowserLiveRoutes({ browser: null });
  assert.equal(await off({ method: 'POST' }, { url: new URL(`/v1/browser/${SID}/viewer`, 'http://l') }), false);
});

test('the host client signs the live calls and refuses a bad viewer id', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push([init.method, url, init.body ? JSON.parse(init.body) : null]); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const client = createBrowserHostClient({ url: 'http://172.29.0.1:40010', secret: 's'.repeat(40), fetchImpl });
  await client.createViewer(SID); await client.control(SID, { mode: 'user', viewerId: 'v-1' }); await client.setScreen(SID, 'portrait'); await client.closeViewer(SID, 'v-1');
  assert.deepEqual(seen.map((s) => `${s[0]} ${s[1].replace('http://172.29.0.1:40010', '')}`), [`POST /v1/sessions/${SID}/viewers`, `POST /v1/sessions/${SID}/control`, `POST /v1/sessions/${SID}/screen`, `DELETE /v1/sessions/${SID}/viewers/v-1`]);
  assert.deepEqual(seen[1][2], { mode: 'user', viewerId: 'v-1' });
  await assert.rejects(() => client.closeViewer(SID, '../x'), (e) => e.code === 'bad_viewer_id');
});
