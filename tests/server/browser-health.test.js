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

test('people waiting and a heavy load that last each have their own mail, with only numbers, and are not repeated for hours', async () => {
  const busy = { ...ok, queued: 6, load1: 7.5 };
  const t = setup({ states: Array.from({ length: 12 }, () => busy) });
  for (let i = 0; i < 2; i += 1) await t.health.look();
  assert.equal(t.mails.length, 0, 'two looks are a moment, not a trouble');
  await t.health.look();
  assert.equal(t.mails.length, 1, 'a queue of three looks is told');
  assert.match(t.mails[0].subject, /6 people are waiting/);
  for (let i = 0; i < 2; i += 1) await t.health.look();
  assert.equal(t.mails.length, 2, 'a load of five looks is told');
  assert.match(t.mails.map((m) => m.subject).join('|'), /heavily loaded/);
  assert.ok(!/session|user|http|domain/i.test(t.mails.map((m) => m.text).join(' ').replace(/browsers are running/g, '')), 'nothing of what anybody does');
  for (let i = 0; i < 5; i += 1) await t.health.look();
  assert.equal(t.mails.length, 2, 'not again soon');
  t.tick(61 * 60_000);
  await t.health.look();
  assert.equal(t.mails.length, 2, 'an hour later is still too soon for a queue (three hours) and a load (six hours)');
  t.tick(3 * 60 * 60_000);
  await t.health.look();
  assert.equal(t.mails.length, 3, 'a queue that lasts three hours is said again');
  t.tick(3 * 60 * 60_000);
  await t.health.look();
  assert.equal(t.mails.length, 5, 'and so is the load after six hours');
});

test('a load that goes up and down around its limit is not a trouble, and a trouble that was not told is not told to be over', async () => {
  const states = [];
  for (let i = 0; i < 30; i += 1) states.push({ ...ok, load1: i % 2 ? 7.1 : 4.9 });
  const t = setup({ states });
  for (let i = 0; i < 30; i += 1) await t.health.look();
  assert.equal(t.mails.length, 0, 'it never stays over for five looks');
  const lasting = setup({ states: [...Array.from({ length: 4 }, () => ({ ...ok, load1: 7 })), ok, ok, ok, ok, ok, ok] });
  for (let i = 0; i < 10; i += 1) await lasting.health.look();
  assert.equal(lasting.mails.length, 0, 'four looks over the limit were never told, so nothing is "well again" either');
});

test('a load that lasts is told once, and "well again" comes only after it has been gone for a while, once', async () => {
  const states = [...Array.from({ length: 5 }, () => ({ ...ok, load1: 8 })), { ...ok, load1: 2 }, { ...ok, load1: 9 }, { ...ok, load1: 2 }, { ...ok, load1: 2 }, { ...ok, load1: 2 }, { ...ok, load1: 2 }, { ...ok, load1: 2 }, { ...ok, load1: 2 }];
  const t = setup({ states });
  for (let i = 0; i < 5; i += 1) await t.health.look();
  assert.equal(t.mails.length, 1);
  await t.health.look(); // calm for one look
  await t.health.look(); // over again: the calm count starts anew, and it is not told again (it is the same trouble)
  assert.equal(t.mails.length, 1);
  for (let i = 0; i < 4; i += 1) await t.health.look();
  assert.equal(t.mails.length, 1, 'four calm looks are not enough');
  await t.health.look();
  assert.equal(t.mails.length, 2);
  assert.match(t.mails[1].subject, /well again/);
});

test('the load is judged by the cores of the machine: 7.5 on eight cores is no trouble, 13 is', async () => {
  const calmEight = setup({ states: Array.from({ length: 8 }, () => ({ ...ok, load1: 7.5, cpus: 8 })) });
  for (let i = 0; i < 8; i += 1) await calmEight.health.look();
  assert.equal(calmEight.mails.length, 0);
  const heavy = setup({ states: Array.from({ length: 6 }, () => ({ ...ok, load1: 13, cpus: 8 })) });
  for (let i = 0; i < 5; i += 1) await heavy.health.look();
  assert.equal(heavy.mails.length, 1);
  assert.match(heavy.mails[0].text, /12\.0 or more.*8 cores/);
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
