// The protection with a passkey for the API keys kept on this device (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §26). Off by default: the keys are
// sealed with the key of the device and the page reads them without asking (security/local-key-seal.js). On, they are sealed with the data key of the sync vault
// instead, which is only in memory while the vault is unlocked (a passkey, or the sync password, unlocks it). The person chooses how many days an unlock lasts: after
// them (or at every visit, with 0) the keys are locked until the next unlock; locked keys are not "missing": nothing is sent to the cloud and nothing is written over them.
//
// What this device does is kept on the device (localStorage, no secret in it; security/local-key-rules.js); the choice itself also goes to the settings, so the other devices
// follow it (security/local-key-policy.js, local-key-policy-sync.js).

import {
  applyRememberPolicyToKeptUnlock,
  forgetRememberedSyncVault,
  isSyncVaultUnlocked,
  lockSyncVault,
  readSyncVaultRecord,
  rememberedSyncVaultExpiry,
  unlockSyncVault,
  unlockSyncVaultWithKeyBytes
} from '../../sync/sync-vault.js';
import { LocalKeyError, SENSITIVE_KEY_PREFIX, readProtection, writeProtection } from './local-key-rules.js';
import { DEFAULT_REAUTH_DAYS, REAUTH_DAYS } from './local-key-policy.js';

export { DEFAULT_REAUTH_DAYS, REAUTH_DAYS };
const WATCH_MS = 5 * 60 * 1000;

const normalizeDays = (days) => (REAUTH_DAYS.includes(Number(days)) ? Number(days) : DEFAULT_REAUTH_DAYS);

/**
 * `storage`: the storage adapter (it seals the keys by itself). `getUsername()`: the signed-in person's storage name. `area`: where the choice is kept (localStorage).
 * `target`: where the events go (the window).
 */
export function createLocalKeyProtection({ storage, getUsername, area = globalThis.localStorage, target = globalThis.window, now = () => Date.now() } = {}) {
  const username = () => getUsername?.() || '';
  const keyName = () => `${SENSITIVE_KEY_PREFIX}${username()}`;
  const emit = (name, detail) => {
    try {
      target?.dispatchEvent?.(new target.CustomEvent(name, { detail }));
    } catch {
      // Nothing is listening where there is no window.
    }
  };

  const protection = () => readProtection(username(), area);
  const isProtected = () => Boolean(protection());
  const isLocked = () => isProtected() && !isSyncVaultUnlocked(username());

  // Re-seals what is kept with the way that is chosen now, and checks that it reads back the same; if it does not, the choice is undone and nothing is lost.
  async function resealKeys(plain, before) {
    if (plain == null) return;
    await storage.setItem(keyName(), plain);
    if (await storage.getItem(keyName()) !== plain) {
      writeProtection(username(), before, area);
      await storage.setItem(keyName(), plain);
      throw new LocalKeyError('local-keys-not-saved', 'The keys could not be sealed again.');
    }
  }

  return {
    protection,
    isProtected,
    isLocked,

    /** Turns the protection on (the vault has to be unlocked, as the keys are read with the key of the device and sealed again with the key of the vault). */
    async enable({ days = DEFAULT_REAUTH_DAYS } = {}) {
      if (!username()) throw new LocalKeyError('local-keys-no-user', 'There is no signed-in person.');
      if (!isSyncVaultUnlocked(username())) throw new LocalKeyError('local-keys-locked', 'Unlock the sync vault first.');
      const before = protection();
      const plain = await storage.getItem(keyName());
      writeProtection(username(), { days: normalizeDays(days) }, area);
      try {
        await resealKeys(plain, before);
        await applyRememberPolicyToKeptUnlock({ storage, username: username() });
      } catch (error) {
        writeProtection(username(), before, area);
        throw error;
      }
      emit('noureon:local-keys-changed', { username: username() });
    },

    /** Turns it off: the keys are sealed with the key of the device again (the vault has to be unlocked to read them). */
    async disable() {
      if (!isProtected()) return;
      const before = protection();
      const plain = await storage.getItem(keyName()); // throws "locked" when the vault is not unlocked
      writeProtection(username(), null, area);
      try {
        await resealKeys(plain, before);
        await applyRememberPolicyToKeptUnlock({ storage, username: username() });
      } catch (error) {
        writeProtection(username(), before, area);
        throw error;
      }
      emit('noureon:local-keys-changed', { username: username() });
    },

    /** How long an unlock lasts, in days (0: at every visit). What the device remembers of the unlock gets the new end. */
    async setDays(days) {
      if (!isProtected()) return;
      writeProtection(username(), { days: normalizeDays(days) }, area);
      await applyRememberPolicyToKeptUnlock({ storage, username: username() });
      emit('noureon:local-keys-changed', { username: username() });
    },

    /** Locks now: the vault key leaves the memory, the device forgets the unlock, the page lets go of the keys. */
    async lockNow() {
      lockSyncVault(username(), { storage });
      await forgetRememberedSyncVault({ storage, username: username() });
      emit('noureon:local-keys-locked', { username: username() });
    },

    /** The unlock with the sync password. The page reads the keys when the event comes. */
    async unlockWithPassword(password) {
      await unlockSyncVault({ storage, username: username(), password });
      emit('astra:sync-vault-unlocked', { username: username() });
    },

    /** The unlock with the data key of a passkey. */
    async unlockWithKeyBytes(keyBytes) {
      await unlockSyncVaultWithKeyBytes({ storage, username: username(), keyBytes });
      emit('astra:sync-vault-unlocked', { username: username() });
    },

    /** Whether the days of the unlock are over (then it locks). Asked now and then. */
    async checkExpiry() {
      if (!isProtected() || !isSyncVaultUnlocked(username())) return false;
      const end = await rememberedSyncVaultExpiry({ storage, username: username() });
      if (!end || now() <= end) return false;
      await this.lockNow();
      return true;
    },

    /** Starts asking whether the unlock has ended, every few minutes and when the page comes back to the front. Returns a function that stops it. */
    watchExpiry(scope = target) {
      const check = () => { void this.checkExpiry().catch(() => {}); };
      const timer = scope?.setInterval?.(check, WATCH_MS);
      scope?.addEventListener?.('focus', check);
      scope?.document?.addEventListener?.('visibilitychange', check);
      return () => {
        if (timer) scope.clearInterval?.(timer);
        scope?.removeEventListener?.('focus', check);
        scope?.document?.removeEventListener?.('visibilitychange', check);
      };
    },

    /** Whether the sync vault of this person has a sync password at all (the protection needs one). */
    hasVault: async () => Boolean(await readSyncVaultRecord(storage, username()))
  };
}

/**
 * Before the sync vault is removed (clearing the sync password, starting over): the keys sealed with its data key would be lost with it. With the vault open they are
 * sealed with the key of the device again (nothing is lost); with it locked (the password is forgotten) they cannot be read, so they are dropped, as the keys in the cloud
 * are on starting over. Either way the protection is off after it.
 */
export async function releaseKeysBeforeVaultRemoval({ storage, username, area = globalThis.localStorage, target = globalThis.window } = {}) {
  if (!username || !readProtection(username, area)) return;
  if (isSyncVaultUnlocked(username)) {
    await createLocalKeyProtection({ storage, getUsername: () => username, area, target }).disable();
    return;
  }
  await storage.removeItem(`${SENSITIVE_KEY_PREFIX}${username}`);
  writeProtection(username, null, area);
}
