// Which browsers run and who waits (browser-host/session-manager.mjs), with a fake Docker and a fake clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager, HostError } from '../browser-host/session-manager.mjs';

const settle = () => new Promise((resolve) => setImmediate(resolve));

function setup(config = {}, hooks = {}) {
  const calls = [];
  let clock = 1_000_000;
  const adapter = {
    createVolume: async (s) => { calls.push(['createVolume', s.sessionId]); await hooks.createVolume?.(s); },
    loadProfile: async (s, buffer) => { calls.push(['loadProfile', s.sessionId, buffer.length]); },
    startContainer: async (s) => { calls.push(['startContainer', s.sessionId]); await hooks.startContainer?.(s); },
    waitReady: async (s) => { calls.push(['waitReady', s.sessionId]); await hooks.waitReady?.(s); },
    exportProfile: async (s) => { calls.push(['exportProfile', s.sessionId]); return Buffer.from(`profile-of-${s.sessionId}`); },
    stopContainer: async (s) => { calls.push(['stopContainer', s.sessionId]); },
    removeContainer: async (s) => { calls.push(['removeContainer', s.sessionId]); },
    removeVolume: async (s) => { calls.push(['removeVolume', s.sessionId]); },
    action: async (s, request) => { calls.push(['action', s.sessionId, request.type]); return { ok: true }; },
    listOrphans: async () => hooks.orphans ?? { containers: [], volumes: [] }
  };
  const logs = [];
  let n = 0;
  const m = createSessionManager({ adapter, config, now: () => clock, log: (e) => logs.push(e), makeSecret: () => `secret${String(n++).padStart(18, '0')}` });
  return { m, calls, logs, advance: (ms) => { clock += ms; }, names: (what) => calls.filter((c) => c[0] === what).map((c) => c[1]) };
}
const id = (n) => `session-${String(n).padStart(8, '0')}`;
const make = (m, n, user = `user${n}`, extra = {}) => m.create({ sessionId: id(n), userId: user, screen: { w: 1024, h: 768 }, ...extra });

test('a session starts: volume, container, ready; the view never shows passwords or the profile', async () => {
  const t = setup();
  assert.equal(make(t.m, 1).state, 'starting');
  await settle();
  assert.equal(t.m.get(id(1)).state, 'ready');
  assert.deepEqual(t.calls.map((c) => c[0]), ['createVolume', 'startContainer', 'waitReady']);
  const text = JSON.stringify(t.m.get(id(1)));
  assert.ok(!text.includes('secret'), 'no password in the view');
  assert.ok(!text.includes('profile-of'));
});

test('the machine holds at most maxSessions; the rest wait in order and move up when a place is freed', async () => {
  const t = setup({ maxSessions: 2 });
  make(t.m, 1); make(t.m, 2); await settle();
  assert.deepEqual(make(t.m, 3), { ...t.m.get(id(3)), state: 'queued', position: 1 });
  assert.equal(make(t.m, 4).position, 2);
  assert.deepEqual(t.m.summary(), { sessions: 2, queued: 2, maxSessions: 2 });
  await t.m.stop(id(1)); await settle();
  assert.equal(t.m.get(id(3)).state, 'ready');
  assert.equal(t.m.get(id(4)).state, 'queued');
  assert.equal(t.m.get(id(4)).position, 1);
});

test('one browser per user, no second session with the same id, a full queue is 429, a switched-off host is 503', async () => {
  const t = setup({ maxSessions: 1, maxQueue: 1 });
  make(t.m, 1, 'alice'); await settle();
  assert.throws(() => make(t.m, 2, 'alice'), (e) => e.status === 409 && e.code === 'user_has_session');
  assert.throws(() => make(t.m, 1, 'bob'), (e) => e.status === 409 && e.code === 'exists');
  make(t.m, 3, 'bob');
  assert.throws(() => make(t.m, 4, 'carol'), (e) => e.status === 429);
  assert.throws(() => setup({ enabled: false }).m.create({ sessionId: id(5), userId: 'x', screen: {} }), (e) => e.status === 503);
  await t.m.stop(id(1)); await settle();
  assert.doesNotThrow(() => make(t.m, 6, 'alice'), 'after her browser is gone she may start another');
});

