// The look at the browser host: mail when it is down, loaded or has a queue; one mail an hour for each kind; a short one when it is well again; only numbers in what is said.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserHealth } from '../../server/browser-health.js';

const setup = ({ states, configured = true, to = 'owner@example.test' } = {}) => {
  let step = 0;
  let clock = 1_000_000;
  const mails = [];
  const logs = [];
  const host = { health: async () => { const state = states[Math.min(step, states.length - 1)]; step += 1; if (state instanceof Error) throw state; return state; } };
  const mailer = { configured, send: async (mail) => { mails.push(mail); } };
  const health = createBrowserHealth({ host, mailer, to, log: (name, data) => logs.push([name, data]), now: () => clock });
  return { health, mails, logs, tick: (ms) => { clock += ms; } };
};
const ok = { ok: true, sessions: 1, queued: 0, maxSessions: 2, load1: 0.4 };

test('a host that answers is left alone', async () => {
  const t = setup({ states: [ok, ok] });
  assert.deepEqual((await t.health.look()).found, []);
  assert.equal(t.mails.length, 0);
});

test('a host that stays silent for three looks is mailed about once an hour, and a mail says when it is back', async () => {
  const down = Object.assign(new Error('x'), { code: 'unreachable' });
  const t = setup({ states: [down, down, down, down, ok] });
  await t.health.look(); await t.health.look();
  assert.equal(t.mails.length, 0, 'two misses are not yet trouble');
  await t.health.look();
  assert.equal(t.mails.length, 1);
  assert.match(t.mails[0].subject, /does not answer/);
  assert.equal(t.mails[0].to, 'owner@example.test');
  await t.health.look();
  assert.equal(t.mails.length, 1, 'not again within the hour');
  const back = await t.health.look();
  assert.deepEqual(back.found, []);
  assert.equal(t.mails.length, 2);
  assert.match(t.mails[1].subject, /well again/);
});

test('people waiting and a heavy load each have their own mail, with only numbers', async () => {
  const t = setup({ states: [{ ...ok, queued: 6, load1: 7.5 }, { ...ok, queued: 6, load1: 7.5 }] });
  const first = await t.health.look();
  assert.deepEqual(first.found.sort(), ['load', 'queue']);
  assert.equal(t.mails.length, 2);
  assert.match(t.mails.map((m) => m.subject).join('|'), /6 people are waiting/);
  assert.ok(!/session|user|http|domain/i.test(t.mails.map((m) => m.text).join(' ').replace(/browsers are running/g, '')), 'nothing of what anybody does');
  await t.health.look();
  assert.equal(t.mails.length, 2, 'once an hour for each');
  t.tick(61 * 60_000);
  await t.health.look();
  assert.equal(t.mails.length, 4, 'an hour later they are said again while they last');
});

test('without an address or a mail key nothing is sent, and it is logged; a mail that fails does not stop the looks', async () => {
  const down = new Error('x');
  const none = setup({ states: [down, down, down], to: '' });
  for (let i = 0; i < 3; i += 1) await none.health.look();
  assert.equal(none.mails.length, 0);
  assert.ok(none.logs.some(([name]) => name === 'browser_health_not_mailed'));
  const failing = setup({ states: [down, down, down] });
  failing.health = createBrowserHealth({ host: { health: async () => { throw down; } }, mailer: { configured: true, send: async () => { throw Object.assign(new Error('no'), { code: 'refused' }); } }, to: 'a@b.test', log: (n) => failing.logs.push([n]) });
  for (let i = 0; i < 3; i += 1) await failing.health.look();
  assert.ok(failing.logs.some(([name]) => name === 'browser_health_mail_failed'));
});

test('start and stop run the looks on a timer without keeping the process alive', () => {
  const t = setup({ states: [ok] });
  const timers = [];
  const health = createBrowserHealth({ host: { health: async () => ok }, mailer: { configured: false }, to: '', setTimer: (fn, ms) => { const timer = { fn, ms, unref: () => { timer.unrefed = true; } }; timers.push(timer); return timer; }, clearTimer: (timer) => { timer.cleared = true; } });
  health.start(); health.start();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 60_000);
  assert.equal(timers[0].unrefed, true);
  health.stop();
  assert.equal(timers[0].cleared, true);
  assert.ok(t.health);
});
