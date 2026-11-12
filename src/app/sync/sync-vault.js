import { SERVICES, getService } from '../runtime/services.js';
const VAULT_VERSION = 1; // the version of the encrypted API keys (the payload), which did not change
const LEGACY_RECORD_VERSION = 1;
const RECORD_VERSION = 2;
const VAULT_ITERATIONS = 310000;
const VAULT_MIN_PASSWORD_LENGTH = 10;
const VAULT_CHECK_TEXT = 'ASTRACHAT_SYNC_VAULT_V1';
const unlockedVaultKeys = new Map();
const previousVaultKeys = new Map();

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function markVaultCloudSyncPending() {
  try {
    return await getService(SERVICES.workspaceSync)?.queueLocalChange?.('vault');
  } catch {
    return false;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

// The pages show these errors in the person's language by their `code`; the English message is for logs and tests.
const withCode = (error, code) => Object.assign(error, { code });

function requireVaultPassword(password) {
  if (typeof password !== 'string' || password.length < VAULT_MIN_PASSWORD_LENGTH) {
    throw withCode(new TypeError(`Sync vault password must contain at least ${VAULT_MIN_PASSWORD_LENGTH} characters.`), 'vault-password-too-short');
  }
}

async function deriveVaultKey(password, salt, iterations, cryptoProvider) {
  const material = await cryptoProvider.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return cryptoProvider.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Remembering the unlock on this device. After the sync password (or a passkey) has opened the vault, the data key is kept on this device so that a reload or a
// new visit does not ask again, until the person locks the vault, signs out or removes the vault. It is kept sealed by the storage (security/local-key-seal.js:
// the key of the device, which no script can read): where the browser cannot seal, nothing is kept and the person unlocks as before. The protection with a passkey
// switches this off (setSyncVaultRememberPolicy): then the unlock is asked again after the days the person chose.
export const getRememberedSyncVaultStorageKey = (username) => (username ? `chatSyncVaultRemembered_v1_${username}` : null);
let rememberPolicy = () => true;
/** `policy(username)`: whether an unlock of this person may be remembered (true unless the person has chosen the protection with a passkey). */
export function setSyncVaultRememberPolicy(policy) {
  rememberPolicy = typeof policy === 'function' ? policy : () => true;
}

async function rememberUnlock(storage, username, keyBytes) {
  const storageKey = getRememberedSyncVaultStorageKey(username);
  if (!storageKey || !keyBytes || !storage?.setItem) return;
  try {
    if (!await rememberPolicy(username)) return;
    await storage.setItem(storageKey, bytesToBase64(keyBytes));
  } catch {
    // The browser cannot seal it (a private window): the person unlocks as before.
  }
}

/** Forgets the unlock kept on this device (locking, signing out, removing the vault). */
export async function forgetRememberedSyncVault({ storage, username } = {}) {
  const storageKey = getRememberedSyncVaultStorageKey(username);
  if (!storageKey || !storage?.removeItem) return;
  try {
    await storage.removeItem(storageKey);
  } catch {
    // Nothing more can be done here.
  }
}

/** Opens the vault again from the unlock kept on this device. True when it is open now. A key that is not the key of the record kept here is dropped. */
export async function restoreRememberedSyncVault({ storage, username, cryptoProvider = globalThis.crypto } = {}) {
  if (unlockedVaultKeys.has(username)) return true;
  const storageKey = getRememberedSyncVaultStorageKey(username);
  if (!storageKey || !storage?.getItem) return false;
  try {
    const saved = await storage.getItem(storageKey);
    if (!saved || !await rememberPolicy(username)) return false;
    const record = await readSyncVaultRecord(storage, username);
    const keyBytes = base64ToBytes(saved);
    if (!record || !await verifySyncVaultKeyBytes(record, keyBytes, { cryptoProvider })) {
      await forgetRememberedSyncVault({ storage, username });
      return false;
    }
    unlockedVaultKeys.set(username, await importDataKey(keyBytes, cryptoProvider));
    return true;
  } catch {
    return false;
  }
}

export function getSyncVaultStorageKey(username) {
  return username ? `chatSyncVault_v1_${username}` : null;
}

export function getSyncVaultRotationStorageKey(username) {
  return username ? `chatSyncVaultRotationPending_v1_${username}` : null;
}

// The record of version 1 kept here when it is turned into version 2 (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §16.3).
const getSyncVaultBackupStorageKey = (username) => (username ? `chatSyncVaultV1Backup_v1_${username}` : null);

// ----- The key of the vault (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §16.2)
// Version 2 has one random data key. It encrypts the API keys, and it never changes. The sync password only wraps it (and so does each passkey), so
// changing the password wraps the same key again and nothing has to be encrypted twice. Version 1 used the key made from the password as the data key:
// that key is taken as the data key of version 2 when a record of version 1 is opened, so what was encrypted before stays readable.

const importDataKey = (keyBytes, cryptoProvider) => cryptoProvider.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function deriveLegacyKeyBytes(password, salt, iterations, cryptoProvider) {
  const material = await cryptoProvider.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await cryptoProvider.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 256));
}

const checkIvOf = (record) => (record.version === LEGACY_RECORD_VERSION ? record.iv : record.checkIv);

/** Whether these key bytes are the data key of this record (its check text opens with them). */
export async function verifySyncVaultKeyBytes(record, keyBytes, { cryptoProvider = globalThis.crypto } = {}) {
  try {
    const key = await importDataKey(keyBytes, cryptoProvider);
    const plaintext = await cryptoProvider.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(checkIvOf(record)) }, key, base64ToBytes(record.check));
    return decoder.decode(plaintext) === VAULT_CHECK_TEXT;
  } catch {
    return false;
  }
}

