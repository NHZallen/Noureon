// The keys a person hands over for one reply are kept only while the reply lasts, and only in this sealed form: AES-256-GCM
// under a master key that lives in the server's environment and nowhere else (see the design, §6). The sealed envelope is bound to
// the person and the message it was made for (as additional authenticated data), so it cannot be moved to another run, and a
// changed byte makes it unreadable. A master key can be replaced: the new one seals, the previous one still opens what it sealed.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'nk1';

const decodeKey = (value, name) => {
  const bytes = Buffer.from(String(value || ''), 'base64');
  if (bytes.length !== 32) throw new Error(`${name} must be 32 bytes in base64 (for example: openssl rand -base64 32)`);
  return bytes;
};

/**
 * `keys`: [{ version, key }] (key as base64); the first is used to seal, all of them to open. Throws when a key is not 32 bytes.
 */
export function createKeyVault(keys) {
  const usable = (Array.isArray(keys) ? keys : []).filter((entry) => entry?.key).map((entry) => ({ version: Number(entry.version), key: decodeKey(entry.key, `Encryption key (version ${entry.version})`) }));
  if (usable.length === 0) throw new Error('An encryption key is needed to keep keys for a reply.');
  if (usable.some((entry) => !Number.isInteger(entry.version) || entry.version < 1 || entry.version > 32000)) throw new Error('Encryption key versions are whole numbers from 1.');
  const current = usable[0];
  const aadOf = (userId, messageId) => Buffer.from(`${userId}:${messageId}`, 'utf8');
  return {
    currentVersion: current.version,
    /** Seals an object (the secrets of one reply); returns { envelope, keyVersion }. */
    seal(secrets, { userId, messageId }) {
      const iv = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, current.key, iv);
      cipher.setAAD(aadOf(userId, messageId));
      const sealed = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
      return { envelope: [PREFIX, iv.toString('base64'), cipher.getAuthTag().toString('base64'), sealed.toString('base64')].join('.'), keyVersion: current.version };
    },
    /** Opens an envelope; throws when it was not made for this person and message, was changed, or its key is gone. */
    open(envelope, keyVersion, { userId, messageId }) {
      const entry = usable.find((item) => item.version === Number(keyVersion));
      const [prefix, iv, tag, sealed] = String(envelope || '').split('.');
      if (!entry || prefix !== PREFIX || !iv || !tag || !sealed) throw new Error('The sealed keys cannot be opened.');
      try {
        const decipher = createDecipheriv(ALGORITHM, entry.key, Buffer.from(iv, 'base64'));
        decipher.setAAD(aadOf(userId, messageId));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed, 'base64')), decipher.final()]).toString('utf8'));
      } catch {
        throw new Error('The sealed keys cannot be opened.');
      }
    }
  };
}
