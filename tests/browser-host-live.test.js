// The live screen logic of browser-host (browser-host/live.mjs) with a fake neko: ports, viewers (one temporary member each), who has control, the ratio, and the clean-up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLive, RATIO_SIZES } from '../browser-host/live.mjs';

const fakeNeko = () => {
  const log = [];
  const connected = new Set();
  const members = new Set();
  return {
    log, connected, members,
    api: {
      settings: async (p) => log.push(['settings', p]),
      createMember: async ({ username }) => { members.add(username); log.push(['create', username]); },
      login: async (username) => { log.push(['login', username]); return { id: username, token: `tok-${username}` }; },
      deleteMember: async (id) => { members.delete(id); connected.delete(id); log.push(['delete', id]); },
      give: async (id) => log.push(['give', id]),
      reset: async () => log.push(['reset']),
      setScreen: async (size) => log.push(['screen', size]),
      listSessions: async () => [...members].map((id) => ({ id, state: { is_connected: connected.has(id) } }))
    }
  };
};
const CONFIG = { publicIp: '84.247.153.81', portBase: 52000, slots: 2, host: 'live-staging.noureon.com' };
let counter = 0;
const make = (extra = {}) => {
  const neko = fakeNeko();
  const clock = { t: 1_000_000 };
  const live = createLive({ config: { ...CONFIG, ...extra }, makeNeko: () => neko.api, containerIp: async () => '172.29.0.2', now: () => clock.t, makeSecret: (n) => { counter += 1; return String(counter).padStart(n * 2, '0'); } });
  return { live, neko, clock };
};
const session = (id = 'sess-12345678') => ({ sessionId: id, state: 'ready', screen: { w: 1024, h: 768 }, lastActionAt: 0 });

test('each browser takes its own port (UDP and TCP are the same number), a third finds none, and a released one is free again', () => {
  const { live } = make();
  const a = session('sess-aaaaaaaa'); const b = session('sess-bbbbbbbb'); const c = session('sess-cccccccc');
  assert.equal(live.allocate(a).udpPort, 52000);
  assert.equal(live.allocate(b).udpPort, 52001);
  assert.throws(() => live.allocate(c), (error) => error.code === 'no_live_port');
  live.release(a);
  assert.equal(live.allocate(c).udpPort, 52000);
});

test('when the browser is up the controls are locked at once, and the proxy can find it by its path only while it is live', async () => {
  const { live, neko } = make();
  const s = session();
  const taken = live.allocate(s);
  assert.equal(live.target(taken.pathToken), null, 'not before it is ready');
  await live.ready(s);
  assert.deepEqual(neko.log[0], ['settings', { locked_controls: true, private_mode: false }]);
  assert.deepEqual(live.target(taken.pathToken), { ip: '172.29.0.2', port: 8080, sessionId: 'sess-12345678' });
  assert.equal(live.target('0'.repeat(32)), null);
  live.release(s);
  assert.equal(live.target(taken.pathToken), null);
});

test('a viewer is one temporary member: the page gets a session token and the path of the WebSocket, never a password; closing removes the member', async () => {
  const { live, neko } = make();
  const s = session();
  const taken = live.allocate(s);
  await live.ready(s);
  const viewer = await live.createViewer(s);
  assert.equal(viewer.token, `tok-${viewer.viewerId}`);
  assert.equal(viewer.host, 'live-staging.noureon.com');
  assert.equal(viewer.wsPath, `/s/${taken.pathToken}/api/ws`);
  assert.ok(!JSON.stringify(viewer).includes('password'));
  assert.ok(neko.members.has(viewer.viewerId));
  await live.closeViewer(s, viewer.viewerId);
  assert.equal(neko.members.size, 0);
  await assert.rejects(() => live.closeViewer(s, viewer.viewerId), (error) => error.code === 'no_viewer');
});

test('at most three people look at one browser', async () => {
  const { live } = make();
  const s = session();
  live.allocate(s); await live.ready(s);
  for (let i = 0; i < 3; i += 1) await live.createViewer(s);
  await assert.rejects(() => live.createViewer(s), (error) => error.code === 'too_many_viewers');
});

test('taking over gives control to that viewer, giving back resets it; a viewer who is gone cannot be given control; closing the one who has control takes it back', async () => {
  const { live, neko } = make();
  const s = session();
  live.allocate(s); await live.ready(s);
  const viewer = await live.createViewer(s);
  assert.deepEqual(await live.control(s, { mode: 'user', viewerId: viewer.viewerId }), { control: 'user' });
  assert.deepEqual(neko.log.at(-1), ['give', viewer.viewerId]);
  assert.deepEqual(await live.control(s, { mode: 'model' }), { control: 'model' });
  assert.deepEqual(neko.log.at(-1), ['reset']);
  await assert.rejects(() => live.control(s, { mode: 'user', viewerId: 'nobody' }), (error) => error.code === 'no_viewer');
  await assert.rejects(() => live.control(s, { mode: 'both', viewerId: viewer.viewerId }), (error) => error.code === 'bad_request');
  await live.control(s, { mode: 'user', viewerId: viewer.viewerId });
  await live.closeViewer(s, viewer.viewerId);
  assert.deepEqual(neko.log.filter((entry) => entry[0] === 'reset').length, 2, 'control was taken back when the person who had it left');
});

test('the ratio sets the size of the screen; an unknown one (or a name of the prototype) is refused', async () => {
  const { live, neko } = make();
  const s = session();
  live.allocate(s); await live.ready(s);
  assert.deepEqual(await live.setRatio(s, '16:9'), { ratio: '16:9', width: 1280, height: 720 });
  assert.deepEqual(neko.log.at(-1), ['screen', { width: 1280, height: 720 }]);
  assert.deepEqual(s.screen, { w: 1280, h: 720 });
  await live.setRatio(s, 'portrait');
  assert.deepEqual(neko.log.at(-1), ['screen', { width: 768, height: 1024 }]);
  await assert.rejects(() => live.setRatio(s, '1:1'), (error) => error.code === 'bad_request');
  await assert.rejects(() => live.setRatio(s, 'toString'), (error) => error.code === 'bad_request');
  assert.deepEqual(Object.keys(RATIO_SIZES), ['4:3', '16:9', 'portrait']);
});

test('the tick removes a viewer who never came, and one who went and did not return, and keeps a browser that is watched from counting as idle', async () => {
  const { live, neko, clock } = make({ viewerWaitMs: 60_000, viewerGoneMs: 30_000 });
  const s = session();
  live.allocate(s); await live.ready(s);
  const never = await live.createViewer(s);
  const came = await live.createViewer(s);
  neko.connected.add(came.viewerId);
  await live.tick([s]);
  assert.equal(s.live.viewers.size, 2, 'nobody is removed yet');
  clock.t += 61_000;
  s.lastActionAt = 0;
  await live.tick([s]);
  assert.ok(!s.live.viewers.has(never.viewerId), 'the one who never came is gone');
  assert.ok(s.live.viewers.has(came.viewerId));
  assert.equal(s.lastActionAt, clock.t, 'a connected viewer keeps the browser from being idle');
  neko.connected.delete(came.viewerId);
  await live.tick([s]);
  assert.ok(s.live.viewers.has(came.viewerId), 'a short break is allowed');
  clock.t += 31_000;
  await live.tick([s]);
  assert.equal(s.live.viewers.size, 0);
  assert.equal(neko.members.size, 0);
});