test('bad input is 400 and nothing is started', async () => {
  const t = setup();
  assert.throws(() => t.m.create({ sessionId: '--privileged', userId: 'a', screen: {} }), (e) => e instanceof HostError && e.status === 400 && /bad session id/.test(e.message));
  assert.throws(() => t.m.create({ sessionId: undefined, userId: 'a', screen: {} }), (e) => e.status === 400);
  assert.throws(() => t.m.create({ sessionId: id(1), userId: 'a b', screen: {} }), (e) => e.status === 400);
  assert.throws(() => t.m.create({ sessionId: id(1), userId: 'a', screen: { w: 5, h: 5 } }), (e) => e.status === 400);
  assert.deepEqual(t.calls, []);
});

test('a login state: the session waits for it, then starts with it; it does not wait forever', async () => {
  const t = setup({ profileWaitMs: 60_000 });
  assert.equal(make(t.m, 1, 'a', { hasProfile: true }).state, 'awaiting_profile');
  await settle();
  assert.deepEqual(t.calls, [], 'nothing runs before the profile is here');
  assert.throws(() => t.m.putProfile(id(1), Buffer.alloc(0)), (e) => e.status === 400);
  assert.throws(() => t.m.putProfile(id(1), Buffer.alloc(200 * 1024 * 1024)), (e) => e.status === 413);
  t.m.putProfile(id(1), Buffer.from('tar-gz-bytes')); await settle();
  assert.equal(t.m.get(id(1)).state, 'ready');
  assert.deepEqual(t.names('loadProfile'), [id(1)]);
  assert.throws(() => t.m.putProfile(id(1), Buffer.from('x')), (e) => e.status === 409);
  make(t.m, 2, 'b', { hasProfile: true });
  t.advance(61_000); await t.m.tick();
  assert.equal(t.m.get(id(2)).state, 'failed');
  assert.ok(t.names('removeVolume').includes(id(2)) || t.names('removeContainer').includes(id(2)), 'it was cleaned up');
});

test('a start that fails is cleaned up, reported, and its place goes to the next in line', async () => {
  const t = setup({ maxSessions: 1 }, { waitReady: async (s) => { if (s.sessionId === id(1)) throw new Error('never became healthy'); } });
  make(t.m, 1); make(t.m, 2); await settle();
  assert.equal(t.m.get(id(1)).state, 'failed');
  assert.equal(t.m.get(id(1)).error, 'never became healthy');
  assert.deepEqual([t.names('stopContainer')[0], t.names('removeContainer')[0], t.names('removeVolume')[0]], [id(1), id(1), id(1)]);
  assert.equal(t.m.get(id(2)).state, 'ready', 'the next one got the place');
  assert.equal(t.m.summary().sessions, 1);
});

test('when every start fails, each one is reported and the queue still empties (no stuck place)', async () => {
  const t = setup({ maxSessions: 1 }, { startContainer: async () => { throw new Error('image missing'); } });
  make(t.m, 1); make(t.m, 2); make(t.m, 3); await settle(); await settle(); await settle();
  for (const n of [1, 2, 3]) assert.equal(t.m.get(id(n)).state, 'failed');
  assert.deepEqual(t.m.summary(), { sessions: 0, queued: 0, maxSessions: 1 });
});

test('actions need a ready browser, and each one counts as being used', async () => {
  const t = setup({ idleMs: 100_000 });
  make(t.m, 1); 
  await assert.rejects(t.m.action(id(1), { type: 'navigate' }), (e) => e.status === 409);
  await settle();
  t.advance(90_000);
  assert.deepEqual(await t.m.action(id(1), { type: 'navigate' }), { ok: true });
  t.advance(90_000); await t.m.tick();
  assert.equal(t.m.get(id(1)).state, 'ready', 'the action reset the idle clock');
  await assert.rejects(t.m.action('nope-nope-nope', {}), (e) => e instanceof HostError && e.status === 404);
});

test('idle for idleMs, or running for taskMaxMs, stops the browser and keeps the login state for the main server to collect', async () => {
  const t = setup({ idleMs: 3_600_000, taskMaxMs: 7_200_000, collectMs: 600_000 });
  make(t.m, 1); make(t.m, 2); await settle();
  t.advance(3_600_001); await t.m.tick();
  assert.equal(t.m.get(id(1)).state, 'stopped'); assert.equal(t.m.get(id(1)).stoppedReason, 'idle');
  assert.equal(t.m.get(id(1)).profileAvailable, true);
  assert.deepEqual(t.names('removeVolume'), [], 'the volume stays so that the login state is not lost');
  const profile = await t.m.collectProfile(id(1));
  assert.equal(profile.toString(), `profile-of-${id(1)}`);
  assert.deepEqual(t.names('removeVolume'), [id(1)]);
  await assert.rejects(t.m.collectProfile(id(1)), (e) => e.status === 404);
  // a busy browser is still stopped when the task limit is reached
  const u = setup({ idleMs: 3_600_000, taskMaxMs: 7_200_000 });
  make(u.m, 1); await settle();
  for (let i = 0; i < 8; i += 1) { u.advance(1_000_000); await u.m.action(id(1), { type: 'tabs' }).catch(() => {}); await u.m.tick(); }
  assert.equal(u.m.get(id(1)).stoppedReason, 'task_max');
});

