import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSensitiveConfigPersistence,
  createSensitiveConfigStore,
  normalizeProviderKey
} from '../../src/app/runtime/security/sensitive-config-store.js';

test('exports sensitive config store helpers and normalizes provider aliases', () => {
  assert.equal(typeof createSensitiveConfigStore, 'function');
  assert.equal(typeof createSensitiveConfigPersistence, 'function');
  assert.equal(normalizeProviderKey('gemini'), 'gemini');
  assert.equal(normalizeProviderKey('openrouter'), 'openrouter');
  assert.equal(normalizeProviderKey('nvidia'), 'nvidia');
  assert.equal(normalizeProviderKey('tavily'), 'tavily');
});

test('store reads, writes, merges, replaces, clears, and protects external mutation', () => {
  const store = createSensitiveConfigStore({
    initialApiKeys: {
      gemini: ' gemini-key ',
      nvidia: ' nvidia-key '
    }
  });

  assert.equal(store.getApiKey('gemini'), 'gemini-key');
  assert.equal(store.getApiKey('nvidia'), 'nvidia-key');

  store.setApiKey('openrouter', ' sk-or-key ');
  assert.equal(store.getApiKey('openrouter'), 'sk-or-key');

  store.mergeApiKeys({ nvidia: ' nvapi-key ' });
  assert.equal(store.getApiKey('gemini'), 'gemini-key');
  assert.equal(store.getApiKey('nvidia'), 'nvapi-key');

  const copy = store.getApiKeys();
  copy.gemini = 'mutated-outside';
  assert.equal(store.getApiKey('gemini'), 'gemini-key');

  store.replaceApiKeys({ tavily: ' tvly-key ' });
  assert.equal(store.getApiKey('gemini'), '');
  assert.equal(store.getApiKey('tavily'), 'tvly-key');

  store.clearApiKeys();
  assert.deepEqual(store.getApiKeys(), {
    gemini: '',
    openrouter: '',
    nvidia: '',
    tavily: ''
  });
});
