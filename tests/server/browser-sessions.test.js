import assert from 'node:assert/strict';
import test from 'node:test';

import { BrowserHostError } from '../../server/browser-host-client.js';
import { BrowserSessionError, createBrowserSessions } from '../../server/browser-sessions.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function world({ stored = null } = {}) {
  const clock = { t: 1_000_000 };
  const calls = [];
  const states = new Map();
  const saved = [];
  const host = {
    create: async (spec) => { calls.push(['create', spec]); states.set(spec.sessionId, spec.hasProfile ? 'awaiting_profile' : 'starting'); return { state: states.get(spec.sessionId) }; },
    putProfile: async (id, archive) => { calls.push(['putProfile', id, archive.toString()]); states.set(id, 'starting'); },
    get: async (id) => { if (!states.has(id)) throw new BrowserHostError('gone', { status: 404, code: 'not_found' }); return { state: states.get(id) }; },
    action: async (id, action) => { calls.push(['action', id, action]); return { ok: true }; },
    save: async (id) => { calls.push(['save', id]); return Buffer.from(`archive@${clock.t}`); },
    collect: async (id) => { calls.push(['collect', id]); return Buffer.from('collected'); },
    stop: async (id, options = {}) => { calls.push(['stop', id, Boolean(options.save)]); states.set(id, 'stopped'); return options.save ? Buffer.from('final') : null; }
  };
  const profiles = {
    load: async () => stored,
    save: async (userId, archive) => { saved.push([userId, archive.toString()]); },
    sweepExpired: async () => { calls.push(['sweep']); return 0; }
  };
  let n = 0;
  const sessions = createBrowserSessions({ host, profiles, now: () => clock.t, sleep: async () => { clock.t += 1500; }, makeId: () => `browser${String(++n).padStart(8, '0')}`, saveEveryMs: 300_000, sweepEveryMs: 3_600_000 });
  return { sessions, clock, calls, states, saved, host, profiles };
}

test('a browser starts empty without a stored login state, and with one it is handed over before the browser starts', async () => {
  const w = world();
  const first = await w.sessions.open(A, {});
  assert.equal(first.sessionId, 'browser00000001');
  assert.deepEqual(w.calls[0], ['create', { sessionId: 'browser00000001', userId: A, screen: { w: 1024, h: 768 }, hasProfile: false }]);
  assert.ok(!w.calls.some((call) => call[0] === 'putProfile'));
  const w2 = world({ stored: { archive: Buffer.from('plain-tar-gz'), pendingClear: [] } });
  await w2.sessions.open(B, {});
  assert.deepEqual(w2.calls.map((call) => call[0]), ['create', 'putProfile']);
  assert.equal(w2.calls[0][1].hasProfile, true);
  assert.equal(w2.calls[1][2], 'plain-tar-gz');
});

test('a person has one browser; keepLogin false neither loads nor keeps anything', async () => {
  const w = world({ stored: { archive: Buffer.from('x'), pendingClear: [] } });
  const first = await w.sessions.open(A, { keepLogin: false });
  assert.equal(w.calls[0][1].hasProfile, false);
  const again = await w.sessions.open(A, {});
  assert.equal(again.sessionId, first.sessionId);
  assert.equal(again.reused, true);
  assert.equal(w.calls.filter((call) => call[0] === 'create').length, 1);
  assert.equal(await w.sessions.close(first.sessionId, A), false);
  assert.deepEqual(w.calls.at(-1), ['stop', first.sessionId, false]);
  assert.equal(w.saved.length, 0);
});

test('closing stops the browser and then keeps what the host packed; another person cannot use or close it', async () => {
  const w = world();
  const { sessionId } = await w.sessions.open(A, {});
  await assert.rejects(w.sessions.action(sessionId, B, { type: 'text' }), (error) => error instanceof BrowserSessionError && error.code === 'not_found');
  await assert.rejects(w.sessions.close(sessionId, B), (error) => error.code === 'not_found');
  assert.equal((await w.sessions.action(sessionId, A, { type: 'text' })).ok, true);
  assert.equal(await w.sessions.close(sessionId, A), true);
  assert.deepEqual(w.saved, [[A, 'final']]);
  assert.equal(w.sessions.has(A), false);
  assert.equal(w.sessions.count(), 0);
});

