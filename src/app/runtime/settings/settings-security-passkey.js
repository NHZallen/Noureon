// The passkey card of the security page, and everything of the sync vault's recovery that needs the passkey (docs/superpowers/specs/2026-11-12-vault-recovery-design.md,
// §4, §5, §16). A recovery slot is the data key of the vault (the one the API keys are encrypted with; the sync password only wraps it) sealed in the browser with
// a secret that only the person's passkey can compute (WebAuthn PRF); the cloud keeps the sealed text alone. Because a slot holds the key and not the password,
// changing the sync password changes nothing in a slot. This file makes a slot, lists them, takes one away, opens one when the password is forgotten, and
// opens the vault with one (the daily unlock).

import { openSyncVaultRecordKeyBytes, readSyncVaultRecord, unlockSyncVaultWithKeyBytes, verifySyncVaultKeyBytes } from '../../sync/sync-vault.js';
import { addRecoverySlot, createPasskeySlot, openRecoverySlot, removeRecoverySlot } from '../../sync/vault-recovery-slots.js';
import { passkeyPrfAvailability, readAnyRecoveryPasskey, registerRecoveryPasskey } from '../../sync/passkey-prf.js';
import { createRecoverySlotsStore } from './settings-vault-recovery-slots-store.js';

const ERROR_TEXTS = {
  'passkey-cancelled': ['securityPasskeyCancelled', '沒有確認通行金鑰，所以沒有完成。'],
  'passkey-blocked': ['securityPasskeyBlocked', '這個瀏覽器沒有跳出通行金鑰的確認視窗。若是從 app（例如 Google app）裡開的網頁，請改用 Safari 或 Chrome 開啟。'],
  'passkey-exists': ['securityPasskeyExists', '這把通行金鑰已經登記過了。要再登記一把，請用另一台裝置或另一把金鑰。'],
  'passkey-unsupported': ['securityPasskeyUnsupportedHere', '這個瀏覽器或這個網址不能使用通行金鑰。'],
  'passkey-prf-unsupported': ['securityPasskeyNoPrf', '這把通行金鑰不能用來救援同步密碼。請改用另一個裝置或瀏覽器。'],
  'passkey-none': ['securityPasskeyNone', '還沒有登記通行金鑰。'],
  'passkey-unknown': ['securityPasskeyUnknown', '這不是登記過的救援通行金鑰。'],
  'recovery-slots-full': ['securityPasskeyFull', '救援通行金鑰已達上限，請先移除一把。'],
  'recovery-slot-unreadable': ['securityPasskeyUnreadable', '這把通行金鑰打不開救援資料。'],
  'vault-key-mismatch': ['securityPasskeyMismatch', '這把通行金鑰屬於另一個金鑰庫（同步密碼清除或重新開始過）。請用同步密碼解鎖，再重新新增通行金鑰。'],
  'recovery-not-saved': ['securityPasskeyNotSaved', '救援資料沒有儲存。若已設定驗證器，請先輸入驗證碼。'],
  'passkey-failed': ['securityPasskeyFailed', '通行金鑰操作失敗。']
};

/** The message in the person's language for the errors of this file (empty for any other error). */
export const passkeyErrorText = (error, text) => {
  const entry = ERROR_TEXTS[error?.code];
  // The browser's own name for what happened goes after it, in brackets: it tells a support request what kind of refusal it was.
  return entry ? `${text(entry[0], entry[1])}${error.detail ? ` (${error.detail})` : ''}` : '';
};

