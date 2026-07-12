import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPersistentApiKeyEncryptionKey,
  decryptPersistentApiKeys,
  encryptPersistentApiKeys
} from '../../src/app/runtime/security/persistent-api-key-encryption.js';

test('persistent API keys use a non-extractable browser key and authenticated ciphertext', async () => {
  const key = await createPersistentApiKeyEncryptionKey();
  const apiKeys = { gemini: 'secret-gemini-key', openrouter: 'secret-openrouter-key' };
  const encrypted = await encryptPersistentApiKeys(apiKeys, key);

  assert.equal(key.extractable, false);
  assert.equal(key.algorithm.name, 'AES-GCM');
  assert.equal(encrypted.includes(apiKeys.gemini), false);
  assert.equal(encrypted.includes(apiKeys.openrouter), false);
  assert.deepEqual(await decryptPersistentApiKeys(encrypted, key), apiKeys);
});

test('persistent API key ciphertext rejects the wrong browser key and tampering', async () => {
  const key = await createPersistentApiKeyEncryptionKey();
  const wrongKey = await createPersistentApiKeyEncryptionKey();
  const encrypted = await encryptPersistentApiKeys({ tavily: 'secret' }, key);

  await assert.rejects(decryptPersistentApiKeys(encrypted, wrongKey));
  const tampered = JSON.parse(encrypted);
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -1)}A`;
  await assert.rejects(decryptPersistentApiKeys(JSON.stringify(tampered), key));
});