test('a failed start is cleaned up: the order is withdrawn and the person can try again', async () => {
  const w = world({ stored: { archive: Buffer.from('x'), pendingClear: [] } });
  w.host.putProfile = async () => { throw new BrowserHostError('too large', { status: 413, code: 'too_large' }); };
  await assert.rejects(w.sessions.open(A, {}), (error) => error.code === 'too_large');
  assert.deepEqual(w.calls.at(-1)[0], 'stop');
  assert.equal(w.sessions.has(A), false);
  w.host.create = async () => { throw new BrowserHostError('busy', { status: 429, code: 'busy' }); };
  await assert.rejects(w.sessions.open(A, {}), (error) => error.code === 'busy');
  assert.equal(w.sessions.count(), 0);
});

test('a stored login state that cannot be opened does not stop the browser from starting', async () => {
  const w = world();
  w.profiles.load = async () => { throw Object.assign(new Error('cannot'), { code: 'unreadable' }); };
  const { sessionId } = await w.sessions.open(A, {});
  assert.ok(sessionId);
  assert.equal(w.calls[0][1].hasProfile, false);
});

test('waitReady polls until ready; a browser that failed, or never gets ready, is an error', async () => {
  const w = world();
  const { sessionId } = await w.sessions.open(A, {});
  let polls = 0;
  w.host.get = async () => ({ state: (polls += 1) < 3 ? 'queued' : 'ready' });
  assert.equal((await w.sessions.waitReady(sessionId, A)).state, 'ready');
  assert.equal(polls, 3);
  const w2 = world();
  const second = await w2.sessions.open(A, {});
  await assert.rejects(w2.sessions.waitReady(second.sessionId, A, { timeoutMs: 5000 }), (error) => error.code === 'timeout');
  const w3 = world();
  const third = await w3.sessions.open(A, {});
  w3.states.set(third.sessionId, 'failed');
  await assert.rejects(w3.sessions.waitReady(third.sessionId, A), (error) => error.code === 'failed');
  assert.equal(w3.sessions.has(A), false);
});

test('a browser started early and never used is let go without keeping anything; one that had sites logged out in it is closed the ordinary way', async () => {
  const w = world();
  const first = await w.sessions.open(A, {});
  w.states.set(first.sessionId, 'ready');
  await w.sessions.waitReady(first.sessionId, A);
  assert.equal(await w.sessions.discard(first.sessionId, A), false);
  assert.deepEqual(w.calls.filter((call) => call[0] === 'stop'), [['stop', first.sessionId, false]], 'stopped, nothing packed');
  assert.equal(w.sessions.has(A), false, 'forgotten');
  assert.equal(w.saved.length, 0);
  const cleared = world({ stored: { archive: Buffer.from('x'), pendingClear: ['shop.example'] } });
  cleared.profiles.clearPending = async () => {};
  const second = await cleared.sessions.open(A, {});
  cleared.states.set(second.sessionId, 'ready');
  await cleared.sessions.waitReady(second.sessionId, A);
  await cleared.sessions.discard(second.sessionId, A);
  assert.deepEqual(cleared.calls.filter((call) => call[0] === 'stop'), [['stop', second.sessionId, true]], 'the logout is kept: closed with a save');
});

test('the upkeep keeps the login state every five minutes while the browser is ready, and not before', async () => {
  const w = world();
  const { sessionId } = await w.sessions.open(A, {});
  w.states.set(sessionId, 'ready');
  await w.sessions.tick();
  assert.equal(w.saved.length, 0);
  w.clock.t += 301_000;
  await w.sessions.tick();
  assert.equal(w.saved.length, 1);
  await w.sessions.tick();
  assert.equal(w.saved.length, 1, 'not again right away');
  w.host.save = async () => { throw new BrowserHostError('x', { status: 500, code: 'failed' }); };
  w.clock.t += 301_000;
  await w.sessions.tick();
  assert.equal(w.saved.length, 1, 'a failed save keeps the older state and does not stop the browser');
  assert.equal(w.sessions.has(A), true);
});

