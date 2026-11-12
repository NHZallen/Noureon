// Which keys of the browser's storage hold secrets, and so are sealed (security/local-key-seal.js). Small and loaded with the storage; the seal itself, which
// does the cryptography, is loaded the first time one of these keys is read or written.

// `required`: the value is a secret that must never be kept as plain text, so with no seal it is not kept at all (the remembered unlock of the sync vault); the
// others fall back to what the app did before.
const RULES = [
  { test: /^chatSensitiveConfig_v1_/, required: false },
  { test: /^chatSyncVaultRemembered_v1_/, required: true }
];

export const sealRuleOf = (storageKey) => RULES.find((rule) => rule.test.test(String(storageKey || ''))) || null;

export class LocalKeyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LocalKeyError';
    this.code = code;
  }
}

let unreadableSeen = false;
export const markLocalKeysUnreadable = () => { unreadableSeen = true; };
/** Whether a sealed value of this page could not be opened (the notice may start after the first read, so it asks). */
export const localKeysWereUnreadable = () => unreadableSeen;

// ----- the protection with a passkey (settings: "Protect the keys on this device")
// The choice lives on this device only (not synced), in localStorage: it holds no secret, and it has to be readable at once and without a promise, before the
// keys are read. { days }: the unlock is asked for again after that many days (0: at every visit).
export const PROTECTION_PREFIX = 'noureonLocalKeyProtection_v1_';
export const SENSITIVE_KEY_PREFIX = 'chatSensitiveConfig_v1_';

export function readProtection(username, storage = globalThis.localStorage) {
  if (!username) return null;
  try {
    const parsed = JSON.parse(storage?.getItem(`${PROTECTION_PREFIX}${username}`) || 'null');
    if (!parsed || parsed.enabled !== true) return null;
    const days = Number(parsed.days);
    return { days: Number.isFinite(days) && days >= 0 ? Math.min(Math.floor(days), 365) : 7 };
  } catch {
    return null;
  }
}

export function writeProtection(username, protection, storage = globalThis.localStorage) {
  if (!username) return;
  const name = `${PROTECTION_PREFIX}${username}`;
  if (!protection) storage?.removeItem(name);
  else storage?.setItem(name, JSON.stringify({ enabled: true, days: protection.days, since: Date.now() }));
}

/** The person of a storage key of the API keys, or '' for any other key. */
export const sensitiveKeyOwner = (storageKey) => (String(storageKey || '').startsWith(SENSITIVE_KEY_PREFIX) ? String(storageKey).slice(SENSITIVE_KEY_PREFIX.length) : '');
