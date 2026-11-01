import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createRuntimeAppKernel } from '../src/app/runtime-app.js';
import { createRuntimeDomRegistry } from '../src/app/runtime/kernel/dom-registry.js';

const hashJson = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('DOM registry preserves the complete legacy key and element id order', () => {
  const requestedIds = [];
  const rootDocument = {
    getElementById(id) {
      requestedIds.push(id);
      return { id };
    }
  };

  const registry = createRuntimeDomRegistry(rootDocument);
  const keys = Object.keys(registry);

  assert.equal(keys.length, 209);
  assert.equal(requestedIds.length, 209);
  assert.equal(hashJson(keys), 'f3ebf691edd097c3000a67bc7e20bb4cf95432e3748fe4aa86d70a4e8dac2ad6');
  assert.equal(hashJson(requestedIds), '54d28c8494d3a3abe2d52e0e15a5a63266840e9c0057aa8c4a77e1b77e4bc94b');
  assert.deepEqual(registry.authContainer, { id: 'auth-container' });
  assert.deepEqual(registry.messageInput, { id: 'message-input' });
  assert.deepEqual(registry.expandInputButton, { id: 'expand-input-btn' });
  assert.deepEqual(registry.importPercentageAuth, { id: 'import-percentage-auth' });
});

test('DOM registry uses the injected document and preserves missing element nulls', () => {
  const requestedIds = [];
  const rootDocument = {
    getElementById(id) {
      requestedIds.push(id);
      return id === 'settings-btn' ? null : { id };
    }
  };

  const registry = createRuntimeDomRegistry(rootDocument);

  assert.equal(registry.settingsBtn, null);
  assert.equal(requestedIds[0], 'auth-container');
  assert.equal(requestedIds.at(-1), 'import-percentage-auth');
});

test('runtime app kernel exposes the registry without starting the app', () => {
  const rootDocument = {
    getElementById: (id) => ({ id })
  };

  const kernel = createRuntimeAppKernel({ rootDocument });

  assert.deepEqual(kernel.elements.openStoreBtn, { id: 'open-store-btn' });
  assert.deepEqual(Object.keys(kernel), ['elements', 'configStore', 'appDataStore']);
});

test('runtime app kernel reuses provided elements without another DOM lookup', () => {
  const elements = { authContainer: { id: 'existing-auth-container' } };
  const rootDocument = {
    getElementById: () => assert.fail('provided elements should avoid DOM registry creation')
  };

  const kernel = createRuntimeAppKernel({ elements, rootDocument });

  assert.equal(kernel.elements, elements);
});

// Making the registry or the kernel only looks elements up: no listener, no query, no change to the page.
test('the DOM registry and the kernel touch nothing of the document but getElementById', () => {
  const touched = new Set();
  const element = new Proxy({}, { get: (_target, prop) => assert.fail(`an element was read: ${String(prop)}`) });
  const rootDocument = new Proxy({}, {
    get(_target, prop) {
      touched.add(prop);
      return prop === 'getElementById' ? () => element : undefined;
    }
  });

  createRuntimeDomRegistry(rootDocument);
  createRuntimeAppKernel({ rootDocument });

  assert.deepEqual([...touched], ['getElementById']);
});
