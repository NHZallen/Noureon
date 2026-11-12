// The card "Protect the keys on this device" of the security page (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §26): a switch, the days an unlock lasts, and
// "lock now". The work is done by security/local-key-protection.js; this is what the person sees. Only for a cloud account that has a sync password and a passkey, in a browser that
// can use it; otherwise the card says why the switch is off.

import { isSyncVaultUnlocked } from '../../sync/sync-vault.js';
import { DEFAULT_REAUTH_DAYS, createLocalKeyProtection } from '../security/local-key-protection.js';

export function createKeyguardControls({ window, storage, getCurrentUser, getElements, text, showNotification, notifyError, confirmIdentity, passkeys }) {
  const protection = createLocalKeyProtection({ storage, getUsername: () => getCurrentUser?.()?.username, area: window.localStorage, target: window });
  const isCloud = () => getCurrentUser?.()?.authProvider === 'supabase';
  const show = (node, yes) => node?.classList.toggle('hidden', !yes);
  let busy = false;

  async function refresh() {
    const elements = getElements();
    if (!elements.keyguardCard) return;
    show(elements.keyguardCard, isCloud());
    if (!isCloud()) return;
    const username = getCurrentUser().username;
    const hasVault = await protection.hasVault();
    const hasPasskey = hasVault && await passkeys.hasSlots();
    const usable = !['no', 'in-app'].includes(passkeys.availability());
    const on = protection.isProtected();
    const unlocked = isSyncVaultUnlocked(username);
    // Why the switch cannot be used now, in order: no sync password, no passkey, no browser support, the vault is locked (it is needed to turn it on or off).
    const reason = !hasVault ? ['securityKeyguardNeedVault', '先設定同步密碼，才能開啟這項保護。']
      : !hasPasskey ? ['securityKeyguardNeedPasskey', '先新增通行金鑰，才能開啟這項保護。']
        : !usable ? ['securityKeyguardUnsupported', '這個瀏覽器不能用通行金鑰，所以不能開啟這項保護。']
          : !unlocked ? ['securityKeyguardNeedUnlock', '先解鎖同步保險庫，才能開啟或關閉這項保護。'] : null;
    elements.keyguardSwitch.checked = on;
    elements.keyguardSwitch.disabled = Boolean(reason) || busy;
    elements.keyguardNote.textContent = reason ? text(...reason) : '';
    show(elements.keyguardNote, Boolean(reason));
    show(elements.keyguardOptions, on);
    elements.keyguardDays.value = String(protection.protection()?.days ?? DEFAULT_REAUTH_DAYS);
    show(elements.keyguardFoot, on);
    elements.keyguardState.textContent = unlocked ? text('securityKeyguardStateUnlocked', '已解鎖') : text('securityKeyguardStateLocked', '已鎖定');
    elements.keyguardLock.disabled = !unlocked;
  }

  const run = (task) => async () => {
    if (busy) return;
    busy = true;
    try {
      await task();
    } catch (error) {
      notifyError(error);
    } finally {
      busy = false;
      await refresh();
    }
  };

  function bind() {
    const elements = getElements();
    if (!elements.keyguardCard || elements.keyguardCard.dataset.bound === 'true') return;
    elements.keyguardCard.dataset.bound = 'true';
    elements.keyguardSwitch.addEventListener('change', run(async () => {
      const wantsOn = elements.keyguardSwitch.checked;
      // Like any change that is hard to undo: the authenticator's six digits, or a tap of the passkey.
      if (!await confirmIdentity()) return;
      if (wantsOn) await protection.enable({ days: Number(elements.keyguardDays.value) });
      else await protection.disable();
      showNotification(wantsOn ? text('securityKeyguardOnDone', '本機金鑰保護已開啟。') : text('securityKeyguardOffDone', '本機金鑰保護已關閉。'));
    }));
    elements.keyguardDays.addEventListener('change', run(async () => { await protection.setDays(Number(elements.keyguardDays.value)); }));
    elements.keyguardLock.addEventListener('click', run(async () => {
      await protection.lockNow();
      showNotification(text('securityKeyguardLockedDone', '已鎖定。要用到金鑰時會請你解鎖。'));
    }));
    for (const name of ['noureon:local-keys-locked', 'astra:sync-vault-unlocked', 'noureon:local-keys-changed']) window.addEventListener(name, () => { void refresh(); });
  }

  return { bind, refresh, isProtected: () => protection.isProtected() };
}
