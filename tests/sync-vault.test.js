import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { SERVICES, getService, provideService, withdrawService } from '../src/app/runtime/services.js';

import {
  cancelSyncVaultRotation,
  changeSyncVaultPassword,
  createAndUnlockSyncVault,
  createLegacySyncVaultRecord,
  createSyncVaultRecord,
  decryptSyncVaultPayload,
  encryptSyncVaultPayload,
  getSyncVaultStorageKey,
  getSyncVaultRotationStorageKey,
  getUnlockedSyncVaultKey,
  isSyncVaultUnlocked,
  lockSyncVault,
  migrateSyncVaultRecord,
  readSyncVaultRecord,
  forgetRememberedSyncVault,
  getRememberedSyncVaultStorageKey,
  removeSyncVault,
  restoreRememberedSyncVault,
  setSyncVaultRememberPolicy,
  syncVaultPolicy,
  takePreviousSyncVaultKey,
  openSyncVaultRecordKeyBytes,
  resetSyncVaultPasswordWithKeyBytes,
  unlockSyncVault,
  unlockSyncVaultRecord,
  unlockSyncVaultWithKeyBytes,
  verifySyncVaultKeyBytes
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

  assert.equal(record.version, 2);
  assert.equal(record.algorithm, 'AES-GCM');
  assert.ok(record.wrappedKey, 'the data key is kept wrapped by the password, never in the clear');
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

test('changing the sync password wraps the same data key again: what was encrypted stays readable and nothing is rotated', async () => {
  const storage = createStorage();
  const username = 'supabase:rotation-user';
  await createAndUnlockSyncVault({ storage, username, password: 'old encryption password', cryptoProvider: webcrypto });
  const encrypted = await encryptSyncVaultPayload({ apiKeys: { tavily: 'preserved-secret' } }, getUnlockedSyncVaultKey(username), { cryptoProvider: webcrypto });
  const before = await readSyncVaultRecord(storage, username);
  await changeSyncVaultPassword({ storage, username, currentPassword: 'old encryption password', nextPassword: 'new encryption password', cryptoProvider: webcrypto });
  const after = await readSyncVaultRecord(storage, username);

  assert.notEqual(after.wrappedKey, before.wrappedKey);
  assert.notEqual(after.salt, before.salt);
  assert.equal(storage.values.has(getSyncVaultRotationStorageKey(username)), false, 'no rotation: the data key did not change');
  assert.equal(takePreviousSyncVaultKey(username), null);
  assert.deepEqual(await decryptSyncVaultPayload(encrypted, getUnlockedSyncVaultKey(username), { cryptoProvider: webcrypto }), { apiKeys: { tavily: 'preserved-secret' } });
  lockSyncVault(username);
  await assert.rejects(() => unlockSyncVault({ storage, username, password: 'old encryption password', cryptoProvider: webcrypto }), /Incorrect sync vault password/);
  await unlockSyncVault({ storage, username, password: 'new encryption password', cryptoProvider: webcrypto });
  assert.deepEqual(await decryptSyncVaultPayload(encrypted, getUnlockedSyncVaultKey(username), { cryptoProvider: webcrypto }), { apiKeys: { tavily: 'preserved-secret' } });
  await cancelSyncVaultRotation({ storage, username });
});

test('a vault of version 1 is turned into version 2 when it is opened with its password: the same data key, the old record kept, what was encrypted before still opens', async () => {
  const storage = createStorage();
  const username = 'supabase:legacy-user';
  const password = 'legacy vault password';
  const { record: legacy, key: legacyKey } = await createLegacySyncVaultRecord(password, { cryptoProvider: webcrypto });
  const encrypted = await encryptSyncVaultPayload({ apiKeys: { gemini: 'from-the-old-days' } }, legacyKey, { cryptoProvider: webcrypto });
  await storage.setItem(getSyncVaultStorageKey(username), JSON.stringify(legacy));

  await assert.rejects(() => unlockSyncVault({ storage, username, password: 'not the password', cryptoProvider: webcrypto }), /Incorrect sync vault password/);
  assert.equal((await readSyncVaultRecord(storage, username)).version, 1, 'a wrong password changes nothing');

  await unlockSyncVault({ storage, username, password, cryptoProvider: webcrypto });
  const upgraded = await readSyncVaultRecord(storage, username);
  assert.equal(upgraded.version, 2);
  assert.notEqual(upgraded.salt, legacy.salt);
  assert.deepEqual(JSON.parse(storage.values.get(`chatSyncVaultV1Backup_v1_${username}`)), legacy);
  assert.deepEqual(await decryptSyncVaultPayload(encrypted, getUnlockedSyncVaultKey(username), { cryptoProvider: webcrypto }), { apiKeys: { gemini: 'from-the-old-days' } });

  // The same password opens either record, and a backup file made with the old record still opens with the key of the new one.
  assert.deepEqual(await decryptSyncVaultPayload(encrypted, await unlockSyncVaultRecord(password, upgraded, { cryptoProvider: webcrypto }), { cryptoProvider: webcrypto }), { apiKeys: { gemini: 'from-the-old-days' } });
  assert.deepEqual(await decryptSyncVaultPayload(encrypted, await unlockSyncVaultRecord(password, legacy, { cryptoProvider: webcrypto }), { cryptoProvider: webcrypto }), { apiKeys: { gemini: 'from-the-old-days' } });
  await removeSyncVault({ storage, username });
  assert.equal(storage.values.has(`chatSyncVaultV1Backup_v1_${username}`), false, 'clearing the vault clears the kept record too');
});

test('changing the password of a vault of version 1 upgrades it on the way, and the data key stays', async () => {
  const storage = createStorage();
  const username = 'supabase:legacy-change';
  const { record: legacy, key: legacyKey } = await createLegacySyncVaultRecord('legacy first password', { cryptoProvider: webcrypto });
  const encrypted = await encryptSyncVaultPayload({ apiKeys: { a: 'kept' } }, legacyKey, { cryptoProvider: webcrypto });
  await storage.setItem(getSyncVaultStorageKey(username), JSON.stringify(legacy));
  await changeSyncVaultPassword({ storage, username, currentPassword: 'legacy first password', nextPassword: 'legacy second password', cryptoProvider: webcrypto });
  assert.equal((await readSyncVaultRecord(storage, username)).version, 2);
  assert.deepEqual(await decryptSyncVaultPayload(encrypted, getUnlockedSyncVaultKey(username), { cryptoProvider: webcrypto }), { apiKeys: { a: 'kept' } });
});

test('the data key itself (what a passkey keeps) opens the vault only when it is the key of the record, and a forgotten password is replaced with it', async () => {
  const storage = createStorage();
  const username = 'supabase:key-user';
  await createAndUnlockSyncVault({ storage, username, password: 'the first password', cryptoProvider: webcrypto });
  const record = await readSyncVaultRecord(storage, username);
  const encrypted = await encryptSyncVaultPayload({ apiKeys: { b: 'secret' } }, getUnlockedSyncVaultKey(username), { cryptoProvider: webcrypto });
  const keyBytes = await openSyncVaultRecordKeyBytes('the first password', record, { cryptoProvider: webcrypto });
  assert.equal(keyBytes.length, 32);
  assert.equal(await verifySyncVaultKeyBytes(record, keyBytes, { cryptoProvider: webcrypto }), true);
  assert.equal(await verifySyncVaultKeyBytes(record, new Uint8Array(32), { cryptoProvider: webcrypto }), false);

  lockSyncVault(username);
  await assert.rejects(() => unlockSyncVaultWithKeyBytes({ storage, username, keyBytes: new Uint8Array(32), cryptoProvider: webcrypto }), { code: 'vault-key-mismatch' });
  assert.equal(isSyncVaultUnlocked(username), false);
  await unlockSyncVaultWithKeyBytes({ storage, username, keyBytes, cryptoProvider: webcrypto });
  assert.deepEqual(await decryptSyncVaultPayload(encrypted, getUnlockedSyncVaultKey(username), { cryptoProvider: webcrypto }), { apiKeys: { b: 'secret' } });

  // The password is forgotten: the key from the passkey is wrapped by a new one, and the old one no longer works.
  lockSyncVault(username);
  await resetSyncVaultPasswordWithKeyBytes({ storage, username, keyBytes, nextPassword: 'a brand new password', cryptoProvider: webcrypto });
  lockSyncVault(username);
  await assert.rejects(() => unlockSyncVault({ storage, username, password: 'the first password', cryptoProvider: webcrypto }), /Incorrect sync vault password/);
  await unlockSyncVault({ storage, username, password: 'a brand new password', cryptoProvider: webcrypto });
  assert.deepEqual(await decryptSyncVaultPayload(encrypted, getUnlockedSyncVaultKey(username), { cryptoProvider: webcrypto }), { apiKeys: { b: 'secret' } });
});

test('sync vault creation and removal mark cloud sync before and after storage mutation', async () => {
  const previousSync = getService(SERVICES.workspaceSync);
  const order = [];
  const storage = {
    getItem: async () => null,
    setItem: async () => {
      order.push('write');
    },
    removeItem: async () => {
      order.push('remove');
    }
  };
  const sync = provideService(SERVICES.workspaceSync, {
    queueLocalChange: async kind => {
      order.push(`mark:${kind}`);
    }
  });

  try {
    await createAndUnlockSyncVault({
      storage,
      username: 'supabase:ordered-vault',
      password: 'ordered vault password',
      cryptoProvider: webcrypto
    });
    assert.deepEqual(order, ['mark:vault', 'write', 'mark:vault', 'write'], 'the last write is the unlock this device remembers');

    order.length = 0;
    await removeSyncVault({ storage, username: 'supabase:ordered-vault' });
    assert.deepEqual(order, ['mark:vault', 'remove', 'remove', 'remove', 'remove', 'mark:vault'], 'the record, the rotation, the backup and the remembered unlock');
  } finally {
    if (previousSync) provideService(SERVICES.workspaceSync, previousSync);
    else withdrawService(SERVICES.workspaceSync, sync);
  }
});

// The unlock this device remembers (until lock, sign-out or removal), so a new visit does not ask for the sync password again.
const REMEMBER_USER = 'supabase:remembered';
test('an unlock is remembered on this device and opens the vault again in a new visit, until it is locked', async () => {
  const storage = createStorage();
  await createAndUnlockSyncVault({ storage, username: REMEMBER_USER, password: 'a remembered password', cryptoProvider: webcrypto });
  assert.ok(storage.values.get(getRememberedSyncVaultStorageKey(REMEMBER_USER)), 'the data key is kept (the storage seals it)');

  lockSyncVault(REMEMBER_USER); // a reload: the memory is gone, what the device keeps is not
  assert.equal(isSyncVaultUnlocked(REMEMBER_USER), false);
  assert.equal(await restoreRememberedSyncVault({ storage, username: REMEMBER_USER, cryptoProvider: webcrypto }), true);
  assert.equal(isSyncVaultUnlocked(REMEMBER_USER), true);
  const payload = await encryptSyncVaultPayload({ apiKeys: { gemini: 'k' } }, getUnlockedSyncVaultKey(REMEMBER_USER));
  assert.deepEqual(await decryptSyncVaultPayload(payload, getUnlockedSyncVaultKey(REMEMBER_USER)), { apiKeys: { gemini: 'k' } });

  lockSyncVault(REMEMBER_USER, { storage });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(storage.values.has(getRememberedSyncVaultStorageKey(REMEMBER_USER)), false, 'locking forgets it');
  assert.equal(await restoreRememberedSyncVault({ storage, username: REMEMBER_USER, cryptoProvider: webcrypto }), false);
  await removeSyncVault({ storage, username: REMEMBER_USER });
});

test('every way of opening the vault remembers the unlock: the password, the data key of a passkey, a changed password', async () => {
  const storage = createStorage();
  const keyOf = () => storage.values.get(getRememberedSyncVaultStorageKey(REMEMBER_USER));
  await createAndUnlockSyncVault({ storage, username: REMEMBER_USER, password: 'first password 123', cryptoProvider: webcrypto });
  const first = keyOf();
  await forgetRememberedSyncVault({ storage, username: REMEMBER_USER });
  lockSyncVault(REMEMBER_USER);

  await unlockSyncVault({ storage, username: REMEMBER_USER, password: 'first password 123', cryptoProvider: webcrypto });
  assert.equal(keyOf(), first, 'the same data key');
  await forgetRememberedSyncVault({ storage, username: REMEMBER_USER });
  await unlockSyncVaultWithKeyBytes({ storage, username: REMEMBER_USER, keyBytes: await openSyncVaultRecordKeyBytes('first password 123', await readSyncVaultRecord(storage, REMEMBER_USER)), cryptoProvider: webcrypto });
  assert.equal(keyOf(), first);
  await forgetRememberedSyncVault({ storage, username: REMEMBER_USER });
  await changeSyncVaultPassword({ storage, username: REMEMBER_USER, currentPassword: 'first password 123', nextPassword: 'second password 123', cryptoProvider: webcrypto });
  assert.equal(keyOf(), first, 'a new password wraps the same data key');
  await removeSyncVault({ storage, username: REMEMBER_USER });
  assert.equal(keyOf(), undefined, 'removing the vault forgets it');
});

test('a remembered key that is not the key of the vault kept here is dropped and opens nothing', async () => {
  const storage = createStorage();
  await createAndUnlockSyncVault({ storage, username: REMEMBER_USER, password: 'a remembered password', cryptoProvider: webcrypto });
  lockSyncVault(REMEMBER_USER);
  storage.values.set(getRememberedSyncVaultStorageKey(REMEMBER_USER), JSON.stringify({ k: Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64'), exp: null }));
  assert.equal(await restoreRememberedSyncVault({ storage, username: REMEMBER_USER, cryptoProvider: webcrypto }), false);
  assert.equal(isSyncVaultUnlocked(REMEMBER_USER), false);
  assert.equal(storage.values.has(getRememberedSyncVaultStorageKey(REMEMBER_USER)), false, 'dropped');
  await removeSyncVault({ storage, username: REMEMBER_USER });
});

test('nothing is remembered where the storage cannot seal it, or where the protection with a passkey says no', async () => {
  const unsealable = { ...createStorage(), setItem: async (key) => { if (key.startsWith('chatSyncVaultRemembered_')) throw new Error('This browser cannot keep a key of its own.'); } };
  await createAndUnlockSyncVault({ storage: unsealable, username: REMEMBER_USER, password: 'a remembered password', cryptoProvider: webcrypto });
  assert.equal(isSyncVaultUnlocked(REMEMBER_USER), true, 'the vault is open for this visit all the same');
  lockSyncVault(REMEMBER_USER);

  const storage = createStorage();
  setSyncVaultRememberPolicy(() => false);
  try {
    await createAndUnlockSyncVault({ storage, username: REMEMBER_USER, password: 'a remembered password', cryptoProvider: webcrypto });
    assert.equal(storage.values.has(getRememberedSyncVaultStorageKey(REMEMBER_USER)), false);
    lockSyncVault(REMEMBER_USER);
    assert.equal(await restoreRememberedSyncVault({ storage, username: REMEMBER_USER, cryptoProvider: webcrypto }), false);
  } finally {
    setSyncVaultRememberPolicy(null);
    lockSyncVault(REMEMBER_USER);
  }
});
