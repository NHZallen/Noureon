const VAULT_VERSION = 1;
const VAULT_ITERATIONS = 310000;
const VAULT_MIN_PASSWORD_LENGTH = 10;
const VAULT_CHECK_TEXT = 'ASTRACHAT_SYNC_VAULT_V1';
const unlockedVaultKeys = new Map();

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function requireVaultPassword(password) {
  if (typeof password !== 'string' || password.length < VAULT_MIN_PASSWORD_LENGTH) {
    throw new TypeError(`Sync vault password must contain at least ${VAULT_MIN_PASSWORD_LENGTH} characters.`);
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

export function getSyncVaultStorageKey(username) {
  return username ? `chatSyncVault_v1_${username}` : null;
}

export async function createSyncVaultRecord(password, {
  cryptoProvider = globalThis.crypto,
  iterations = VAULT_ITERATIONS
} = {}) {
  requireVaultPassword(password);
  const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(password, salt, iterations, cryptoProvider);
  const check = await cryptoProvider.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(VAULT_CHECK_TEXT)
  );
  return {
    record: {
      version: VAULT_VERSION,
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

export async function unlockSyncVaultRecord(password, record, {
  cryptoProvider = globalThis.crypto
} = {}) {
  requireVaultPassword(password);
  if (!record || record.version !== VAULT_VERSION || record.algorithm !== 'AES-GCM') {
    throw new TypeError('Unsupported sync vault record.');
  }
  const key = await deriveVaultKey(
    password,
    base64ToBytes(record.salt),
    record.iterations,
    cryptoProvider
  );
  try {
    const plaintext = await cryptoProvider.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
      key,
      base64ToBytes(record.check)
    );
    if (decoder.decode(plaintext) !== VAULT_CHECK_TEXT) throw new Error('Invalid vault check.');
  } catch {
    throw new Error('Incorrect sync vault password.');
  }
  return key;
}

export async function readSyncVaultRecord(storage, username) {
  const storageKey = getSyncVaultStorageKey(username);
  if (!storageKey) return null;
  const saved = await storage.getItem(storageKey);
  if (!saved) return null;
  return JSON.parse(saved);
}

export async function createAndUnlockSyncVault({ storage, username, password, cryptoProvider } = {}) {
  const storageKey = getSyncVaultStorageKey(username);
  if (!storageKey) throw new TypeError('A user is required to create a sync vault.');
  const { record, key } = await createSyncVaultRecord(password, { cryptoProvider });
  await storage.setItem(storageKey, JSON.stringify(record));
  unlockedVaultKeys.set(username, key);
  return record;
}

export async function unlockSyncVault({ storage, username, password, cryptoProvider } = {}) {
  const record = await readSyncVaultRecord(storage, username);
  if (!record) throw new Error('No sync vault password has been configured.');
  const key = await unlockSyncVaultRecord(password, record, { cryptoProvider });
  unlockedVaultKeys.set(username, key);
  return key;
}

export async function changeSyncVaultPassword({
  storage,
  username,
  currentPassword,
  nextPassword,
  cryptoProvider
} = {}) {
  await unlockSyncVault({ storage, username, password: currentPassword, cryptoProvider });
  return createAndUnlockSyncVault({ storage, username, password: nextPassword, cryptoProvider });
}

export async function removeSyncVault({ storage, username } = {}) {
  const storageKey = getSyncVaultStorageKey(username);
  if (!storageKey) return;
  await storage.removeItem(storageKey);
  unlockedVaultKeys.delete(username);
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

export function isSyncVaultUnlocked(username) {
  return unlockedVaultKeys.has(username);
}

export function lockSyncVault(username) {
  unlockedVaultKeys.delete(username);
}

export const syncVaultPolicy = Object.freeze({
  version: VAULT_VERSION,
  iterations: VAULT_ITERATIONS,
  minimumPasswordLength: VAULT_MIN_PASSWORD_LENGTH
});
