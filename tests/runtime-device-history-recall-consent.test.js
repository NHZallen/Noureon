import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HISTORY_RECALL_DEVICE_CONSENT_KEY,
  createDeviceHistoryRecallConsent
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
