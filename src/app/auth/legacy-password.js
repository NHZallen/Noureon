// The password of an account of the old, local-only kind (`chatUser_<name>` in storage). The records are made by `createPasswordRecord` of the runtime
// (PBKDF2-SHA-256 with a salt) or, for the oldest accounts, hold the SHA-256 of the password. This only checks; it never writes.

const toHex = (bytes) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array((String(hex).match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16)));

const constantTimeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
};

/** True when `password` is the password of the saved account `record`; false for a wrong password, a record without one, or anything that cannot be checked. */
export async function verifyLegacyPassword(password, record, crypto = globalThis.crypto) {
  const stored = record?.passwordHash;
  if (typeof password !== 'string' || !password || typeof stored !== 'string' || !stored || !crypto?.subtle) return false;
  try {
    const encoder = new TextEncoder();
    if (record.passwordKdf === 'PBKDF2-SHA-256' && record.passwordSalt) {
      const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(record.passwordSalt), iterations: record.passwordIterations || 210000 }, key, 256);
      return constantTimeEqual(toHex(new Uint8Array(bits)), stored);
    }
    return constantTimeEqual(toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(password)))), stored);
  } catch {
    return false;
  }
}
