// What the browser keeps of a person's API keys is sealed at rest with a key of the device: AES-256-GCM under a key that the browser makes for itself and
// keeps in a place of its own (a CryptoKey that cannot be exported, so its bytes are in no file, no backup and no copy of the storage folder, and no script can
// read them: it can only ask the browser to use it). Someone who copies the browser's profile folder, a backup of it or a dump of its storage gets sealed text.
//
// What this does not do (the settings text and the privacy policy say it): a page of the app that has been taken over by a script can ask the browser to open the
// keys like the app does. Stopping that is the job of the Content-Security-Policy, and of the protection with a passkey (the keys are then sealed with the data
// key of the sync vault, which is only in memory while the person has unlocked it).
//
// The seal sits in the storage adapter (runtime/kernel/storage-adapter.js), so everything that reads or writes these keys goes through it without knowing:
// the sensitive-config store, the cloud sync, the settings. A value kept before this existed (plain text) is read as it is and sealed the next time it is written.

const DATABASE = 'NoureonDeviceKey';
const STORE = 'keys';
const KEY_ID = 'device-v1';
export const DEVICE_PREFIX = 'nd1';

import { LocalKeyError, markLocalKeysUnreadable, sealRuleOf } from './local-key-rules.js';

export { LocalKeyError, sealRuleOf, localKeysWereUnreadable } from './local-key-rules.js';

const bytesToBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return globalThis.btoa(binary);
};
const base64ToBytes = (text) => Uint8Array.from(globalThis.atob(text), (char) => char.charCodeAt(0));
const request = (idbRequest) => new Promise((resolve, reject) => {
  idbRequest.onsuccess = () => resolve(idbRequest.result);
  idbRequest.onerror = () => reject(idbRequest.error);
});

/**
 * `indexedDBFactory`, `cryptoProvider`: the browser's (injected in tests). `onUnreadable(storageKey)`: told when a sealed value cannot be opened (the key of the
 * device is gone, for example because the browser's data was cleared in part).
 */
export function createLocalKeySeal({
  indexedDBFactory = globalThis.indexedDB,
  cryptoProvider = globalThis.crypto,
  onUnreadable = () => {}
} = {}) {
  let deviceKeyPromise = null;
  let vaultSealer = null; // set by the protection with a passkey (nv1), see setVaultSealer

  const openDatabase = () => new Promise((resolve, reject) => {
    const opening = indexedDBFactory.open(DATABASE, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: 'id' });
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });

  async function loadOrCreateDeviceKey() {
    if (!indexedDBFactory?.open || !cryptoProvider?.subtle) return null;
    const database = await openDatabase();
    const read = () => request(database.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID));
    const found = await read();
    if (found?.key) return found.key;
    const key = await cryptoProvider.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    try {
      await request(database.transaction(STORE, 'readwrite').objectStore(STORE).add({ id: KEY_ID, key, createdAt: Date.now() }));
      return key;
    } catch {
      // Another tab made one first: that one is the key of the device.
      return (await read())?.key || null;
    }
  }

  /** The key of the device, or null where the browser cannot keep one (a private window, no IndexedDB, no Web Crypto). Asked once. */
  const deviceKey = () => {
    deviceKeyPromise ||= loadOrCreateDeviceKey().catch(() => null);
    return deviceKeyPromise;
  };

  async function encryptWith(key, text, storageKey) {
    const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
    const sealed = await cryptoProvider.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(storageKey) }, key, new TextEncoder().encode(text));
    return `${DEVICE_PREFIX}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(sealed))}`;
  }

  async function decryptWith(key, stored, storageKey) {
    const [, iv, sealed] = stored.split('.');
    const plain = await cryptoProvider.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv), additionalData: new TextEncoder().encode(storageKey) }, key, base64ToBytes(sealed));
    return new TextDecoder().decode(plain);
  }

  return {
    /** Whether this browser can keep a key of its own (asked once). */
    available: async () => Boolean(await deviceKey()),

    /**
     * The text to keep for `storageKey`. With no seal the text itself, unless the rule says the value must never be kept as plain text: then it throws
     * (`local-seal-unavailable`) and nothing is kept.
     */
    async seal(storageKey, text) {
      const rule = sealRuleOf(storageKey);
      if (!rule || typeof text !== 'string') return text;
      if (vaultSealer?.active(storageKey)) return vaultSealer.seal(storageKey, text);
      const key = await deviceKey();
      if (!key) {
        if (rule.required) throw new LocalKeyError('local-seal-unavailable', 'This browser cannot keep a key of its own.');
        return text;
      }
      return encryptWith(key, text, storageKey);
    },

    /**
     * What was kept, as { value, sealed }. A text that is not sealed (kept before the seal existed) is given as it is with `sealed: false`, so the caller can seal it.
     * A sealed text that cannot be opened gives `value: null`, `unreadable: true`, and `onUnreadable` is told.
     */
    async open(storageKey, stored) {
      if (typeof stored !== 'string' || !sealRuleOf(storageKey)) return { value: stored, sealed: false };
      if (stored.startsWith(`${DEVICE_PREFIX}.`)) {
        try {
          const key = await deviceKey();
          if (!key) throw new LocalKeyError('local-key-missing', 'The key of this device is not there.');
          return { value: await decryptWith(key, stored, storageKey), sealed: true };
        } catch {
          onUnreadable(storageKey);
          return { value: null, sealed: true, unreadable: true };
        }
      }
      if (vaultSealer?.owns(stored)) {
        try {
          return { value: await vaultSealer.open(storageKey, stored), sealed: true };
        } catch (error) {
          if (error?.code === 'local-keys-locked') return { value: null, sealed: true, locked: true };
          onUnreadable(storageKey);
          return { value: null, sealed: true, unreadable: true };
        }
      }
      return { value: stored, sealed: false };
    },

    /** The protection with a passkey (settings-local-key-protection.js) puts its own way of sealing here. */
    setVaultSealer(sealer) { vaultSealer = sealer || null; }
  };
}

let shared = null;
/** The seal of the page: one for everything that uses the browser's own storage. */
export function getSharedLocalKeySeal() {
  shared ||= createLocalKeySeal({
    onUnreadable: (storageKey) => {
      markLocalKeysUnreadable();
      try {
        globalThis.window?.dispatchEvent?.(new globalThis.CustomEvent('noureon:local-keys-unreadable', { detail: { storageKey } }));
      } catch {
        // No window to tell: the value is simply read as missing.
      }
    }
  });
  return shared;
}
