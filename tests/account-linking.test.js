import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PENDING_CLOUD_LINK_KEY,
  completePendingCloudAccountLink,
  markPendingCloudAccountLink
} from '../src/app/auth/account-linking.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    values,
    calls,
    getItem: async key => values.has(key) ? values.get(key) : null,
    setItem: async (key, value) => {
      calls.push(['setItem', key]);
      values.set(key, value);
    },
    removeItem: async key => {
      calls.push(['removeItem', key]);
      values.delete(key);
    },
    getKeys: async () => Array.from(values.keys()),
    removeItemsByPrefix: async prefix => {
      calls.push(['removeItemsByPrefix', prefix]);
      for (const key of Array.from(values.keys())) {
        if (String(key).startsWith(prefix)) values.delete(key);
      }
    }
  };
}

test('pending cloud account link migrates the complete local workspace to the cloud namespace', async () => {
  const storage = createStorage({
    'chatConfig_v_v8.6_alice': '{"theme":"dark"}',
    'chatAppData_v8.6_alice': JSON.stringify({
      conversations: [{ id: '1', messages: [{ parts: [{ generatedImage: {
        id: 'image-1', storageKey: 'generatedImage:alice:image-1', mediaType: 'image/png'
      } }] }] }]
    }),
    'chatSensitiveConfig_v1_alice': '{"apiKeys":{"gemini":"secret"}}',
    'chatSensitiveConfigKey_v2_alice': { algorithm: { name: 'AES-GCM' }, extractable: false },
    'chatSensitiveConfigCiphertext_v2_alice': '{"version":2,"ciphertext":"opaque"}',
    'generatedImage:alice:image-1': new Blob(['image'])
  });
  await markPendingCloudAccountLink(storage, { username: 'alice' });

  const completed = await completePendingCloudAccountLink({
    storage,
    cloudUserRecord: {
      username: 'supabase:user-123',
      email: 'alice@example.com',
      authProvider: 'supabase'
    }
  });

  assert.equal(completed, true);
  assert.equal(storage.values.get('chatConfig_v_v8.6_supabase:user-123'), '{"theme":"dark"}');
  const migratedAppData = JSON.parse(storage.values.get('chatAppData_v8.6_supabase:user-123'));
  assert.equal(
    migratedAppData.conversations[0].messages[0].parts[0].generatedImage.storageKey,
    'generatedImage:supabase:user-123:image-1'
  );
  assert.equal(storage.values.has('chatSensitiveConfig_v1_supabase:user-123'), false);
  assert.equal(storage.values.get('chatSensitiveConfigKey_v2_supabase:user-123').extractable, false);
  assert.equal(
    storage.values.get('chatSensitiveConfigCiphertext_v2_supabase:user-123'),
    '{"version":2,"ciphertext":"opaque"}'
  );
  assert.ok(storage.values.get('generatedImage:supabase:user-123:image-1') instanceof Blob);
  assert.equal(storage.values.has('chatConfig_v_v8.6_alice'), false);
  assert.equal(storage.values.get('chat_storageOwnerUser'), 'supabase:user-123');
  assert.equal(storage.values.get('chat_lastUser'), 'supabase:user-123');
  assert.equal(storage.values.has(PENDING_CLOUD_LINK_KEY), false);
});

test('cloud users cannot be marked as a pending local account link', async () => {
  await assert.rejects(
    () => markPendingCloudAccountLink(createStorage(), { username: 'supabase:1', authProvider: 'supabase' }),
    /local user/
  );
});
