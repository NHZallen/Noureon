import assert from 'node:assert/strict';
import test from 'node:test';

import { OPENCODE_USAGE_URLS, createOpencodeUsage, parseUsage, parseUsageWindow } from '../src/app/runtime/shell/opencode-usage.js';

const BODY = { usage: { rolling: { status: 'ok', percent: 0, resetsAt: '2026-10-27T10:00:00Z' }, weekly: { status: 'ok', percent: 0, resetsAt: '2026-11-02T00:00:00Z' }, monthly: { status: 'ok', percent: 21, resetsAt: '2026-11-20T00:00:00Z' } } };
const answer = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function harness(handlers) {
  const calls = [];
  let clock = 1_000_000;
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const next = handlers.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(url) : next;
  };
  const usage = createOpencodeUsage({ fetchImpl, now: () => clock });
  return { usage, calls, tick: (ms) => { clock += ms; } };
}

test('a window is read as used and remaining, and a bad percent is no window', () => {
  assert.deepEqual(parseUsageWindow({ status: 'ok', percent: 21, resetsAt: '2026-11-20T00:00:00Z' }), { usedPercent: 21, remainingPercent: 79, resetsAt: Date.parse('2026-11-20T00:00:00Z'), status: 'ok' });
  assert.equal(parseUsageWindow({ percent: 140 }).remainingPercent, 0);
  assert.equal(parseUsageWindow({ percent: -5 }).usedPercent, 0);
  assert.equal(parseUsageWindow({ percent: '21' }), null);
  assert.equal(parseUsageWindow({ percent: Number.NaN }), null);
  assert.equal(parseUsageWindow(null), null);
  assert.equal(parseUsageWindow({ percent: 5, resetsAt: 'not a date' }).resetsAt, null);
});

test('the answer holds the windows it has, and nothing when it has none', () => {
  assert.deepEqual(Object.keys(parseUsage(BODY)), ['rolling', 'weekly', 'monthly']);
  assert.deepEqual(Object.keys(parseUsage({ usage: { weekly: { percent: 3 }, monthly: 'x' } })), ['weekly']);
  assert.equal(parseUsage({ usage: {} }), null);
  assert.equal(parseUsage({}), null);
  assert.equal(parseUsage(null), null);
  assert.equal(parseUsage('text'), null);
});

test('it asks with the key and nothing else, the first address first', async () => {
  const { usage, calls } = harness([answer(BODY)]);
  const result = await usage.get('  oc-key  ');
  assert.equal(result.ok, true);
  assert.equal(result.windows.monthly.remainingPercent, 79);
  assert.deepEqual(calls.map((call) => call.url), [OPENCODE_USAGE_URLS[0]]);
  assert.deepEqual(calls[0].headers, { Authorization: 'Bearer oc-key' });
});

test('without a key nothing is asked', async () => {
  const { usage, calls } = harness([]);
  assert.deepEqual(await usage.get(''), { ok: false, reason: 'no-key' });
  assert.equal(calls.length, 0);
});

test('when the first address fails the second is asked', async () => {
  for (const first of [answer({}, 503), new Error('network'), answer({ nothing: true })]) {
    const { usage, calls } = harness([first, answer(BODY)]);
    const result = await usage.get('k');
    assert.equal(result.ok, true);
    assert.deepEqual(calls.map((call) => call.url), [...OPENCODE_USAGE_URLS]);
  }
});

test('a wrong key or no plan is not tried at the other address', async () => {
  for (const [status, reason] of [[401, 'invalid-key'], [403, 'no-plan']]) {
    const { usage, calls } = harness([answer({}, status), answer(BODY)]);
    assert.deepEqual(await usage.get('k'), { ok: false, reason });
    assert.equal(calls.length, 1);
  }
});

test('both addresses failing is unavailable', async () => {
  const { usage } = harness([answer({}, 503), answer({}, 500)]);
  assert.deepEqual(await usage.get('k'), { ok: false, reason: 'unavailable' });
});

test('an answer is kept for a minute for the same key, and not given to another key', async () => {
  const { usage, calls, tick } = harness([answer(BODY), answer(BODY), answer(BODY)]);
  await usage.get('key-a');
  await usage.get('key-a');
  assert.equal(calls.length, 1);
  tick(30_000);
  await usage.get('key-a');
  assert.equal(calls.length, 1);
  // Another person's key never gets the answer kept for the first.
  await usage.get('key-b');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].headers.Authorization, 'Bearer key-b');
  tick(61_000);
  await usage.get('key-b');
  assert.equal(calls.length, 3);
});

test('two asks at once are one request', async () => {
  const { usage, calls } = harness([answer(BODY), answer(BODY)]);
  const [first, second] = await Promise.all([usage.get('k'), usage.get('k')]);
  assert.equal(calls.length, 1);
  assert.equal(first, second);
});

test('the last answer is given again, marked, when the service does not answer later', async () => {
  const { usage, calls, tick } = harness([answer(BODY), answer({}, 503), answer({}, 503), answer({}, 503), answer({}, 503)]);
  await usage.get('k');
  tick(61_000);
  const later = await usage.get('k');
  assert.equal(later.ok, true);
  assert.equal(later.stale, true);
  assert.equal(later.windows.monthly.usedPercent, 21);
  // And it is not asked again at once.
  const callsBefore = calls.length;
  await usage.get('k');
  assert.equal(calls.length, callsBefore);
});

test('a tap asks again before the minute is over, but not twice in a few seconds', async () => {
  const { usage, calls, tick } = harness([answer(BODY), answer(BODY), answer(BODY)]);
  await usage.get('k');
  tick(6_000);
  await usage.get('k', { force: true });
  assert.equal(calls.length, 2);
  tick(1_000);
  await usage.get('k', { force: true });
  assert.equal(calls.length, 2);
});

test('the key is never part of what comes back', async () => {
  const { usage } = harness([answer(BODY)]);
  assert.equal(JSON.stringify(await usage.get('secret-key-123')).includes('secret-key-123'), false);
});
