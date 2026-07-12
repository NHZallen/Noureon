const RECOVERY_CODE_PREFIX = 'NR2-';
const RECOVERY_ITERATIONS = 310_000;
const RECOVERY_ALGORITHM = 'PBKDF2-SHA256+A256GCM';
const RECOVERY_CONTEXT = new TextEncoder().encode('Noureon sync vault recovery v2');

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function readRecoverySecret(code) {
  const normalized = String(code || '').trim().replace(/\s+/gu, '');
  if (!normalized.startsWith(RECOVERY_CODE_PREFIX)) throw new Error('Invalid recovery code');
  const secret = decodeBase64Url(normalized.slice(RECOVERY_CODE_PREFIX.length));
  if (secret.length !== 32) throw new Error('Invalid recovery code');
  return secret;
}

async function deriveRecoveryKey({ cryptoImpl, secret, salt, iterations }) {
  const material = await cryptoImpl.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveKey']);
  return cryptoImpl.subtle.deriveKey({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function generateSyncVaultRecoveryCode(cryptoImpl = globalThis.crypto) {
  const secret = cryptoImpl.getRandomValues(new Uint8Array(32));
  return `${RECOVERY_CODE_PREFIX}${encodeBase64Url(secret)}`;
}

export function isSyncVaultRecoveryPayload(value) {
  return Boolean(
    value
    && value.version === 2
    && value.algorithm === RECOVERY_ALGORITHM
    && value.iterations === RECOVERY_ITERATIONS
    && typeof value.salt === 'string'
    && typeof value.iv === 'string'
    && typeof value.ciphertext === 'string'
    && value.salt.length <= 64
    && value.iv.length <= 64
    && value.ciphertext.length <= 32_768
  );
}

export async function encryptSyncVaultRecovery({ password, record, recoveryCode, cryptoImpl = globalThis.crypto }) {
  if (typeof password !== 'string' || password.length < 10 || !record || typeof record !== 'object') {
    throw new Error('A valid sync password and vault record are required');
  }
  const secret = readRecoverySecret(recoveryCode);
  const salt = cryptoImpl.getRandomValues(new Uint8Array(16));
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const key = await deriveRecoveryKey({ cryptoImpl, secret, salt, iterations: RECOVERY_ITERATIONS });
  const plaintext = new TextEncoder().encode(JSON.stringify({ password, record }));
  const ciphertext = await cryptoImpl.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: RECOVERY_CONTEXT
  }, key, plaintext);
  return {
    version: 2,
    algorithm: RECOVERY_ALGORITHM,
    iterations: RECOVERY_ITERATIONS,
    salt: encodeBase64Url(salt),
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext))
  };
}

export async function decryptSyncVaultRecovery(payload, recoveryCode, cryptoImpl = globalThis.crypto) {
  if (!isSyncVaultRecoveryPayload(payload)) throw new Error('Unsupported recovery payload');
  try {
    const secret = readRecoverySecret(recoveryCode);
    const salt = decodeBase64Url(payload.salt);
    const iv = decodeBase64Url(payload.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid recovery payload');
    const key = await deriveRecoveryKey({
      cryptoImpl,
      secret,
      salt,
      iterations: payload.iterations
    });
    const plaintext = await cryptoImpl.subtle.decrypt({
      name: 'AES-GCM',
      iv,
      additionalData: RECOVERY_CONTEXT
    }, key, decodeBase64Url(payload.ciphertext));
    const result = JSON.parse(new TextDecoder().decode(plaintext));
    if (typeof result?.password !== 'string' || !result.record || typeof result.record !== 'object') {
      throw new Error('Invalid recovery payload');
    }
    return result;
  } catch {
    throw new Error('Recovery code is incorrect or the recovery data is damaged');
  }
}

export const syncVaultRecoveryPolicy = Object.freeze({
  prefix: RECOVERY_CODE_PREFIX,
  iterations: RECOVERY_ITERATIONS,
  algorithm: RECOVERY_ALGORITHM
});
