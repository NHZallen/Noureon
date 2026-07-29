import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HISTORY_RECALL_DEVICE_CONSENT_KEY,
  createDeviceHistoryRecallConsent,
  createDeviceHistoryRecallConsentRuntime
} from '../src/app/runtime/memory/device-history-recall-consent.js';

test('keeps history recall consent locally and can revoke it', async () => {
  const values = new Map();
  const storage = {
    getItem: async key => values.get(key) || null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key)
  };
  const consent = createDeviceHistoryRecallConsent({ storage, now: () => '2026-07-11T00:00:00.000Z' });

  assert.equal(await consent.load(), false);
  await consent.grant();
  assert.equal(consent.isGranted(), true);
  assert.deepEqual(values.get(HISTORY_RECALL_DEVICE_CONSENT_KEY), { grantedAt: '2026-07-11T00:00:00.000Z' });

  await consent.revoke();
  assert.equal(consent.isGranted(), false);
  assert.equal(values.has(HISTORY_RECALL_DEVICE_CONSENT_KEY), false);
});

test('a device that has never granted consent starts ungranted, whatever the synced config says', async () => {
  // historyRecallEnabled travels with the account config; this record does not. A freshly synced
  // device therefore loads as ungranted. The gate that consumes this is covered end-to-end in
  // tests/memory-toggle-boundaries.test.js against the real memory context provider.
  const secondDeviceStorage = new Map();
  const consent = createDeviceHistoryRecallConsent({
    storage: {
      getItem: async key => secondDeviceStorage.get(key) || null,
      setItem: async (key, value) => secondDeviceStorage.set(key, value),
      removeItem: async key => secondDeviceStorage.delete(key)
    }
  });

  assert.equal(await consent.load(), false, 'a new device must not inherit consent');
  assert.equal(consent.isGranted(), false);
  assert.equal(secondDeviceStorage.size, 0, 'nothing is written until the user grants on this device');

  await consent.grant();
  assert.equal(consent.isGranted(), true);
});

test('resolves and pins the owner namespace when consent first loads', async () => {
  const values = new Map([['consent:alice', { grantedAt: '2026-07-11T00:00:00.000Z' }]]);
  let owner = 'alice';
  const consent = createDeviceHistoryRecallConsent({
    storage: {
      getItem: async key => values.get(key) || null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async key => values.delete(key)
    },
    storageKey: () => `consent:${owner}`,
    now: () => '2026-07-12T00:00:00.000Z'
  });

  assert.equal(await consent.load(), true);
  owner = 'bob';
  await consent.grant();

  assert.deepEqual(values.get('consent:alice'), { grantedAt: '2026-07-12T00:00:00.000Z' });
  assert.equal(values.has('consent:bob'), false);
});

test('the lazy consent runtime notifies settings when loading completes', async () => {
  let loadCalls = 0;
  let loadedNotifications = 0;
  const runtime = createDeviceHistoryRecallConsentRuntime({
    storage: {
      getItem: async () => {
        loadCalls += 1;
        return null;
      },
      setItem: async () => {},
      removeItem: async () => {}
    },
    onLoaded: () => { loadedNotifications += 1; }
  });

  await Promise.all([runtime.ensureReady(), runtime.ensureReady()]);

  assert.equal(runtime.isLoaded(), true);
  assert.equal(loadCalls, 1);
  assert.equal(loadedNotifications, 1);
});
