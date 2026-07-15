import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createP2PScannerLifecycle } from '../src/app/legacy-runtime/features/p2p-scanner-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const createElements = () => new Map([
  ['p2p-progress-bar', { style: {} }],
  ['p2p-percentage', { textContent: '' }],
  ['p2p-status-text', { textContent: '' }],
  ['p2p-reader', {
    classList: {
      values: new Set(['hidden']),
      add(value) {
        this.values.add(value);
      },
      remove(value) {
        this.values.delete(value);
      }
    }
  }],
  ['p2p-code-input', { value: '' }]
]);

test('updates P2P progress elements and preserves the required-element error boundary', () => {
  const elements = createElements();
  const lifecycle = createP2PScannerLifecycle({
    getElementById: (id) => elements.get(id),
    createScanner: () => {},
    connectToSender: () => {},
    showNotification: () => {}
  });

  lifecycle.updateP2PProgress(42.6, 'Receiving');

  assert.equal(elements.get('p2p-progress-bar').style.width, '42.6%');
  assert.equal(elements.get('p2p-percentage').textContent, '43%');
  assert.equal(elements.get('p2p-status-text').textContent, 'Receiving');

  assert.throws(() => createP2PScannerLifecycle({
    getElementById: () => null,
    createScanner: () => {},
    connectToSender: () => {},
    showNotification: () => {}
  }).updateP2PProgress(10, 'Missing'), TypeError);
});

test('starts the scanner, normalizes decoded codes, and preserves the connect handoff', async () => {
  const elements = createElements();
  const calls = [];
  let successHandler;
  const scanner = {
    start(camera, config, onSuccess) {
      calls.push(['start', camera, config]);
      successHandler = onSuccess;
      return Promise.resolve();
    },
    stop() {
      calls.push(['stop']);
      return Promise.resolve();
    }
  };
  const lifecycle = createP2PScannerLifecycle({
    getElementById: (id) => elements.get(id),
    createScanner: (elementId) => {
      calls.push(['create', elementId]);
      return scanner;
    },
    connectToSender: (code) => calls.push(['connect', code]),
    showNotification: () => {}
  });

  lifecycle.startQRScanner();
  assert.equal(elements.get('p2p-reader').classList.values.has('hidden'), false);
  successHandler('prefix-ABCDE');
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(elements.get('p2p-code-input').value, 'ABCDE');
  assert.equal(elements.get('p2p-reader').classList.values.has('hidden'), true);
  assert.deepEqual(calls, [
    ['create', 'p2p-reader'],
    ['start', { facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }],
    ['stop'],
    ['connect', 'ABCDE']
  ]);
});

test('closing the scanner while decoded stop is pending cancels the connect handoff', async () => {
  const elements = createElements();
  const stopResult = deferred();
  const connected = [];
  let successHandler;
  let stopCalls = 0;
  const lifecycle = createP2PScannerLifecycle({
    getElementById: id => elements.get(id),
    createScanner: () => ({
      start: (_camera, _config, onSuccess) => {
        successHandler = onSuccess;
        return Promise.resolve();
      },
      stop: () => {
        stopCalls += 1;
        return stopResult.promise;
      }
    }),
    connectToSender: code => connected.push(code),
    showNotification: () => {}
  });

  lifecycle.startQRScanner();
  successHandler('ABCDE');
  successHandler('FGHIJ');
  await Promise.resolve();
  assert.equal(stopCalls, 1, 'only the first decoded frame may start scanner cleanup');

  lifecycle.stopScannerIfActive();
  stopResult.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(connected, []);
});

test('scanner cleanup always stops the latest active instance without stale state', async () => {
  const elements = createElements();
  const stopped = [];
  let scannerId = 0;
  const lifecycle = createP2PScannerLifecycle({
    getElementById: (id) => elements.get(id),
    createScanner: () => {
      scannerId += 1;
      const id = scannerId;
      return {
        start: () => Promise.resolve(),
        stop: () => {
          stopped.push(id);
          return Promise.resolve();
        }
      };
    },
    connectToSender: () => {},
    showNotification: () => {}
  });

  lifecycle.startQRScanner();
  lifecycle.stopScannerIfActive();
  await Promise.resolve();
  lifecycle.startQRScanner();
  lifecycle.stopScannerIfActive();
  lifecycle.stopScannerIfActive();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(stopped, [1, 2, 1, 2]);
});

test('a scanner cancelled while start is pending is stopped again after startup completes', async () => {
  const elements = createElements();
  const started = deferred();
  let stopCalls = 0;
  const lifecycle = createP2PScannerLifecycle({
    getElementById: (id) => elements.get(id),
    createScanner: () => ({
      start: () => started.promise,
      stop: async () => {
        stopCalls += 1;
      }
    }),
    connectToSender: () => {},
    showNotification: () => {}
  });

  const startPromise = lifecycle.startQRScanner();
  lifecycle.stopScannerIfActive();
  assert.equal(stopCalls, 1);

  started.resolve();
  await startPromise;
  assert.equal(stopCalls, 2);
});

test('scanner start failures preserve logging and notification handoffs', async () => {
  const elements = createElements();
  const calls = [];
  const error = new Error('permission denied');
  const lifecycle = createP2PScannerLifecycle({
    getElementById: (id) => elements.get(id),
    createScanner: () => ({
      start: () => Promise.reject(error),
      stop: () => Promise.resolve()
    }),
    connectToSender: () => {},
    showNotification: (...args) => calls.push(['notify', ...args]),
    logger: {
      error: (value) => calls.push(['error', value])
    }
  });

  lifecycle.startQRScanner();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls, [
    ['error', error],
    ['notify', 'Cannot start camera, please check permissions.', 'error']
  ]);
});

test('P2P scanner lifecycle source avoids unrelated runtime systems', () => {
  const source = readSource('src/app/legacy-runtime/features/p2p-scanner-lifecycle.js');

  for (const forbidden of [
    'streamApiCall',
    'indexedDB',
    'package.json',
    'vite.config',
    'DOMPurify',
    'marked',
    'katex',
    'new Peer'
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
  }
});
