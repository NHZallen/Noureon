// The part of the protection with a passkey that the person meets while using the app (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §26): the first time a key is needed
// while the keys on this device are locked (sending a message, touching a key field, saving a key) nothing is sent or opened and a text says to unlock them in the settings
// (security/local-key-notice.js). There is no lock button and no unlock dialog here (Allen, 2026-11-20). A background work (a title, the memory, the usage rings) says nothing:
// it finds no keys and goes quiet. Only for a cloud account that turned the protection on; for everyone else this does nothing.

import { createLocalKeyProtection } from './local-key-protection.js';
import { startLocalKeyPolicySync } from './local-key-policy-sync.js';
import { isSyncVaultUnlocked } from '../../sync/sync-vault.js';
import { SERVICES, getService } from '../services.js';
import { createRecoverySlotsStore } from '../settings/settings-vault-recovery-slots-store.js';

const KEY_FIELD = 'input[id$="api-key-input"], input[id*="-api-key-input"]';

export function startLocalKeyRuntime({ window, storage, username, supabase }) {
  const { document } = window;
  const protection = createLocalKeyProtection({ storage, getUsername: () => username, area: window.localStorage, target: window });

  // The keys are unlocked by the person in the settings (Security and sign-in: the sync password or a passkey opens the sync vault). Nowhere else is there a button or a dialog for it
  // (Allen, 2026-11-20: no unlock button; a text tells the person to go and unlock). When a key is needed while locked, the text is told (security/local-key-notice.js) and nothing else happens.
  function ensureUnlocked() {
    if (!protection.isLocked()) return true;
    window.dispatchEvent(new window.CustomEvent('noureon:local-keys-need-unlock'));
    return false;
  }

  // ----- where the first need shows
  // Saving a key while locked: the keys the person typed are kept in memory and are saved after the unlock (security/sensitive-config-store.js).
  window.addEventListener('noureon:local-keys-needed', () => { ensureUnlocked(); });
  // Sending a message: the first need. The message stays in the box; the person unlocks and sends it again.
  const form = document.getElementById('chat-form');
  form?.addEventListener('submit', (event) => {
    if (!protection.isLocked()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ensureUnlocked();
  }, true);
  // Touching a field for a key.
  document.addEventListener('focusin', (event) => {
    if (protection.isLocked() && event.target?.matches?.(KEY_FIELD)) {
      event.target.blur?.();
      ensureUnlocked();
    }
  });

  const stopWatching = protection.watchExpiry(window);

  // The choice follows the account: what the other devices chose is done here too, and what is chosen here is kept in the settings (local-key-policy-sync.js). It starts once the sync
  // has said what it has, so a choice made on another device is not answered with an older one.
  let policy = null;
  let destroyed = false;
  const canTurnOn = async () => {
    try {
      return (await createRecoverySlotsStore({ getSupabase: () => supabase }).load()).slots.length > 0;
    } catch {
      return false;
    }
  };
  const ready = getService(SERVICES.workspaceSyncReady);
  void Promise.resolve(ready).catch(() => {}).then(() => {
    if (destroyed) return;
    policy = startLocalKeyPolicySync({ window, protection, settings: () => getService(SERVICES.settingsAccess), canTurnOn, isUnlocked: () => isSyncVaultUnlocked(username) });
  });
  return { protection, ensureUnlocked, destroy() { destroyed = true; policy?.destroy(); stopWatching(); } };
}
