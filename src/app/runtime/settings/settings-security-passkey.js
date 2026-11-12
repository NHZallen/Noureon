// The passkey card of the security page, and everything of the sync password's recovery that needs the passkey (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §4, §5, §15).
// A recovery slot is the sync password and its vault record, sealed in the browser with a secret that only the person's passkey can compute (WebAuthn PRF);
// the cloud keeps the sealed text alone. This file makes a slot (the person types the sync password, confirms the passkey), lists them, takes one away,
// seals them again when the sync password changed, and opens one when the password is forgotten.

import { readSyncVaultRecord, unlockSyncVaultRecord } from '../../sync/sync-vault.js';
import {
  addRecoverySlot, createPasskeySlot, isSlotCurrent, normalizeRecoverySlots, openRecoverySlot, removeRecoverySlot, rewrapRecoverySlot
} from '../../sync/vault-recovery-slots.js';
import { passkeyPrfAvailability, readAnyRecoveryPasskey, readRecoveryPasskeySecret, registerRecoveryPasskey } from '../../sync/passkey-prf.js';
import { createRecoverySlotsStore } from './settings-vault-recovery-slots-store.js';

const ERROR_TEXTS = {
  'passkey-cancelled': ['securityPasskeyCancelled', '沒有確認通行金鑰，所以沒有完成。'],
  'passkey-exists': ['securityPasskeyExists', '這把通行金鑰已經登記過了。要再登記一把，請用另一台裝置或另一把金鑰。'],
  'passkey-unsupported': ['securityPasskeyUnsupportedHere', '這個瀏覽器或這個網址不能使用通行金鑰。'],
  'passkey-prf-unsupported': ['securityPasskeyNoPrf', '這把通行金鑰不能用來救援同步密碼。請改用另一個裝置或瀏覽器。'],
  'passkey-none': ['securityPasskeyNone', '還沒有登記通行金鑰。'],
  'passkey-unknown': ['securityPasskeyUnknown', '這不是登記過的救援通行金鑰。'],
  'recovery-slots-full': ['securityPasskeyFull', '救援通行金鑰已達上限，請先移除一把。'],
  'recovery-slot-unreadable': ['securityPasskeyUnreadable', '這把通行金鑰打不開救援資料。'],
  'recovery-slot-stale': ['securityPasskeyStale', '這把通行金鑰的救援資料已過期（之後換過同步密碼）。請改用另一把，或重新開始。'],
  'recovery-not-saved': ['securityPasskeyNotSaved', '救援資料沒有儲存。若已設定驗證器，請先輸入驗證碼。'],
  'passkey-failed': ['securityPasskeyFailed', '通行金鑰操作失敗。']
};

/** The message in the person's language for the errors of this file (null for any other error). */
export const passkeyErrorText = (error, text) => {
  const entry = ERROR_TEXTS[error?.code];
  return entry ? text(entry[0], entry[1]) : '';
};