test('a browser the host stopped by itself has its login state collected, and is forgotten; one the host does not know is forgotten', async () => {
  const w = world();
  const { sessionId } = await w.sessions.open(A, {});
  w.states.set(sessionId, 'stopped');
  await w.sessions.tick();
  assert.deepEqual(w.saved, [[A, 'collected']]);
  assert.equal(w.sessions.has(A), false);
  const w2 = world();
  const lost = await w2.sessions.open(B, {});
  w2.states.delete(lost.sessionId);
  await w2.sessions.tick();
  assert.equal(w2.sessions.has(B), false);
  assert.equal(w2.saved.length, 0);
});

test('expired login states are swept about once an hour', async () => {
  const w = world();
  await w.sessions.tick();
  assert.equal(w.calls.filter((call) => call[0] === 'sweep').length, 0);
  w.clock.t += 3_600_001;
  await w.sessions.tick();
  await w.sessions.tick();
  assert.equal(w.calls.filter((call) => call[0] === 'sweep').length, 1);
});

test('a browser closed without a login state coming back is told in the log, and nothing is kept', async () => {
  const w = world();
  const lines = [];
  w.host.stop = async () => null;
  const sessions = createBrowserSessions({ host: w.host, profiles: w.profiles, log: (event) => lines.push(event), now: () => w.clock.t, sleep: async () => {}, makeId: () => 'browser00000009' });
  const { sessionId } = await sessions.open(A, {});
  assert.equal(await sessions.close(sessionId, A), false);
  assert.deepEqual(lines, ['browser_close_no_login_state']);
  assert.equal(w.saved.length, 0);
});

test('the live screen calls reach the host only for the owner of the browser', async () => {
  const w = world();
  const seen = [];
  w.host.createViewer = async (id) => { seen.push(['viewer', id]); return { viewerId: 'v-1' }; };
  w.host.closeViewer = async (id, viewer) => { seen.push(['close', id, viewer]); return { ok: true }; };
  w.host.control = async (id, request) => { seen.push(['control', id, request]); return { control: request.mode }; };
  w.host.setScreen = async (id, ratio) => { seen.push(['screen', id, ratio]); return { ratio }; };
  const { sessionId } = await w.sessions.open(A, {});
  assert.equal((await w.sessions.viewer(sessionId, A)).viewerId, 'v-1');
  await w.sessions.closeViewer(sessionId, A, 'v-1');
  await w.sessions.control(sessionId, A, { mode: 'user', viewerId: 'v-1' });
  await w.sessions.screen(sessionId, A, '16:9');
  assert.deepEqual(seen.map((s) => s[0]), ['viewer', 'close', 'control', 'screen']);
  seen.length = 0;
  for (const call of [() => w.sessions.viewer(sessionId, B), () => w.sessions.closeViewer(sessionId, B, 'v-1'), () => w.sessions.control(sessionId, B, { mode: 'model' }), () => w.sessions.screen(sessionId, B, '4:3')]) {
    await assert.rejects(call, (error) => error instanceof BrowserSessionError && error.code === 'not_found');
  }
  assert.deepEqual(seen, []);
});

test('a browser the host closed by itself (idle, time of the task) is remembered as such for a day; opening a new one forgets it', async () => {
  const w = world();
  await w.sessions.open(A, {});
  assert.equal(w.sessions.closedReason(A), '');
  w.host.get = async () => ({ state: 'stopped', stoppedReason: 'idle' });
  await w.sessions.tick();
  assert.equal(w.sessions.current(A), null);
  assert.equal(w.sessions.closedReason(A), 'idle');
  assert.equal(w.sessions.closedReason(B), '');
  w.clock.t += 25 * 3_600_000;
  assert.equal(w.sessions.closedReason(A), '', 'after a day it is not said any more');
  w.host.get = async () => ({ state: 'stopped', stoppedReason: 'task_max' });
  const again = world();
  await again.sessions.open(A, {});
  again.host.get = async () => ({ state: 'stopped', stoppedReason: 'task_max' });
  await again.sessions.tick();
  assert.equal(again.sessions.closedReason(A), 'task_max');
  again.host.get = async () => ({ state: 'ready' });
  await again.sessions.open(A, {});
  assert.equal(again.sessions.closedReason(A), '', 'a new browser forgets why the last one closed');
});