async function buildRecord(password, keyBytes, { cryptoProvider, iterations = VAULT_ITERATIONS }) {
  requireVaultPassword(password);
  const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const checkIv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveVaultKey(password, salt, iterations, cryptoProvider);
  const key = await importDataKey(keyBytes, cryptoProvider);
  const wrapped = await cryptoProvider.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, keyBytes);
  const check = await cryptoProvider.subtle.encrypt({ name: 'AES-GCM', iv: checkIv }, key, encoder.encode(VAULT_CHECK_TEXT));
  return {
    record: {
      version: RECORD_VERSION,
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      wrappedKey: bytesToBase64(new Uint8Array(wrapped)),
      checkIv: bytesToBase64(checkIv),
      check: bytesToBase64(new Uint8Array(check)),
      createdAt: new Date().toISOString()
    },
    key,
    keyBytes
  };
}

/** A new record. With no `keyBytes` a new random data key is made; with them, the same key is wrapped by this password (a changed password). */
export async function createSyncVaultRecord(password, { cryptoProvider = globalThis.crypto, iterations = VAULT_ITERATIONS, keyBytes } = {}) {
  return buildRecord(password, keyBytes || cryptoProvider.getRandomValues(new Uint8Array(32)), { cryptoProvider, iterations });
}

/** A record of version 1 (what the app made before 2026-11-12), kept for tests of the move to version 2. */
export async function createLegacySyncVaultRecord(password, { cryptoProvider = globalThis.crypto, iterations = VAULT_ITERATIONS } = {}) {
  requireVaultPassword(password);
  const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(password, salt, iterations, cryptoProvider);
  const check = await cryptoProvider.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(VAULT_CHECK_TEXT));
  return {
    record: {
      version: LEGACY_RECORD_VERSION,
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      check: bytesToBase64(new Uint8Array(check)),
      createdAt: new Date().toISOString()
    },
    key
  };
}

/** The bytes of the data key of a record, opened with the sync password (a record of version 1 or 2). A wrong password throws `vault-password-incorrect`. */
export async function openSyncVaultRecordKeyBytes(password, record, { cryptoProvider = globalThis.crypto } = {}) {
  requireVaultPassword(password);
  if (!record || record.algorithm !== 'AES-GCM' || ![LEGACY_RECORD_VERSION, RECORD_VERSION].includes(record.version)) {
    throw new TypeError('Unsupported sync vault record.');
  }
  const salt = base64ToBytes(record.salt);
  const incorrect = () => withCode(new Error('Incorrect sync vault password.'), 'vault-password-incorrect');
  if (record.version === LEGACY_RECORD_VERSION) {
    const keyBytes = await deriveLegacyKeyBytes(password, salt, record.iterations, cryptoProvider);
    if (!await verifySyncVaultKeyBytes(record, keyBytes, { cryptoProvider })) throw incorrect();
    return keyBytes;
  }
  const wrappingKey = await deriveVaultKey(password, salt, record.iterations, cryptoProvider);
  try {
    return new Uint8Array(await cryptoProvider.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(record.iv) }, wrappingKey, base64ToBytes(record.wrappedKey)));
  } catch {
    throw incorrect();
  }
}