const formatDate = (value, locale) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale || undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export function createPasskeyControls({
  document, window, storage, getSupabase, getCurrentUser, getElements, text, showNotification, notifyError, requireAal2,
  passkey = { availability: passkeyPrfAvailability, register: registerRecoveryPasskey, readOne: readRecoveryPasskeySecret, readAny: readAnyRecoveryPasskey },
  store = createRecoverySlotsStore({ getSupabase })
}) {
  let state = { slots: [], hasServerSlot: false, loaded: false };
  let availability = 'unknown';
  const rpId = () => window.location.hostname;
  const isCloud = () => getCurrentUser?.()?.authProvider === 'supabase';
  const show = (node, yes) => node?.classList.toggle('hidden', !yes);

  const currentRecord = async () => {
    const user = getCurrentUser?.();
    return user?.username ? readSyncVaultRecord(storage, user.username) : null;
  };

  async function load() {
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
  const renderList = async () => {
    const elements = getElements();
    const record = await currentRecord();
    const list = elements.passkeyList;
    list.textContent = '';
    for (const slot of state.slots) {
      const stale = Boolean(record) && !isSlotCurrent(slot, record);
      const item = document.createElement('li');
      item.className = 'us-pk';
      item.dataset.slotId = slot.id;
      const name = document.createElement('span');
      name.className = 'us-pk-name';
      name.textContent = slot.label || text('securityPasskeyDefaultName', '通行金鑰');
      const meta = document.createElement('span');
      meta.className = `us-pk-meta${stale ? ' is-warn' : ''}`;
      meta.textContent = stale ? text('securityPasskeyNeedsUpdate', '需要更新') : formatDate(slot.updatedAt || slot.createdAt, window.document?.documentElement?.lang);
      item.append(name, meta);
      if (stale) item.append(button('update', text('securityPasskeyUpdate', '更新')));
      item.append(button('remove', text('securityPasskeyRemove', '移除')));
      list.append(item);
    }
  };

  function button(action, label) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'us-link';
    node.dataset.action = action;
    node.textContent = label;
    return node;
  }

  async function refresh() {
    const elements = getElements();
    if (!elements.passkeyCard) return;
    show(elements.passkeyCard, isCloud());
    if (!isCloud()) return;
    availability = await passkey.availability();
    await load();
    const record = await currentRecord();
    const has = state.slots.length > 0;
    const label = elements.passkeyState.querySelector('.us-state-text');
    if (label) label.textContent = has ? text('securityPasskeyStateOn', '已設定') : text('securityPasskeyStateOff', '尚未設定');
    elements.passkeyState.classList.toggle('is-on', has);
    show(elements.passkeyState, true);
    show(elements.passkeyUnsupported, availability === 'no');
    show(elements.passkeyNoVault, availability !== 'no' && !record);
    show(elements.passkeyAdd, availability !== 'no' && Boolean(record));
    show(elements.passkeyList, has);
    elements.passkeyAddButton.textContent = has ? text('securityPasskeyAddAnother', '再新增一把通行金鑰') : text('securityPasskeyAdd', '新增通行金鑰');
    await renderList();
  }

  // ----- adding one (the passkey is asked for first: the browser wants it right after the tap), taking one away, sealing one again
  async function add() {
    const user = getCurrentUser();
    const elements = getElements();
    const password = elements.passkeyPassword.value;
    if (!password) throw new Error(text('securityPasskeyPasswordRequired', '請輸入目前的同步密碼。'));
    const record = await currentRecord();
    if (!record) throw Object.assign(new Error(), { code: 'vault-not-configured' });
    await ensure();
    if (state.slots.length >= 8) throw Object.assign(new Error(), { code: 'recovery-slots-full' });
    if (!await requireAal2()) return;
    const id = await userIdOf();
    const made = await passkey.register({
      rpId: rpId(), userId: new TextEncoder().encode(id), userName: user.email || user.displayName || 'Noureon',
      excludeCredentialIds: state.slots.map((slot) => slot.credentialId)
    });
    await unlockSyncVaultRecord(password, record); // the sync password is the right one, or this throws
    const slot = await createPasskeySlot({
      secret: made.secret, credentialId: made.credentialId, prfSalt: made.prfSalt, password, record,
      label: `${text('securityPasskeyDefaultName', '通行金鑰')} ${state.slots.length + 1}`
    });
    // The recovery the server kept for the person (the old way) is dropped now that the person has one of their own.
    state = { ...state, slots: await store.save(addRecoverySlot(state.slots, slot), { dropServerSlot: state.hasServerSlot }), hasServerSlot: false };
    elements.passkeyPassword.value = '';
    showNotification(text('securityPasskeyAdded', '通行金鑰已新增。忘記同步密碼時，可以用它救援。'));
    await refresh();
  }

  async function userIdOf() {
    const { data } = await getSupabase().auth.getSession();
    return data?.session?.user?.id || getCurrentUser()?.username || 'noureon';
  }

  async function remove(slotId) {
    await ensure();
    const last = state.slots.length === 1;
    if (!window.confirm(last
      ? text('securityPasskeyRemoveLastConfirm', '這是最後一把。移除後，忘記同步密碼就無法救援，只能重新開始。確定要移除嗎？')
      : text('securityPasskeyRemoveConfirm', '移除這把通行金鑰的救援資料？（裝置上的通行金鑰本身不會被刪除。）'))) return;
    if (!await requireAal2()) return;
    state = { ...state, slots: await store.save(removeRecoverySlot(state.slots, slotId)) };
    showNotification(text('securityPasskeyRemoved', '已移除。'));
    await refresh();
  }

  async function update(slotId) {
    const elements = getElements();
    const password = elements.passkeyPassword.value;
    if (!password) throw new Error(text('securityPasskeyPasswordRequired', '請輸入目前的同步密碼。'));
    const record = await currentRecord();
    await ensure();
    const slot = state.slots.find((entry) => entry.id === slotId);
    if (!slot || !record) return;
    if (!await requireAal2()) return;
    const secret = await passkey.readOne({ rpId: rpId(), credentialId: slot.credentialId, prfSalt: slot.prfSalt });
    await unlockSyncVaultRecord(password, record);
    const sealed = await rewrapRecoverySlot(slot, secret, { password, record });
    state = { ...state, slots: await store.save(addRecoverySlot(state.slots, sealed)) };
    elements.passkeyPassword.value = '';
    showNotification(text('securityPasskeyUpdated', '通行金鑰的救援資料已更新。'));
    await refresh();
  }

  // ----- when the sync password changes: ask each passkey for its secret first (the tap is still fresh), seal them again with the new password after
  /** Resolves { [slotId]: secret } for the passkeys that answered; the ones that did not stay as they are (and show "needs update" on the card). */
  async function collectSecrets() {
    await ensure();
    const secrets = {};
    for (const slot of state.slots) {
      try {
        secrets[slot.id] = await passkey.readOne({ rpId: rpId(), credentialId: slot.credentialId, prfSalt: slot.prfSalt });
      } catch (error) {
        if (error?.code === 'passkey-cancelled') break;
        globalThis.console?.warn?.('A recovery passkey did not answer.', error);
      }
    }
    return secrets;
  }

  /**
   * Keeps the recovery for a new sync password: the slots with a secret are sealed again; with no slots, the old way (the server's) goes on.
   * `serverStore(password, record, currentPassword)` is that old way. Resolves nothing; throws when what must be kept could not be.
   */
  async function keepRecovery({ password, record, currentPassword = '', secrets = {}, serverStore }) {
    await ensure();
    if (!state.slots.length) return serverStore(password, record, currentPassword);
    let stale = 0;
    const next = [];
    for (const slot of state.slots) {
      if (secrets[slot.id]) next.push(await rewrapRecoverySlot(slot, secrets[slot.id], { password, record }));
      else { next.push(slot); stale += 1; }
    }
    state = { ...state, slots: await store.save(next) };
    if (stale) showNotification(text('securityPasskeyStaleNotice', '有通行金鑰的救援資料還是舊的。請到「安全性與登入」按「更新」。'), 'error');
    return undefined;
  }

  // ----- forgot the sync password (Email verified): open a slot with its passkey
  /** Resolves { password, record, secrets } from the slot the person's passkey opens. */
  async function recover() {
    await ensure();
    if (!state.slots.length) throw Object.assign(new Error(), { code: 'passkey-none' });
    const found = await passkey.readAny({ rpId: rpId(), slots: state.slots });
    const opened = await openRecoverySlot(found.slot, found.secret);
    const local = await currentRecord();
    if (local && !isSlotCurrent(found.slot, local)) throw Object.assign(new Error(), { code: 'recovery-slot-stale' });
    return { password: opened.password, record: opened.record, secrets: { [found.slot.id]: found.secret } };
  }

  /** What the recovery panel offers: with the passkey, with the old Email way, or only starting over. */
  const recoveryOptions = async () => {
    const { slots, hasServerSlot, loaded } = await load();
    return { passkey: slots.length > 0, server: hasServerSlot || !loaded };
  };

  /** Shows the buttons the recovery panel really has (the state is read here, so the passkey is asked for right after the tap, with no wait). */
  async function syncRecoveryPanel() {
    const elements = getElements();
    const options = await recoveryOptions();
    show(elements.recoveryPasskeyButton, options.passkey);
    show(elements.recoveryButton, options.server);
  }

  const guard = (task) => async (event) => {
    event?.preventDefault?.();
    try { await task(); } catch (error) { notifyError(error); }
  };

  function bind() {
    const elements = getElements();
    if (!elements.passkeyCard || elements.passkeyCard.dataset.bound === 'true') return;
    elements.passkeyCard.dataset.bound = 'true';
    elements.passkeyAddButton.addEventListener('click', guard(add));
    elements.passkeyList.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-action]');
      const slotId = target?.closest('[data-slot-id]')?.dataset.slotId;
      if (!target || !slotId) return;
      guard(() => (target.dataset.action === 'update' ? update(slotId) : remove(slotId)))(event);
    });
  }

  return { bind, refresh, collectSecrets, keepRecovery, recover, syncRecoveryPanel, hasSlots: async () => (await ensure()).slots.length > 0, normalizeRecoverySlots };
}
