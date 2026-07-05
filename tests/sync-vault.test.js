import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  changeSyncVaultPassword,
  createAndUnlockSyncVault,
  createSyncVaultRecord,
  decryptSyncVaultPayload,
  encryptSyncVaultPayload,
  getSyncVaultStorageKey,
  getUnlockedSyncVaultKey,
  isSyncVaultUnlocked,
  lockSyncVault,
  migrateSyncVaultRecord,
  readSyncVaultRecord,
  removeSyncVault,
  syncVaultPolicy,
  takePreviousSyncVaultKey,
  unlockSyncVault,
  unlockSyncVaultRecord
} from '../src/app/sync/sync-vault.js';

function createStorage() {
  const values = new Map();
  return {
    values,
    getItem: async key => values.get(key) || null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key)
  };
}

test('sync vault stores only a salted encrypted verifier and rejects a wrong password', async () => {
  const password = 'correct horse battery staple';
  const { record } = await createSyncVaultRecord(password, { cryptoProvider: webcrypto });

  assert.equal(record.version, 1);
  assert.equal(record.algorithm, 'AES-GCM');
  assert.equal(record.kdf, 'PBKDF2-SHA-256');
  assert.equal(record.iterations, syncVaultPolicy.iterations);
  assert.equal('password' in record, false);
  assert.equal(JSON.stringify(record).includes(password), false);
  assert.ok(await unlockSyncVaultRecord(password, record, { cryptoProvider: webcrypto }));
  await assert.rejects(
    () => unlockSyncVaultRecord('wrong password value', record, { cryptoProvider: webcrypto }),
    /Incorrect sync vault password/
  );
});

test('sync vault supports create lock unlock change migration and removal for every username type', async () => {
  const storage = createStorage();
  const localUsername = 'local-user';
  const cloudUsername = 'supabase:user-123';
  const firstPassword = 'first vault password';
  const nextPassword = 'second vault password';

  await createAndUnlockSyncVault({
    storage,
    username: localUsername,
    password: firstPassword,
    cryptoProvider: webcrypto
  });
  assert.equal(isSyncVaultUnlocked(localUsername), true);
  assert.ok(await readSyncVaultRecord(storage, localUsername));

  lockSyncVault(localUsername);
  assert.equal(isSyncVaultUnlocked(localUsername), false);
  await unlockSyncVault({ storage, username: localUsername, password: firstPassword, cryptoProvider: webcrypto });
  assert.equal(isSyncVaultUnlocked(localUsername), true);

  await changeSyncVaultPassword({
    storage,
    username: localUsername,
    currentPassword: firstPassword,
    nextPassword,
    cryptoProvider: webcrypto
  });
  lockSyncVault(localUsername);
  await assert.rejects(
    () => unlockSyncVault({ storage, username: localUsername, password: firstPassword, cryptoProvider: webcrypto }),
    /Incorrect sync vault password/
  );
  await unlockSyncVault({ storage, username: localUsername, password: nextPassword, cryptoProvider: webcrypto });

  assert.equal(await migrateSyncVaultRecord({ storage, fromUsername: localUsername, toUsername: cloudUsername }), true);
  assert.ok(storage.values.has(getSyncVaultStorageKey(cloudUsername)));
  assert.equal(isSyncVaultUnlocked(cloudUsername), true);

  await removeSyncVault({ storage, username: cloudUsername });
  assert.equal(await readSyncVaultRecord(storage, cloudUsername), null);
  assert.equal(isSyncVaultUnlocked(cloudUsername), false);
});

test('sync vault enforces a meaningful minimum password length', async () => {
  await assert.rejects(
    () => createSyncVaultRecord('short', { cryptoProvider: webcrypto }),
    new RegExp(`at least ${syncVaultPolicy.minimumPasswordLength}`)
  );
});

test('sync vault encrypts and decrypts private cloud payloads without exposing plaintext', async () => {
  const { key } = await createSyncVaultRecord('payload encryption password', { cryptoProvider: webcrypto });
  const payload = { apiKeys: { gemini: 'secret-api-key' } };
  const encrypted = await encryptSyncVaultPayload(payload, key, { cryptoProvider: webcrypto });

  assert.equal(encrypted.algorithm, 'AES-GCM');
  assert.equal(JSON.stringify(encrypted).includes('secret-api-key'), false);
  assert.deepEqual(
    await decryptSyncVaultPayload(encrypted, key, { cryptoProvider: webcrypto }),
    payload
  );
});

test('changing the sync password exposes the previous key exactly once for cloud re-encryption', async () => {
  const storage = createStorage();
  const username = 'supabase:rotation-user';
  await createAndUnlockSyncVault({
    storage,
    username,
    password: 'old encryption password',
    cryptoProvider: webcrypto
  });
  const encrypted = await encryptSyncVaultPayload(
    { apiKeys: { tavily: 'preserved-secret' } },
    getUnlockedSyncVaultKey(username),
    { cryptoProvider: webcrypto }
  );
  await changeSyncVaultPassword({
    storage,
    username,
    currentPassword: 'old encryption password',
    nextPassword: 'new encryption password',
    cryptoProvider: webcrypto
  });

  const previousKey = takePreviousSyncVaultKey(username);
  assert.deepEqual(
    await decryptSyncVaultPayload(encrypted, previousKey, { cryptoProvider: webcrypto }),
    { apiKeys: { tavily: 'preserved-secret' } }
  );
  assert.equal(takePreviousSyncVaultKey(username), null);
});
