import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createRuntimeAppKernel } from '../src/app/runtime-app.js';
import { createLegacyRuntimeDomRegistry } from '../src/app/runtime/kernel/dom-registry.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hashJson = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('DOM registry preserves the complete legacy key and element id order', () => {
  const requestedIds = [];
  const rootDocument = {
    getElementById(id) {
      requestedIds.push(id);
      return { id };
    }
  };

  const registry = createLegacyRuntimeDomRegistry(rootDocument);
  const keys = Object.keys(registry);

  assert.equal(keys.length, 226);
  assert.equal(requestedIds.length, 226);
  assert.equal(hashJson(keys), '87fdbb3686c98baeb035e75a4146b619a3e587966ab2c903e5710a0975710abc');
  assert.equal(hashJson(requestedIds), 'ddef6e3d95393b276e46b79bcb03d12b8df03c2d5418d289e73b4b882728b80e');
  assert.deepEqual(registry.authContainer, { id: 'auth-container' });
  assert.deepEqual(registry.messageInput, { id: 'message-input' });
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

  const registry = createLegacyRuntimeDomRegistry(rootDocument);

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
  assert.deepEqual(Object.keys(kernel), ['elements', 'configStore']);
});

test('DOM registry module owns lookup creation only', () => {
  const source = readSource('src/app/runtime/kernel/dom-registry.js');

  assert.match(source, /export\s+function\s+createLegacyRuntimeDomRegistry/);
  assert.match(source, /rootDocument\.getElementById\(id\)/);
  assert.doesNotMatch(source, /addEventListener|removeEventListener|dispatchEvent/);
  assert.doesNotMatch(source, /\b(?:config|conversations|folders|localStorage|sessionStorage|indexedDB|fetch)\b/i);
  assert.doesNotMatch(source, /render|bootstrap|startup|resolveBinding|registerLazyBinding/i);
});

test('runtime app remains a non-live kernel seed', () => {
  const source = readSource('src/app/runtime-app.js');

  assert.match(source, /export\s+function\s+createRuntimeAppKernel/);
  assert.match(source, /createLegacyRuntimeDomRegistry\(rootDocument\)/);
  assert.doesNotMatch(source, /virtual:legacy-app-runtime|legacy-runtime\/fragments/);
  assert.doesNotMatch(source, /addEventListener|DOMContentLoaded|bootstrap\(|initChatApp|initializeApp/);
  assert.doesNotMatch(source, /document\.(?:getElementById|querySelector)|classList|innerHTML/);
});
