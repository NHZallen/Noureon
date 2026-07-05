import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  changeSyncVaultPassword,
  createAndUnlockSyncVault,
  createSyncVaultRecord,
  getSyncVaultStorageKey,
  isSyncVaultUnlocked,
  lockSyncVault,
  migrateSyncVaultRecord,
  readSyncVaultRecord,
  removeSyncVault,
  syncVaultPolicy,
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
