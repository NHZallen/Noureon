import assert from 'node:assert/strict';
import test from 'node:test';

import { openWhenBuilt } from '../src/app/runtime/features/open-settings-when-built.js';

test('a page that is built at once is shown at once, in the same tick', () => {
  const calls = [];
  const opened = openWhenBuilt({ setup: () => { calls.push('setup'); }, show: () => calls.push('show') });
  assert.deepEqual(calls, ['setup', 'show'], 'nothing waits when there is nothing to wait for');
  return opened;
});

test('the page waits for the part that is built after a module has loaded, then is shown', async () => {
  const calls = [];
  let finish;
  const built = new Promise((resolve) => { finish = resolve; });
  const opened = openWhenBuilt({ setup: () => { calls.push('setup'); return built; }, show: () => calls.push('show'), schedule: () => {} });
  await Promise.resolve();
  assert.deepEqual(calls, ['setup'], 'not shown while it is still being built');
  finish(null);
  await opened;
  assert.deepEqual(calls, ['setup', 'show']);
});

test('it never waits longer than the time given: a slow network does not leave a tap with nothing happening', async () => {
  const calls = [];
  const timers = [];
  const opened = openWhenBuilt({ setup: () => new Promise(() => {}), show: () => calls.push('show'), waitMs: 250, schedule: (callback, ms) => timers.push({ callback, ms }) });
  await Promise.resolve();
  assert.deepEqual(calls, []);
  assert.equal(timers[0].ms, 250);
  timers[0].callback();
  await opened;
  assert.deepEqual(calls, ['show']);
});

test('a setup that fails shows nothing, as before (the error is the caller\'s)', async () => {
  const calls = [];
  await assert.rejects(() => openWhenBuilt({ setup: () => { throw new Error('broken'); }, show: () => calls.push('show') }), /broken/);
  assert.deepEqual(calls, []);
});