const formatDate = (value, locale) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale || undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export function createPasskeyControls({
  document, window, storage, getSupabase, getCurrentUser, getElements, text, showNotification, notifyError, confirmIdentity, notifySecurity = () => {},
  passkey = { availability: passkeyPrfAvailability, register: registerRecoveryPasskey, readAny: readAnyRecoveryPasskey },
  store = createRecoverySlotsStore({ getSupabase })
}) {
  let state = { slots: [], hasServerSlot: false, loaded: false };
  let availability = 'unknown';
  // What the add flow needs, read when the card is drawn: the browser wants the passkey asked for right after the tap, and a wait before it can be refused.
  let cached = { record: null, userId: '' };
  const rpId = () => window.location.hostname;
  const isCloud = () => getCurrentUser?.()?.authProvider === 'supabase';
  const show = (node, yes) => node?.classList.toggle('hidden', !yes);

  const currentRecord = async () => {
    const user = getCurrentUser?.();
    return user?.username ? readSyncVaultRecord(storage, user.username) : null;
  };

  async function userIdOf() {
    const { data } = await getSupabase().auth.getSession();
    return data?.session?.user?.id || getCurrentUser()?.username || 'noureon';
  }

  async function load() {
    if (!isCloud() || !getSupabase()) return state; // a local account (or no cloud yet) has no recovery to read
    try {
      state = { ...await store.load(), loaded: true };
    } catch (error) {
      globalThis.console?.warn?.('The recovery data could not be read.', error);
      state = { ...state, loaded: false };
    }
    return state;
  }

  const ensure = async () => (state.loaded ? state : load());

  // ----- the card
  function renderList() {
    const list = getElements().passkeyList;
    list.textContent = '';
    for (const slot of state.slots) {
      const item = document.createElement('li');
      item.className = 'us-pk';
      item.dataset.slotId = slot.id;
      const name = document.createElement('span');
      name.className = 'us-pk-name';
      name.textContent = slot.label || text('securityPasskeyDefaultName', '通行金鑰');
      const meta = document.createElement('span');
      meta.className = 'us-pk-meta';
      meta.textContent = formatDate(slot.createdAt, window.document?.documentElement?.lang);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'us-link';
      remove.dataset.action = 'remove';
      remove.textContent = text('securityPasskeyRemove', '移除');
      item.append(name, meta, remove);
      list.append(item);
    }
  }

  async function refresh() {
    const elements = getElements();
    if (!elements.passkeyCard) return;
    show(elements.passkeyCard, isCloud());
    if (!isCloud()) return;
    availability = await passkey.availability();
    await load();
    const record = await currentRecord();
    cached = { record, userId: await userIdOf().catch(() => '') };
    const has = state.slots.length > 0;
    const label = elements.passkeyState.querySelector('.us-state-text');
    if (label) label.textContent = has ? text('securityPasskeyStateOn', '已設定') : text('securityPasskeyStateOff', '尚未設定');
    elements.passkeyState.classList.toggle('is-on', has);
    show(elements.passkeyState, true);
    const usable = availability !== 'no' && availability !== 'in-app';
    show(elements.passkeyUnsupported, availability === 'no');
    show(elements.passkeyInApp, availability === 'in-app');
    show(elements.passkeyNoVault, usable && !record);
    show(elements.passkeyAdd, usable && Boolean(record));
    show(elements.passkeyAddButton.parentElement, usable && Boolean(record));
    show(elements.passkeyList, has);
    elements.passkeyAddButton.textContent = has ? text('securityPasskeyAddAnother', '再新增一把通行金鑰') : text('securityPasskeyAdd', '新增通行金鑰');
    renderList();
  }

  // ----- adding one (the passkey is asked for first: the browser wants it right after the tap), taking one away
  async function add() {
    const user = getCurrentUser();
    const elements = getElements();
    const password = elements.passkeyPassword.value;
    if (!password) throw new Error(text('securityPasskeyPasswordRequired', '請輸入目前的同步密碼。'));
    const record = cached.record || await currentRecord();
    if (!record) throw Object.assign(new Error(), { code: 'vault-not-configured' });
    if (state.slots.length >= 8) throw Object.assign(new Error(), { code: 'recovery-slots-full' });
    const made = await passkey.register({
      rpId: rpId(), userId: new TextEncoder().encode(cached.userId || await userIdOf()), userName: user.email || user.displayName || 'Noureon',
      excludeCredentialIds: state.slots.map((slot) => slot.credentialId)
    });
    const keyBytes = await openSyncVaultRecordKeyBytes(password, record); // the sync password is the right one, or this throws
    const slot = await createPasskeySlot({
      secret: made.secret, credentialId: made.credentialId, prfSalt: made.prfSalt, keyBytes,
      label: `${text('securityPasskeyDefaultName', '通行金鑰')} ${state.slots.length + 1}`
    });
    // The recovery the server kept for the person (the old way) is dropped now that the person has one of their own.
    state = { ...state, slots: await store.save(addRecoverySlot(state.slots, slot), { dropServerSlot: state.hasServerSlot }), hasServerSlot: false };
    elements.passkeyPassword.value = '';
    notifySecurity('passkey-added');
    showNotification(text('securityPasskeyAdded', '通行金鑰已新增。忘記同步密碼時，可以用它救援，也可以用它解鎖。'));
    await refresh();
  }

  async function remove(slotId) {
    await ensure();
    const last = state.slots.length === 1;
    if (!window.confirm(last
      ? text('securityPasskeyRemoveLastConfirm', '這是最後一把。移除後，忘記同步密碼就無法救援，只能重新開始。確定要移除嗎？')
      : text('securityPasskeyRemoveConfirm', '移除這把通行金鑰的救援資料？（裝置上的通行金鑰本身不會被刪除。）'))) return;
    if (!await confirmIdentity()) return;
    state = { ...state, slots: await store.save(removeRecoverySlot(state.slots, slotId)) };
    notifySecurity('passkey-removed');
    showNotification(text('securityPasskeyRemoved', '已移除。'));
    await refresh();
  }

  // ----- the recovery of the vault
  /**
   * What the sync password changed: the old way (the copy the server keeps) goes on for a person who still has it, until it is retired. A person with a
   * passkey, and a new vault, have no copy of that kind. Passkey slots hold the data key, which did not change, so there is nothing to do for them.
   */
  async function keepRecovery({ password, record, currentPassword = '', serverStore }) {
    await ensure();
    if (state.hasServerSlot) await serverStore(password, record, currentPassword);
  }

  /** Opens one of the slots with its passkey (the person confirms) and gives the data key of the vault. It has to be the key of the vault kept here. */
  async function openKey() {
    await ensure();
    if (!state.slots.length) throw Object.assign(new Error(), { code: 'passkey-none' });
    const found = await passkey.readAny({ rpId: rpId(), slots: state.slots });
    const { keyBytes } = await openRecoverySlot(found.slot, found.secret);
    const record = await currentRecord();
    if (record && !await verifySyncVaultKeyBytes(record, keyBytes)) throw Object.assign(new Error(), { code: 'vault-key-mismatch' });
    return keyBytes;
  }

  /** The daily unlock: a passkey instead of the sync password. */
  async function unlockWithPasskey() {
    const user = getCurrentUser();
    const keyBytes = await openKey();
    await unlockSyncVaultWithKeyBytes({ storage, username: user.username, keyBytes });
  }

  /** What the panels offer: the passkey button where there are slots, the old Email way only while a copy of the server's is kept. */
  async function syncPanels({ recovery = false, unlock = false } = {}) {
    const elements = getElements();
    if (!isCloud()) return;
    const { slots, hasServerSlot, loaded } = await ensure();
    if (recovery) {
      show(elements.recoveryPasskeyButton, slots.length > 0);
      show(elements.recoveryButton, hasServerSlot || !loaded);
    }
    if (unlock) show(elements.unlockPasskeyButton, slots.length > 0 && availability !== 'in-app');
  }

  const guard = (task) => async (event) => {
    event?.preventDefault?.();
    try { await task(); } catch (error) { notifyError(error); }
  };

  function bind() {
    const elements = getElements();
    if (!elements.passkeyCard || elements.passkeyCard.dataset.bound === 'true') return;
    elements.passkeyCard.dataset.bound = 'true';
    elements.passkeyAddButton.addEventListener('click', guard(async () => { if (await confirmIdentity({ onlyIfSet: true })) await add(); }));
    elements.passkeyList.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-action="remove"]');
      const slotId = target?.closest('[data-slot-id]')?.dataset.slotId;
      if (slotId) guard(() => remove(slotId))(event);
    });
  }

  return { bind, refresh, keepRecovery, keepsServerCopy: async () => (await ensure()).hasServerSlot, openKey, unlockWithPasskey, syncPanels, hasSlots: async () => (await ensure()).slots.length > 0 };
}
