import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSensitiveConfigPersistence,
  createSensitiveConfigStore
} from '../src/app/runtime/security/sensitive-config-store.js';

test('sensitive config persistence uses the user-scoped sensitive key and apiKeys payload only', async () => {
  const writes = new Map();
  const store = createSensitiveConfigStore({
    initialApiKeys: { gemini: 'gemini-key', openrouter: 'openrouter-key' }
  });
  const persistence = createSensitiveConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getItem: async (key) => writes.get(key) ?? null,
    setItem: async (key, value) => writes.set(key, value),
    removeItem: async (key) => writes.delete(key),
    getApiKeys: store.getApiKeys,
    replaceApiKeys: store.replaceApiKeys
  });

  assert.equal(persistence.getSensitiveConfigKey(), 'chatSensitiveConfig_v1_alice');

  await persistence.saveSensitiveConfig();
  const saved = JSON.parse(writes.get('chatSensitiveConfig_v1_alice'));
  assert.deepEqual(saved, { apiKeys: store.getApiKeys() });
  assert.equal('theme' in saved, false);
  assert.equal('settings' in saved, false);

  store.clearApiKeys();
  await persistence.loadSensitiveConfig();
  assert.equal(store.getApiKey('gemini'), 'gemini-key');
  assert.equal(store.getApiKey('openrouter'), 'openrouter-key');

  await persistence.clearSensitiveConfig();
  assert.equal(writes.has('chatSensitiveConfig_v1_alice'), false);
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

test('sensitive config writes and removals mark cloud sync on both sides of storage', async () => {
  const order = [];
  const store = createSensitiveConfigStore({ initialApiKeys: { gemini: 'secret' } });
  const persistence = createSensitiveConfigPersistence({
    getCurrentUser: () => ({ username: 'alice' }),
    getItem: async () => null,
    setItem: async () => {
      order.push('write');
    },
    removeItem: async () => {
      order.push('remove');
    },
    getApiKeys: store.getApiKeys,
    replaceApiKeys: store.replaceApiKeys,
    onSaved: async () => {
      order.push('mark');
    }
  });

  await persistence.saveSensitiveConfig();
  assert.deepEqual(order, ['mark', 'write', 'mark']);

  order.length = 0;
  await persistence.clearSensitiveConfig();
  assert.deepEqual(order, ['mark', 'remove', 'mark']);
});
