import assert from 'node:assert/strict';
import test from 'node:test';

import { registerServiceWorker } from '../src/pwa/register-service-worker.js';

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

function createHarness(readyState) {
  const calls = [];
  const listeners = new Map();
  const serviceWorker = {
    register: async path => {
      calls.push(['register', path]);
      return { scope: '/' };
    },
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const windowTarget = {
    document: { readyState },
    addEventListener(type, listener, options) {
      calls.push(['listen', type, options]);
      listeners.set(type, listener);
    },
    location: { reload() {} }
  };
  const logger = { log() {}, warn() {}, info() {} };
  return {
    calls,
    listeners,
    serviceWorker,
    windowTarget,
    navigatorTarget: { serviceWorker },
    logger
  };
}

test('service worker registers immediately when runtime startup finishes after window load', async () => {
  const harness = createHarness('complete');

  registerServiceWorker(harness);
  await flushMicrotasks();

  assert.deepEqual(harness.calls, [['register', '/service-worker.js']]);
  assert.equal(typeof harness.listeners.get('message'), 'function');
});

test('service worker waits for load exactly once when the document is not complete', async () => {
  const harness = createHarness('interactive');

  registerServiceWorker(harness);
  assert.deepEqual(harness.calls, [['listen', 'load', { once: true }]]);

  await harness.listeners.get('load')();
  assert.deepEqual(harness.calls, [
    ['listen', 'load', { once: true }],
    ['register', '/service-worker.js']
  ]);
});

test('service worker registration stays disabled in development or unsupported browsers', () => {
  const developmentHarness = createHarness('complete');
  registerServiceWorker({ ...developmentHarness, development: true });
  assert.deepEqual(developmentHarness.calls, []);

  const unsupportedHarness = createHarness('complete');
  registerServiceWorker({
    ...unsupportedHarness,
    navigatorTarget: {},
    development: false
  });
  assert.deepEqual(unsupportedHarness.calls, []);
});
