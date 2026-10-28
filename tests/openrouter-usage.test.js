import assert from 'node:assert/strict';
import test from 'node:test';

import { createOpenrouterUsage, OPENROUTER_KEY_URL, parseKeyLimit } from '../src/app/runtime/shell/openrouter-usage.js';

const LIMITED = { data: { label: 'sk-or-v1-abc...xyz', limit: 20, limit_remaining: 5, limit_reset: 'monthly', usage: 31.5, usage_daily: 0.4, usage_weekly: 2.1, usage_monthly: 15, is_free_tier: false } };
const answer = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function harness(handlers) {
  const calls = [];
  let clock = 1_000_000;
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const next = handlers.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { usage: createOpenrouterUsage({ fetchImpl, now: () => clock }), calls, tick: (ms) => { clock += ms; } };
}

test('a key with a limit gives what is left of it', () => {
  const limit = parseKeyLimit(LIMITED);
  assert.equal(limit.limit, 20);
  assert.equal(limit.remaining, 5);
  assert.equal(limit.remainingPercent, 25);
  assert.equal(limit.usedPercent, 75);
  assert.equal(limit.resetKind, 'monthly');
  assert.deepEqual(limit.spent, { total: 31.5, daily: 0.4, weekly: 2.1, monthly: 15 });
});

test('a key with no limit, or an answer that is not about a limit, gives nothing', () => {
  assert.equal(parseKeyLimit({ data: { limit: null, limit_remaining: null, usage: 3 } }), null);
  assert.equal(parseKeyLimit({ data: { limit: 0, limit_remaining: 0 } }), null);
  assert.equal(parseKeyLimit({ data: { limit: '20', limit_remaining: 5 } }), null);
  assert.equal(parseKeyLimit({ data: { limit: 20 } }), null);
  assert.equal(parseKeyLimit({}), null);
  assert.equal(parseKeyLimit(null), null);
});

test('what is left is kept between nothing and the whole limit, and an unknown reset is no reset', () => {
  assert.equal(parseKeyLimit({ data: { limit: 10, limit_remaining: -3 } }).remainingPercent, 0);
  assert.equal(parseKeyLimit({ data: { limit: 10, limit_remaining: 14 } }).remainingPercent, 100);
  const odd = parseKeyLimit({ data: { limit: 10, limit_remaining: 4, limit_reset: 'yearly', usage: 'a' } });
  assert.equal(odd.resetKind, '');
  assert.equal(odd.spent.total, null);
});

test('it asks the key address with the key and nothing else', async () => {
  const { usage, calls } = harness([answer(LIMITED)]);
  const result = await usage.get(' sk-or-key ');
  assert.equal(result.ok, true);
  assert.equal(result.remainingPercent, 25);
  assert.deepEqual(calls, [{ url: OPENROUTER_KEY_URL, headers: { Authorization: 'Bearer sk-or-key' } }]);
});

test('without a key nothing is asked; a key with no limit says so and is not asked again for a minute', async () => {
  const empty = harness([]);
  assert.deepEqual(await empty.usage.get(''), { ok: false, reason: 'no-key' });
  assert.equal(empty.calls.length, 0);
  const { usage, calls, tick } = harness([answer({ data: { limit: null, limit_remaining: null } }), answer({ data: { limit: null } })]);
  assert.deepEqual(await usage.get('k'), { ok: false, reason: 'no-limit' });
  assert.deepEqual(await usage.get('k'), { ok: false, reason: 'no-limit' });
  assert.equal(calls.length, 1);
  tick(61_000);
  await usage.get('k');
  assert.equal(calls.length, 2);
});

test('a wrong key, a service that does not answer, and a network that fails are told apart', async () => {
  assert.deepEqual(await harness([answer({}, 401)]).usage.get('k'), { ok: false, reason: 'invalid-key' });
  assert.deepEqual(await harness([answer({}, 503)]).usage.get('k'), { ok: false, reason: 'unavailable' });
  assert.deepEqual(await harness([new Error('network')]).usage.get('k'), { ok: false, reason: 'unavailable' });
});

test('the last answer is given again, marked, when the service does not answer later; another key never gets it', async () => {
  const { usage, tick } = harness([answer(LIMITED), answer({}, 503), answer({}, 503)]);
  await usage.get('key-a');
  tick(61_000);
  const later = await usage.get('key-a');
  assert.equal(later.ok, true);
  assert.equal(later.stale, true);
  assert.equal(later.remainingPercent, 25);
  assert.deepEqual(await usage.get('key-b'), { ok: false, reason: 'unavailable' });
});