/** The data key of a record as a key to use (the API keys are encrypted with it). */
export async function unlockSyncVaultRecord(password, record, { cryptoProvider = globalThis.crypto } = {}) {
  return importDataKey(await openSyncVaultRecordKeyBytes(password, record, { cryptoProvider }), cryptoProvider);
}

export async function readSyncVaultRecord(storage, username) {
  const storageKey = getSyncVaultStorageKey(username);
  if (!storageKey) return null;
  const saved = await storage.getItem(storageKey);
  if (!saved) return null;
  return JSON.parse(saved);
}

async function writeRecord(storage, username, record) {
  await markVaultCloudSyncPending();
  await storage.setItem(getSyncVaultStorageKey(username), JSON.stringify(record));
  await markVaultCloudSyncPending();
}

export async function createAndUnlockSyncVault({ storage, username, password, cryptoProvider } = {}) {
  if (!getSyncVaultStorageKey(username)) throw new TypeError('A user is required to create a sync vault.');
  const { record, key, keyBytes } = await createSyncVaultRecord(password, { cryptoProvider });
  await writeRecord(storage, username, record);
  previousVaultKeys.delete(username);
  unlockedVaultKeys.set(username, key);
  await rememberUnlock(storage, username, keyBytes);
  return record;
}

// Opens the record kept here with the password and gives its data key; a record of version 1 is turned into version 2 on the way (the password is known
// now): a new salt, the same key wrapped again, and the record of version 1 kept beside it.
async function openAndUpgrade({ storage, username, password, cryptoProvider }) {
  const record = await readSyncVaultRecord(storage, username);
  if (!record) throw withCode(new Error('No sync vault password has been configured.'), 'vault-not-configured');
  const keyBytes = await openSyncVaultRecordKeyBytes(password, record, { cryptoProvider });
  if (record.version !== LEGACY_RECORD_VERSION) return keyBytes;
  const upgraded = await buildRecord(password, keyBytes, { cryptoProvider });
  await storage.setItem(getSyncVaultBackupStorageKey(username), JSON.stringify(record));
  await writeRecord(storage, username, upgraded.record);
  return keyBytes;
}

/** Opens the vault with the sync password. */
export async function unlockSyncVault({ storage, username, password, cryptoProvider = globalThis.crypto } = {}) {
  const keyBytes = await openAndUpgrade({ storage, username, password, cryptoProvider });
  const key = await importDataKey(keyBytes, cryptoProvider);
  unlockedVaultKeys.set(username, key);
  await rememberUnlock(storage, username, keyBytes);
  return key;
}

/** Opens the vault with the data key itself (from a passkey): it has to be the key of the record kept here. */
export async function unlockSyncVaultWithKeyBytes({ storage, username, keyBytes, cryptoProvider = globalThis.crypto } = {}) {
  const record = await readSyncVaultRecord(storage, username);
  if (!record) throw withCode(new Error('No sync vault password has been configured.'), 'vault-not-configured');
  if (!await verifySyncVaultKeyBytes(record, keyBytes, { cryptoProvider })) throw withCode(new Error('This key does not open this vault.'), 'vault-key-mismatch');
  const key = await importDataKey(keyBytes, cryptoProvider);
  unlockedVaultKeys.set(username, key);
  await rememberUnlock(storage, username, keyBytes);
  return key;
}

/** A new sync password for the same data key: the key is wrapped again, nothing else changes (and nothing is encrypted again). */
export async function changeSyncVaultPassword({
  storage,
  username,
  currentPassword,
  nextPassword,
  cryptoProvider = globalThis.crypto
} = {}) {
  const keyBytes = await openAndUpgrade({ storage, username, password: currentPassword, cryptoProvider });
  const { record, key } = await buildRecord(nextPassword, keyBytes, { cryptoProvider });
  await writeRecord(storage, username, record);
  unlockedVaultKeys.set(username, key);
  await rememberUnlock(storage, username, keyBytes);
  return record;
}

