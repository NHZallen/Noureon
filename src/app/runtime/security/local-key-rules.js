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