test('login state nobody collects is thrown away after collectMs, and old records are forgotten', async () => {
  const t = setup({ idleMs: 1000, collectMs: 600_000, forgetMs: 3_600_000 });
  make(t.m, 1); await settle();
  t.advance(2000); await t.m.tick();
  assert.equal(t.m.get(id(1)).profileAvailable, true);
  t.advance(600_001); await t.m.tick();
  assert.equal(t.m.get(id(1)).profileAvailable, false);
  assert.deepEqual(t.names('removeVolume'), [id(1)]);
  t.advance(3_600_001); await t.m.tick();
  assert.throws(() => t.m.get(id(1)), (e) => e.status === 404);
});

test('stopping on request: with save the login state comes back in the same call and nothing is left; without, nothing is kept', async () => {
  const t = setup();
  make(t.m, 1); make(t.m, 2); await settle();
  const saved = await t.m.stop(id(1), { save: true });
  assert.equal(saved.profile.toString(), `profile-of-${id(1)}`);
  assert.deepEqual(t.calls.filter((c) => c[1] === id(1)).map((c) => c[0]).slice(-4), ['stopContainer', 'removeContainer', 'exportProfile', 'removeVolume'], 'the browser is closed before it is packed');
  assert.equal(t.m.get(id(1)).profileAvailable, false);
  assert.deepEqual(await t.m.stop(id(2)), { profile: null });
  assert.deepEqual(await t.m.stop(id(2)), { profile: null }, 'stopping twice is harmless');
});

test('a queued session can be cancelled; a periodic save works on a running one only', async () => {
  const t = setup({ maxSessions: 1 });
  make(t.m, 1); make(t.m, 2); await settle();
  await assert.rejects(t.m.save(id(2)), (e) => e.status === 409);
  assert.equal((await t.m.save(id(1))).toString(), `profile-of-${id(1)}`);
  await t.m.stop(id(2));
  assert.equal(t.m.summary().queued, 0);
});

test('on start-up, leftovers of an earlier run are removed; shutdown stops everything', async () => {
  const t = setup({}, { orphans: { containers: [id(7)], volumes: [id(7), id(8)] } });
  assert.equal(await t.m.recover(), 3);
  assert.deepEqual([...new Set(t.names('removeVolume'))].sort(), [id(7), id(8)]);
  make(t.m, 1); make(t.m, 2); await settle();
  await t.m.shutdown();
  assert.equal(t.m.get(id(1)).state, 'stopped'); assert.equal(t.m.get(id(2)).state, 'stopped');
});

test('the live screen: a port before the container starts, ready after it is up, released when it goes, and a failing port stops the start', async () => {
  const events = [];
  const live = { allocate: (s) => events.push(['allocate', s.sessionId]), ready: async (s) => events.push(['ready', s.sessionId]), release: (s) => events.push(['release', s.sessionId]), tick: async (list) => events.push(['tick', list.length]) };
  const adapter = {
    createVolume: async () => {}, loadProfile: async () => {}, startContainer: async () => events.push(['start']), waitReady: async () => events.push(['wait']), exportProfile: async () => Buffer.from('x'),
    stopContainer: async () => {}, removeContainer: async () => {}, removeVolume: async () => {}, action: async () => ({ ok: true }), listOrphans: async () => ({ containers: [], volumes: [] })
  };
  const m = createSessionManager({ adapter, live, config: {}, makeSecret: () => 'secret000000000000000000' });
  make(m, 1);
  await settle(); await settle();
  assert.deepEqual(events.map((e) => e[0]), ['allocate', 'start', 'wait', 'ready']);
  assert.equal(m.ready(id(1)).sessionId, id(1));
  await m.tick();
  assert.deepEqual(events.at(-1), ['tick', 1]);
  await m.stop(id(1), { reason: 'requested' });
  assert.equal(events.at(-1)[0], 'release');
  assert.throws(() => m.ready(id(1)), (e) => e instanceof HostError);
});
