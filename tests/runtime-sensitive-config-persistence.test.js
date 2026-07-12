import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSensitiveConfigPersistence,
  createSensitiveConfigStore
} from '../src/app/runtime/security/sensitive-config-store.js';

test('sensitive config persistence migrates plaintext and survives reload as browser-key ciphertext', async () => {
  const savedSnapshots = [];
  const writes = new Map([
    ['chatSensitiveConfig_v1_alice', JSON.stringify({
      apiKeys: { gemini: 'gemini-key', openrouter: 'openrouter-key' }
    })]
  ]);
  const store = createSensitiveConfigStore({
    initialApiKeys: { gemini: 'gemini-key', openrouter: 'openrouter-key' }
  });
  const persistence = createSensitiveConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getItem: async (key) => writes.get(key) ?? null,
    setItem: async (key, value) => writes.set(key, value),
    removeItem: async (key) => writes.delete(key),
    getApiKeys: store.getApiKeys,
    replaceApiKeys: store.replaceApiKeys,
    onSaved: (value) => savedSnapshots.push(value)
  });

  assert.equal(persistence.getSensitiveConfigKey(), 'chatSensitiveConfig_v1_alice');

  store.clearApiKeys();
  await persistence.loadSensitiveConfig();
  assert.equal(store.getApiKey('gemini'), 'gemini-key');
  assert.equal(store.getApiKey('openrouter'), 'openrouter-key');
  assert.equal(writes.has('chatSensitiveConfig_v1_alice'), false);
  const encryptionKey = writes.get('chatSensitiveConfigKey_v2_alice');
  const encrypted = writes.get('chatSensitiveConfigCiphertext_v2_alice');
  assert.equal(encryptionKey.extractable, false);
  assert.equal(encryptionKey.algorithm.name, 'AES-GCM');
  assert.equal(typeof encrypted, 'string');
  assert.equal(encrypted.includes('gemini-key'), false);
  assert.equal(encrypted.includes('openrouter-key'), false);

  store.setApiKey('tavily', 'session-only-key');
  await persistence.saveSensitiveConfig();
  assert.equal(store.getApiKey('tavily'), 'session-only-key');
  assert.equal(writes.has('chatSensitiveConfig_v1_alice'), false);
  assert.deepEqual(savedSnapshots, [{ apiKeys: store.getApiKeys() }]);

  const reloadedStore = createSensitiveConfigStore();
  const reloadedPersistence = createSensitiveConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getItem: async (key) => writes.get(key) ?? null,
    setItem: async (key, value) => writes.set(key, value),
    removeItem: async (key) => writes.delete(key),
    getApiKeys: reloadedStore.getApiKeys,
    replaceApiKeys: reloadedStore.replaceApiKeys
  });
  await reloadedPersistence.loadSensitiveConfig();
  assert.equal(reloadedStore.getApiKey('gemini'), 'gemini-key');
  assert.equal(reloadedStore.getApiKey('tavily'), 'session-only-key');

  await persistence.clearSensitiveConfig();
  assert.equal(writes.has('chatSensitiveConfig_v1_alice'), false);
  assert.equal(writes.has('chatSensitiveConfigKey_v2_alice'), false);
  assert.equal(writes.has('chatSensitiveConfigCiphertext_v2_alice'), false);
  assert.equal(store.getApiKey('gemini'), '');
});

test('missing user or missing sensitive config is safe', async () => {
  const store = createSensitiveConfigStore();
  const persistence = createSensitiveConfigPersistence({
    getCurrentUser: () => null,
    getItem: async () => {
      throw new Error('should not read without a user');
    },
    setItem: async () => {
      throw new Error('should not write without a user');
    },
    removeItem: async () => {
      throw new Error('should not remove without a user');
    },
    getApiKeys: store.getApiKeys,
    replaceApiKeys: store.replaceApiKeys
  });

  assert.equal(persistence.getSensitiveConfigKey(), null);
  assert.equal(await persistence.loadSensitiveConfig(), null);
  await persistence.saveSensitiveConfig();
  await persistence.clearSensitiveConfig();

  const missingPersistence = createSensitiveConfigPersistence({
    getCurrentUser: () => ({ username: 'bob' }),
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
    getApiKeys: store.getApiKeys,
    replaceApiKeys: store.replaceApiKeys
  });

  assert.equal(await missingPersistence.loadSensitiveConfig(), null);
});

test('malformed legacy sensitive config is deleted without breaking startup', async () => {
  const writes = new Map([['chatSensitiveConfig_v1_alice', '{invalid-json']]);
  const store = createSensitiveConfigStore();
  const persistence = createSensitiveConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getItem: async (key) => writes.get(key) ?? null,
    removeItem: async (key) => writes.delete(key),
    getApiKeys: store.getApiKeys,
    replaceApiKeys: store.replaceApiKeys
  });

  assert.equal(await persistence.loadSensitiveConfig(), null);
  assert.equal(writes.has('chatSensitiveConfig_v1_alice'), false);
});
