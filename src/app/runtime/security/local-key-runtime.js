// The part of the protection with a passkey that the person sees while using the app (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §26): the small lock at
// the top right while the keys on this device are locked, and the unlock (a passkey, or the sync password) that is asked for the first time a key is needed:
// sending a message, touching a key field, saving a key. A background work (a title, the memory, the usage rings) does not ask: it finds no keys and goes quiet.
// Only for a cloud account that turned the protection on; for everyone else this does nothing.

import { createLocalKeyProtection } from './local-key-protection.js';
import { createRecoverySlotsStore } from '../settings/settings-vault-recovery-slots-store.js';
import { passkeyPrfAvailability, readAnyRecoveryPasskey } from '../../sync/passkey-prf.js';
import { openRecoverySlot } from '../../sync/vault-recovery-slots.js';
import { i18n } from '../../../data/i18n.js';

const LOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const KEY_FIELD = 'input[id$="api-key-input"], input[id*="-api-key-input"]';

export function startLocalKeyRuntime({ window, storage, username, supabase, getText = (key, fallback) => i18n[window.document.documentElement.lang]?.[key] || fallback }) {
  const { document } = window;
  const protection = createLocalKeyProtection({ storage, getUsername: () => username, area: window.localStorage, target: window });
  if (!window.__noureonKeyguardStyles) {
    window.__noureonKeyguardStyles = true;
    void import('../../../styles/keyguard.css').catch(() => {});
  }

  // ----- the lock at the top right
  const icon = document.createElement('button');
  icon.type = 'button';
  icon.className = 'keyguard-lock hidden';
  icon.innerHTML = LOCK_ICON;
  const describeIcon = () => {
    const label = getText('keyguardLockIcon', '本機金鑰已鎖定，點一下解鎖');
    icon.title = label;
    icon.setAttribute('aria-label', label);
  };
  describeIcon();
  // At the right end of the header of the chat (the same row as the button of the left menu), so it sits among the buttons and covers none of them.
  const header = document.getElementById('menu-toggle-btn')?.closest('header');
  if (header) header.append(icon);
  else {
    icon.classList.add('is-floating');
    document.body.append(icon);
  }
  const refreshIcon = () => { icon.classList.toggle('hidden', !protection.isLocked()); };

  // ----- the unlock dialog
  let dialog = null;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  function ask() {
    if (dialog) return dialog.promise;
    const overlay = make('div', 'keyguard-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const card = make('div', 'keyguard-card');
    const title = make('h2', 'keyguard-title', getText('keyguardUnlockTitle', '解鎖本機金鑰'));
    const desc = make('p', 'keyguard-desc', getText('keyguardUnlockDesc', '要用通行金鑰或同步密碼解鎖，才能使用這台裝置上的 API 金鑰。'));
    const passkeyButton = make('button', 'keyguard-btn is-primary is-block hidden', getText('keyguardUnlockPasskey', '用通行金鑰解鎖'));
    passkeyButton.type = 'button';
    const field = make('label', 'keyguard-field');
    field.append(make('span', '', getText('keyguardUnlockPassword', '同步密碼')));
    const input = make('input');
    input.type = 'password';
    input.autocomplete = 'current-password';
    input.id = 'keyguard-unlock-password';
    field.append(input);
    const error = make('p', 'keyguard-error hidden');
    error.setAttribute('role', 'alert');
    const actions = make('div', 'keyguard-actions');
    const cancel = make('button', 'keyguard-btn', getText('keyguardUnlockCancel', '取消'));
    cancel.type = 'button';
    const unlock = make('button', 'keyguard-btn is-primary', getText('keyguardUnlockButton', '解鎖'));
    unlock.type = 'button';
    actions.append(cancel, unlock);
    card.append(title, desc, passkeyButton, field, error, actions);
    overlay.append(card);
    document.body.append(overlay);

    let settle;
    const promise = new Promise((resolve) => { settle = resolve; });
    const close = (result) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      dialog = null;
      settle(result);
    };
    const onKey = (event) => { if (event.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey, true);
    dialog = { promise };

    const fail = (message) => { error.textContent = message; error.classList.remove('hidden'); };
    const busy = (value) => { for (const button of [passkeyButton, unlock, cancel]) button.disabled = value; };
    const finish = async (task) => {
      busy(true);
      error.classList.add('hidden');
      try {
        await task();
        close(true);
      } catch (failure) {
        busy(false);
        if (failure?.code === 'vault-password-incorrect') fail(getText('keyguardUnlockWrong', '同步密碼不正確。'));
        else if (failure?.code !== 'passkey-cancelled') fail(failure?.message || String(failure));
      }
    };
    cancel.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(false); });
    unlock.addEventListener('click', () => {
      if (input.value) void finish(() => protection.unlockWithPassword(input.value));
    });
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') unlock.click(); });
    passkeyButton.addEventListener('click', () => void finish(async () => {
      const { slots } = await createRecoverySlotsStore({ getSupabase: () => supabase }).load();
      const found = await readAnyRecoveryPasskey({ rpId: window.location.hostname, slots });
      const { keyBytes } = await openRecoverySlot(found.slot, found.secret);
      await protection.unlockWithKeyBytes(keyBytes);
    }));

    // The passkey button is there when the person has a passkey of this vault and the browser can use it.
    void (async () => {
      try {
        const [{ slots }, availability] = await Promise.all([createRecoverySlotsStore({ getSupabase: () => supabase }).load(), passkeyPrfAvailability()]);
        if (slots.length && availability !== 'no' && availability !== 'in-app') passkeyButton.classList.remove('hidden');
      } catch {
        // No passkey button: the sync password is the way.
      }
      (input.isConnected ? input : null)?.focus?.();
    })();
    return promise;
  }

  /** True when the keys are open (they were, or the person unlocked them now). */
  async function ensureUnlocked() {
    if (!protection.isLocked()) return true;
    return ask();
  }

  // ----- where the first need shows
  icon.addEventListener('click', () => { void ensureUnlocked(); });
  for (const name of ['noureon:local-keys-locked', 'astra:sync-vault-unlocked', 'noureon:local-keys-changed']) window.addEventListener(name, refreshIcon);
  // Saving a key while locked: the keys the person typed are kept in memory, the unlock is asked for, and they are saved after it (security/sensitive-config-store.js).
  window.addEventListener('noureon:local-keys-needed', () => { void ensureUnlocked(); });
  // Sending a message: the first need. After the unlock the same message goes.
  const form = document.getElementById('chat-form');
  form?.addEventListener('submit', (event) => {
    if (!protection.isLocked()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void ensureUnlocked().then((opened) => { if (opened) form.requestSubmit?.(); });
  }, true);
  // Touching a field for a key.
  document.addEventListener('focusin', (event) => {
    if (protection.isLocked() && event.target?.matches?.(KEY_FIELD)) {
      event.target.blur?.();
      void ensureUnlocked().then((opened) => { if (opened) event.target.focus?.(); });
    }
  });
  window.addEventListener('astra:language-changed', describeIcon);

  const stopWatching = protection.watchExpiry(window);
  refreshIcon();
  return { protection, ensureUnlocked, refreshIcon, destroy() { stopWatching(); icon.remove(); } };
}