/** The sync password is forgotten and the data key came from a passkey: the same key wrapped by a new password. */
export async function resetSyncVaultPasswordWithKeyBytes({ storage, username, keyBytes, nextPassword, cryptoProvider = globalThis.crypto } = {}) {
  await unlockSyncVaultWithKeyBytes({ storage, username, keyBytes, cryptoProvider });
  const { record, key } = await buildRecord(nextPassword, keyBytes, { cryptoProvider });
  await writeRecord(storage, username, record);
  unlockedVaultKeys.set(username, key);
  return record;
}

export async function removeSyncVault({ storage, username } = {}) {
  const storageKey = getSyncVaultStorageKey(username);
  if (!storageKey) return;
  await markVaultCloudSyncPending();
  await storage.removeItem(storageKey);
  await storage.removeItem(getSyncVaultRotationStorageKey(username));
  await storage.removeItem(getSyncVaultBackupStorageKey(username));
  await forgetRememberedSyncVault({ storage, username });
  await markVaultCloudSyncPending();
  unlockedVaultKeys.delete(username);
  previousVaultKeys.delete(username);
}

export async function migrateSyncVaultRecord({ storage, fromUsername, toUsername } = {}) {
  if (!fromUsername || !toUsername || fromUsername === toUsername) return false;
  const sourceKey = getSyncVaultStorageKey(fromUsername);
  const targetKey = getSyncVaultStorageKey(toUsername);
  const saved = await storage.getItem(sourceKey);
  if (!saved) return false;
  await storage.setItem(targetKey, saved);
  const unlockedKey = unlockedVaultKeys.get(fromUsername);
  if (unlockedKey) {
    unlockedVaultKeys.set(toUsername, unlockedKey);
    unlockedVaultKeys.delete(fromUsername);
  }
  return true;
}

export function getUnlockedSyncVaultKey(username) {
  return unlockedVaultKeys.get(username) || null;
}

export function takePreviousSyncVaultKey(username) {
  const keys = previousVaultKeys.get(username) || [];
  const key = keys.shift() || null;
  if (keys.length) previousVaultKeys.set(username, keys);
  else previousVaultKeys.delete(username);
  return key;
}

export function getPreviousSyncVaultKeys(username) {
  return [...(previousVaultKeys.get(username) || [])];
}

export function clearPreviousSyncVaultKeys(username) {
  previousVaultKeys.delete(username);
}

export async function cancelSyncVaultRotation({ storage, username } = {}) {
  const rotationKey = getSyncVaultRotationStorageKey(username);
  if (rotationKey) await storage.removeItem(rotationKey);
  clearPreviousSyncVaultKeys(username);
}

export async function encryptSyncVaultPayload(payload, key, {
  cryptoProvider = globalThis.crypto
} = {}) {
  if (!key) throw new TypeError('An unlocked sync vault key is required.');
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await cryptoProvider.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    version: VAULT_VERSION,
    algorithm: 'AES-GCM',
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptSyncVaultPayload(encryptedPayload, key, {
  cryptoProvider = globalThis.crypto
} = {}) {
  if (!key) throw new TypeError('An unlocked sync vault key is required.');
  if (!encryptedPayload || encryptedPayload.version !== VAULT_VERSION || encryptedPayload.algorithm !== 'AES-GCM') {
    throw new TypeError('Unsupported encrypted sync payload.');
  }
  const plaintext = await cryptoProvider.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(encryptedPayload.iv) },
    key,
    base64ToBytes(encryptedPayload.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext));
}

export function isSyncVaultUnlocked(username) {
  return unlockedVaultKeys.has(username);
}

/** Locks the vault. With `storage`, the unlock kept on this device is forgotten too (the person pressed lock, or signed out). */
export function lockSyncVault(username, { storage } = {}) {
  unlockedVaultKeys.delete(username);
  if (storage) void forgetRememberedSyncVault({ storage, username });
}

export const syncVaultPolicy = Object.freeze({
  version: VAULT_VERSION,
  iterations: VAULT_ITERATIONS,
  minimumPasswordLength: VAULT_MIN_PASSWORD_LENGTH
});
