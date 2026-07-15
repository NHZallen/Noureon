import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { scheduleArchiveVendorPrewarm } from '../src/app/vendors/archive-vendor-prewarm.js';

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

function createHarness({ controlled = true, useIdleCallback = true } = {}) {
  const listeners = new Map();
  const idleTasks = [];
  const timerTasks = [];
  const serviceWorker = {
    controller: controlled ? { state: 'activated' } : null,
    ready: Promise.resolve({ active: { state: 'activated' } }),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };
  const windowTarget = useIdleCallback
    ? {
        requestIdleCallback(callback, options) {
          idleTasks.push({ callback, options });
        }
      }
    : {
        setTimeout(callback, delay) {
          timerTasks.push({ callback, delay });
        }
      };
  const warnings = [];

  return {
    serviceWorker,
    navigatorTarget: { serviceWorker },
    windowTarget,
    listeners,
    idleTasks,
    timerTasks,
    logger: { warn: (...args) => warnings.push(args) },
    warnings
  };
}

test('archive prewarm waits for an active controlling service worker and browser idle time', async () => {
  const harness = createHarness({ controlled: false });
  let loadCalls = 0;
  const completion = scheduleArchiveVendorPrewarm({
    ...harness,
    loadArchiveVendor: async () => { loadCalls += 1; }
  });

  await flushMicrotasks();
  assert.equal(loadCalls, 0);
  assert.equal(harness.idleTasks.length, 0);
  assert.equal(typeof harness.listeners.get('controllerchange'), 'function');

  harness.serviceWorker.controller = { state: 'activated' };
  harness.listeners.get('controllerchange')();
  await flushMicrotasks();
  assert.equal(harness.listeners.has('controllerchange'), false);
  assert.equal(harness.idleTasks.length, 1);
  assert.deepEqual(harness.idleTasks[0].options, { timeout: 15000 });
  assert.equal(loadCalls, 0);

  harness.idleTasks[0].callback();
  assert.deepEqual(await completion, { prewarmed: true });
  assert.equal(loadCalls, 1);
});

test('archive prewarm uses a delayed fallback only after service worker readiness', async () => {
  const harness = createHarness({ useIdleCallback: false });
  let loadCalls = 0;
  const completion = scheduleArchiveVendorPrewarm({
    ...harness,
    loadArchiveVendor: async () => { loadCalls += 1; }
  });

  await flushMicrotasks();
  assert.equal(loadCalls, 0);
  assert.equal(harness.timerTasks.length, 1);
  assert.equal(harness.timerTasks[0].delay, 2000);

  harness.timerTasks[0].callback();
  assert.deepEqual(await completion, { prewarmed: true });
  assert.equal(loadCalls, 1);
});

test('archive prewarm is a safe no-op without service worker support', async () => {
  let loadCalls = 0;
  const result = await scheduleArchiveVendorPrewarm({
    navigatorTarget: {},
    loadArchiveVendor: async () => { loadCalls += 1; }
  });

  assert.deepEqual(result, { prewarmed: false, reason: 'unsupported' });
  assert.equal(loadCalls, 0);
});

test('archive prewarm contains readiness and vendor-loading failures', async () => {
  const readinessHarness = createHarness();
  readinessHarness.serviceWorker.ready = Promise.reject(new Error('registration failed'));
  const readinessResult = await scheduleArchiveVendorPrewarm({
    ...readinessHarness,
    loadArchiveVendor: async () => {}
  });
  assert.deepEqual(readinessResult, { prewarmed: false, reason: 'prewarm-failed' });
  assert.equal(readinessHarness.warnings.length, 1);

  const loadHarness = createHarness();
  const completion = scheduleArchiveVendorPrewarm({
    ...loadHarness,
    loadArchiveVendor: async () => { throw new Error('chunk unavailable'); }
  });
  await flushMicrotasks();
  loadHarness.idleTasks[0].callback();
  assert.deepEqual(await completion, { prewarmed: false, reason: 'prewarm-failed' });
  assert.equal(loadHarness.warnings.length, 1);
});

test('main schedules prewarm only after the runtime-interactive milestone without static JSZip', () => {
  const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const runtimeInteractiveAt = mainSource.indexOf('STARTUP_MARKS.RUNTIME_INTERACTIVE');
  const prewarmAt = mainSource.indexOf('void scheduleArchiveVendorPrewarm({');

  assert.ok(runtimeInteractiveAt >= 0);
  assert.ok(prewarmAt > runtimeInteractiveAt);
  assert.doesNotMatch(mainSource, /(?:from\s+|import\s*)['"]jszip['"]/);
});
