import assert from 'node:assert/strict';
import test from 'node:test';

import { repairGeneratedImageStorageKeys } from '../src/app/sync/generated-image-key-repair.js';

test('generated image key repair finds a migrated cloud blob and updates stale descriptors', async () => {
  const expectedKey = 'generatedImage:supabase:user-1:image-1';
  const values = new Map([[expectedKey, new Blob(['image'])]]);
  const value = { messages: [{ parts: [{ generatedImage: {
    id: 'image-1', storageKey: 'generatedImage:local-user:image-1'
  } }] }] };
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, next) => values.set(key, next)
  };

  assert.equal(await repairGeneratedImageStorageKeys({
    value,
    storage,
    username: 'supabase:user-1'
  }), true);
  assert.equal(value.messages[0].parts[0].generatedImage.storageKey, expectedKey);
});
