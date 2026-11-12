// The recovery slots of the sync password (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §4). A slot holds the sync password and the
// vault record, sealed with a key that only the person's own passkey can give (the secret the passkey computes with the WebAuthn PRF extension, see
// passkey-prf.js). The slot is sealed and opened here, in the browser: what is stored in the cloud is the sealed text alone, so nobody who has the
// database (the service included) can open it. Pure functions, no browser objects but `crypto` (given or global), so tests and the server may use them.

const SLOT_VERSION = 1;
const INFO = 'noureon-vault-recovery-slot-v1';
const SECRET_BYTES = 32;
export const MAX_RECOVERY_SLOTS = 8;
export const SLOT_TYPE_PASSKEY = 'passkey';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const withCode = (error, code) => Object.assign(error, { code });

export const bytesToBase64 = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
export const base64ToBytes = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
export const bytesToBase64Url = (bytes) => bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const base64UrlToBytes = (value) => base64ToBytes(String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '='));

const toBytes = (value) => (value instanceof Uint8Array ? value : new Uint8Array(value));

async function deriveSlotKey(secret, salt, cryptoProvider) {
  const bytes = toBytes(secret);
  if (bytes.length !== SECRET_BYTES) throw withCode(new TypeError('The passkey secret must be 32 bytes.'), 'recovery-secret-invalid');
  const material = await cryptoProvider.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return cryptoProvider.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(INFO) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function seal({ secret, prfSalt, password, record, cryptoProvider }) {
  const key = await deriveSlotKey(secret, base64ToBytes(prfSalt), cryptoProvider);
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const sealed = await cryptoProvider.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify({ password, record })));
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(sealed)) };
}

/**
 * A new slot for a passkey. `secret`: the 32 bytes the passkey computed for `prfSalt` (base64 of 32 random bytes, kept in the slot: it is not secret);
 * `credentialId`: the passkey's id (base64url); `password` and `record`: the sync password and its vault record.
 */
export async function createPasskeySlot({ secret, credentialId, prfSalt, password, record, label = '', cryptoProvider = globalThis.crypto } = {}) {
  if (!credentialId || !prfSalt) throw withCode(new TypeError('A passkey slot needs the passkey id and its salt.'), 'recovery-slot-invalid');
  if (typeof password !== 'string' || !password || !record || typeof record !== 'object') throw withCode(new TypeError('A slot needs the sync password and its record.'), 'recovery-slot-invalid');
  const now = new Date().toISOString();
  return {
    version: SLOT_VERSION,
    type: SLOT_TYPE_PASSKEY,
    id: bytesToBase64Url(cryptoProvider.getRandomValues(new Uint8Array(12))),
    credentialId: String(credentialId),
    prfSalt: String(prfSalt),
    label: String(label || '').slice(0, 60),
    createdAt: now,
    updatedAt: now,
    ...await seal({ secret, prfSalt, password, record, cryptoProvider })
  };
}

/** Opens a slot with the secret of its passkey: { password, record }. A wrong secret or a changed slot gives the code `recovery-slot-unreadable`. */
export async function openRecoverySlot(slot, secret, { cryptoProvider = globalThis.crypto } = {}) {
  if (!isRecoverySlot(slot)) throw withCode(new TypeError('Unsupported recovery slot.'), 'recovery-slot-invalid');
  try {
    const key = await deriveSlotKey(secret, base64ToBytes(slot.prfSalt), cryptoProvider);
    const plain = await cryptoProvider.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(slot.iv) }, key, base64ToBytes(slot.ciphertext));
    const opened = JSON.parse(decoder.decode(plain));
    if (typeof opened?.password !== 'string' || !opened.record) throw new Error('Incomplete slot.');
    return opened;
  } catch (error) {
    if (error?.code === 'recovery-secret-invalid') throw error;
    throw withCode(new Error('The recovery slot cannot be opened with this passkey.'), 'recovery-slot-unreadable');
  }
}

/** The same slot (same passkey, same id) sealed again with a new password and record: the sync password changed. */
export async function rewrapRecoverySlot(slot, secret, { password, record }, { cryptoProvider = globalThis.crypto } = {}) {
  if (!isRecoverySlot(slot)) throw withCode(new TypeError('Unsupported recovery slot.'), 'recovery-slot-invalid');
  if (typeof password !== 'string' || !password || !record) throw withCode(new TypeError('A slot needs the sync password and its record.'), 'recovery-slot-invalid');
  return { ...slot, updatedAt: new Date().toISOString(), ...await seal({ secret, prfSalt: slot.prfSalt, password, record, cryptoProvider }) };
}

export function isRecoverySlot(slot) {
  return Boolean(slot && typeof slot === 'object'
    && slot.version === SLOT_VERSION && slot.type === SLOT_TYPE_PASSKEY
    && typeof slot.id === 'string' && slot.id
    && typeof slot.credentialId === 'string' && slot.credentialId
    && typeof slot.prfSalt === 'string' && slot.prfSalt
    && typeof slot.iv === 'string' && typeof slot.ciphertext === 'string');
}

/** What the cloud gave, as a list of slots: anything that is not a slot is left out, and no more than the limit is kept. */
export function normalizeRecoverySlots(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const slots = [];
  for (const slot of list) {
    if (!isRecoverySlot(slot) || seen.has(slot.id)) continue;
    seen.add(slot.id);
    slots.push(slot);
    if (slots.length >= MAX_RECOVERY_SLOTS) break;
  }
  return slots;
}

/** The list with this slot in it (one with the same id is replaced); refuses a new one over the limit. */
export function addRecoverySlot(slots, slot) {
  const list = normalizeRecoverySlots(slots);
  const index = list.findIndex((entry) => entry.id === slot.id);
  if (index >= 0) return list.map((entry, at) => (at === index ? slot : entry));
  if (list.length >= MAX_RECOVERY_SLOTS) throw withCode(new Error('There are as many recovery passkeys as are allowed.'), 'recovery-slots-full');
  return [...list, slot];
}

export const removeRecoverySlot = (slots, id) => normalizeRecoverySlots(slots).filter((slot) => slot.id !== id);
export const findRecoverySlotByCredential = (slots, credentialId) => normalizeRecoverySlots(slots).find((slot) => slot.credentialId === credentialId) || null;