test('the status of a person\'s browser: not open, open with the time left, or closed by the host and why', async () => {
  const w = world();
  assert.deepEqual(await w.sessions.status(A), { open: false });
  await w.sessions.open(A, { conversationId: 'c1' });
  w.host.get = async () => ({ state: 'ready', idleMsLeft: 1_200_000.4, taskMsLeft: 7_000_000 });
  assert.deepEqual(await w.sessions.status(A), { open: true, conversationId: 'c1', state: 'ready', idleMsLeft: 1_200_000, taskMsLeft: 7_000_000 });
  assert.deepEqual(await w.sessions.status(B), { open: false }, 'not another person\'s');
  w.host.get = async () => ({ state: 'stopped', stoppedReason: 'idle' });
  await w.sessions.tick();
  assert.deepEqual(await w.sessions.status(A), { open: false, closedReason: 'idle' });
});

test('the person takes the browser over from the screen: it is held until they give it back or the viewer that held it leaves; only the owner is told', async () => {
  const w = world();
  w.host.control = async (id, request) => { w.calls.push(['control', id, request.mode]); return { control: request.mode }; };
  w.host.closeViewer = async () => ({});
  const { sessionId } = await w.sessions.open(A, {});
  assert.equal(w.sessions.heldByUser(A), false);
  await w.sessions.control(sessionId, A, { mode: 'user', viewerId: 'v1' });
  assert.equal(w.sessions.heldByUser(A), true);
  assert.equal(w.sessions.heldByUser(B), false, 'another person is not held');
  await w.sessions.control(sessionId, A, { mode: 'model' });
  assert.equal(w.sessions.heldByUser(A), false, 'given back');
  await w.sessions.control(sessionId, A, { mode: 'user', viewerId: 'v1' });
  await w.sessions.closeViewer(sessionId, A, 'v2');
  assert.equal(w.sessions.heldByUser(A), true, 'another viewer leaving changes nothing');
  await w.sessions.closeViewer(sessionId, A, 'v1');
  assert.equal(w.sessions.heldByUser(A), false, 'the one that held it left');
});

test('the eye shows what is typed only while the person holds the browser, and the dots come back when they give it back or leave', async () => {
  const w = world();
  w.host.control = async (id, request) => ({ control: request.mode });
  w.host.closeViewer = async () => ({});
  const { sessionId } = await w.sessions.open(A, {});
  const reveals = () => w.calls.filter((call) => call[0] === 'action' && call[2].type === 'reveal').map((call) => call[2].on);
  assert.deepEqual(await w.sessions.reveal(sessionId, A, true), { ok: true, on: false }, 'the model holds it: nothing is shown');
  await w.sessions.control(sessionId, A, { mode: 'user', viewerId: 'v1' });
  assert.deepEqual(await w.sessions.reveal(sessionId, A, true), { ok: true, on: true });
  await w.sessions.control(sessionId, A, { mode: 'model' });
  await w.sessions.control(sessionId, A, { mode: 'user', viewerId: 'v1' });
  await w.sessions.closeViewer(sessionId, A, 'v2');
  const before = reveals().length;
  await w.sessions.closeViewer(sessionId, A, 'v1');
  assert.equal(reveals().length, before + 1, 'the viewer that held it left: dots again');
  assert.equal(reveals().at(-1), false);
  assert.deepEqual(reveals().slice(0, 3), [false, true, false], 'asked, shown, given back');
  await assert.rejects(() => w.sessions.reveal(sessionId, B, true), (error) => error instanceof BrowserSessionError);
});
