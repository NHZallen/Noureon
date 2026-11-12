// The keys a person hands over for one reply are kept only while the reply lasts, and only in this sealed form: AES-256-GCM
// under a master key that lives in the server's environment and nowhere else (see the design, §6). The sealed envelope is bound to
// the person and the message it was made for (as additional authenticated data), so it cannot be moved to another run, and a
// changed byte makes it unreadable. A master key can be replaced: the new one seals, the previous one still opens what it sealed.
//
// Every person has a key of their own: the master key is not used to seal directly but to derive one key for each person (HKDF-SHA256, the person's
// id in the context), so a sealed text of one person can be opened with no key but that person's (the "nk2" form). The older form (the master key
// itself, "nk1") is still opened, and everything sealed from now on is "nk2". This does not protect against the master key leaking (whoever has it
// derives every person's key); it limits what one person's derived key, or one broken envelope, gives away.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const LEGACY_PREFIX = 'nk1';
const PREFIX = 'nk2';
const KEY_CONTEXT = 'noureon/sealed-keys/v2/';

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
  // The key of one person under one master key (kept for a while: a reply asks for it several times).
  const derived = new Map();
  const keyOf = (entry, userId) => {
    const name = `${entry.version}|${userId}`;
    let key = derived.get(name);
    if (!key) {
      key = Buffer.from(hkdfSync('sha256', entry.key, Buffer.alloc(0), Buffer.from(`${KEY_CONTEXT}${userId}`, 'utf8'), 32));
      if (derived.size >= 2000) derived.clear();
      derived.set(name, key);
    }
    return key;
  };
  return {
    currentVersion: current.version,
    /** Seals an object (the secrets of one reply); returns { envelope, keyVersion }. */
    seal(secrets, { userId, messageId }) {
      const iv = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, keyOf(current, userId), iv);
      cipher.setAAD(aadOf(userId, messageId));
      const sealed = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
      return { envelope: [PREFIX, iv.toString('base64'), cipher.getAuthTag().toString('base64'), sealed.toString('base64')].join('.'), keyVersion: current.version };
    },
    /** Whether an envelope is in the form that is made now (a person's own key, under the master key that seals now): the others can be sealed again when they are read. */
    isCurrent(envelope, keyVersion) {
      return String(envelope || '').startsWith(`${PREFIX}.`) && Number(keyVersion) === current.version;
    },
    /** Opens an envelope; throws when it was not made for this person and message, was changed, or its key is gone. */
    open(envelope, keyVersion, { userId, messageId }) {
      const entry = usable.find((item) => item.version === Number(keyVersion));
      const [prefix, iv, tag, sealed] = String(envelope || '').split('.');
      if (!entry || ![PREFIX, LEGACY_PREFIX].includes(prefix) || !iv || !tag || !sealed) throw new Error('The sealed keys cannot be opened.');
      try {
        const decipher = createDecipheriv(ALGORITHM, prefix === PREFIX ? keyOf(entry, userId) : entry.key, Buffer.from(iv, 'base64'));
        decipher.setAAD(aadOf(userId, messageId));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed, 'base64')), decipher.final()]).toString('utf8'));
      } catch {
        throw new Error('The sealed keys cannot be opened.');
      }
    }
  };
}
