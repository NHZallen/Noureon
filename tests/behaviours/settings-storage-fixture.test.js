import assert from 'node:assert/strict';
import test from 'node:test';

const createAsyncKeyValueStorage = () => {
  const values = new Map();

  return {
    async getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    }
  };
};

test('settings storage fixture preserves async string key-value behaviour', async () => {
  // V3 Phase 5 harness-level settings storage fake fixture proof. This
  // establishes the async key-value storage fake pattern. It is not a
  // production IndexedDB adapter test, and it is not a production
  // saveSettings/saveConfig/loadConfig test. Production settings/storage still
  // lives in the legacy runtime closure. API keys, DOM settings modal,
  // IndexedDB adapter, and theme/language side effects are left for later
  // small slices.
  const storage = createAsyncKeyValueStorage();
  const configKey = 'chatConfig_v_v8.6_test-user';
  const firstConfig = {
    theme: 'light',
    uiLanguage: 'zh-TW',
    outputMode: 'typewriter',
    defaultModel: 'astra-flash'
  };
  const nextConfig = {
    theme: 'dark',
    uiLanguage: 'en',
    outputMode: 'realtime',
    defaultModel: 'astra-pro'
  };

  assert.equal(await storage.getItem(configKey), null);

  await storage.setItem(configKey, JSON.stringify(firstConfig));
  assert.equal(await storage.getItem(configKey), JSON.stringify(firstConfig));
  assert.deepEqual(JSON.parse(await storage.getItem(configKey)), firstConfig);

  await storage.setItem(configKey, JSON.stringify(nextConfig));
  assert.equal(await storage.getItem(configKey), JSON.stringify(nextConfig));
  assert.deepEqual(JSON.parse(await storage.getItem(configKey)), nextConfig);

  await storage.removeItem(configKey);
  assert.equal(await storage.getItem(configKey), null);
});
