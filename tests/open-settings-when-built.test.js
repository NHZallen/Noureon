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

test('the wait is long enough for a phone\'s network (the page was rebuilt while it was shown, and flashed, when the wait ran out first)', async () => {
  const timers = [];
  const opened = openWhenBuilt({ setup: () => new Promise(() => {}), show: () => {}, schedule: (callback, ms) => timers.push(ms) });
  await Promise.resolve();
  assert.equal(timers[0], 500);
  void opened;
});

test('the page is built ahead when the page is idle, not at once', async () => {
  const { prepareWhenIdle } = await import('../src/app/runtime/features/open-settings-when-built.js');
  const calls = [];
  const timers = [];
  prepareWhenIdle({ setup: () => { calls.push('setup'); return Promise.reject(new Error('offline')); }, schedule: (callback, ms) => timers.push({ callback, ms }), requestIdle: (run, options) => { calls.push(['idle', options.timeout]); run(); } });
  assert.deepEqual(calls, [], 'nothing happens at once');
  assert.equal(timers[0].ms, 4000);
  timers[0].callback();
  await Promise.resolve();
  assert.deepEqual(calls, [['idle', 8000], 'setup'], 'built when the browser is idle; a failure is not an error');
  const noIdle = [];
  prepareWhenIdle({ setup: () => { noIdle.push('setup'); throw new Error('boom'); }, schedule: (callback) => callback(), requestIdle: null });
  assert.deepEqual(noIdle, ['setup'], 'without idle callbacks it is built at the time, and a throw is swallowed');
});

test('the page is built ahead by the app after it started (source of the wiring)', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/app/runtime/features/app-bootstrap-lifecycle.js', import.meta.url), 'utf8');
  assert.match(source, /prepareWhenIdle\(\{\s*setup:\s*resolveEventsSetupSettingsModal\s*\}\)/);
});
