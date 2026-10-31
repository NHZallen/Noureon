// Starts sharing for the page (docs/superpowers/specs/2026-10-31-conversation-share-design.md): keeps the list of the person's shares, opens the dialog when a menu asks (the event
// `astra:share-conversation`), draws the card "Shared items" in the Data tab and warns before a shared conversation is deleted. It is loaded after the page; a reply never waits for it.

import { getAnnouncedUser, USER_READY_EVENT } from '../features/user-ready.js';
import { getSupabaseClient } from '../../auth/supabase-client.js';
import { SERVICES, getService } from '../services.js';
import { createShareClient } from './share-client.js';
import { createShareState } from './share-state.js';
import { setShares } from './share-ref.js';
import { MODELS } from '../shell/model-registry.js';
import { getDefaultGenConfig } from '../shell/conversation-actions.js';
import { createDisabledCouncilConfig } from '../shell/conversation-council-state.js';
import { getStorageUsage } from '../cli/storage-client.js';
import { PENDING_SHARE_KEY } from '../../share-page/share-route.js';
import { getSupabaseUrl } from '../../auth/supabase-client.js';
import { importSharedConversation } from './share-import.js';
import { openShareDialog } from '../../ui/share/share-dialog.js';
import { ensureSharedItemsCard } from '../../ui/share/shared-items-card.js';

export const SHARE_EVENT = 'astra:share-conversation';
const PENDING_MAX_MS = 60 * 60 * 1000;
const LIST_WAIT_MS = 8000;

/** `promise`, or { ok: false, code: 'timeout' } when it has not answered in `ms`. */
const waitAtMost = (promise, ms) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ ok: false, code: 'timeout' }), ms);
  Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve({ ok: false, code: 'failed' }); });
});

const nameOf = (user) => {
  const candidate = String(user?.displayName || user?.username || '').trim();
  return candidate && !candidate.includes('@') ? candidate : '';
};

export function startShares({ document, window = globalThis.window, configAccess, dataStore, i18n, saveAppData, showNotification, showCustomConfirm, renderSidebar, openConversation = () => {}, client = null, storage = null, supabase = null, quota = getStorageUsage }) {
  const state = createShareState();
  const shareClientSupabase = () => { if (supabase) return supabase; try { return getSupabaseClient(); } catch { return null; } };
  const shareClient = client || createShareClient({ getSupabase: shareClientSupabase });
  const text = (key, values = {}) => {
    const table = i18n[configAccess.getUiLanguage()] || i18n['zh-TW'] || {};
    return String(table[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => (values[name] ?? ''));
  };
  const cloudOn = () => getService(SERVICES.cloudSync)?.getStatus?.()?.enabled === true;
  const conversationOf = (id) => (dataStore.getConversations() || []).find((entry) => entry.id === id);
  let loading = null;

  async function reload() {
    if (!cloudOn()) { state.clear(); return; }
    // A list that never answers must not stay "being read" for good: after a while it is given up, and the next call asks again.
    loading = loading || waitAtMost(shareClient.list(), LIST_WAIT_MS).then((result) => { if (result.ok) state.replace(result.items); return result; }).finally(() => { loading = null; });
    return loading;
  }
  // The conversation has to be in the cloud before the server can read it.
  const flush = async () => {
    try { await saveAppData({ immediateCloudSync: true }); } catch { /* the server says if the conversation is not there */ }
    try { await getService(SERVICES.cloudSync)?.flush?.(); } catch { /* same */ }
  };
  const copy = async (value) => {
    try { await (window?.navigator || globalThis.navigator).clipboard.writeText(value); return true; } catch { return false; }
  };

  async function open(conversationId) {
    const conversation = conversationOf(conversationId);
    if (!conversation) return;
    if (!cloudOn()) { showNotification(text('csNeedCloud'), 'error'); return; }
    if (conversation.isTemporary) { showNotification(text('csTemporary'), 'error'); return; }
    if (!(conversation.messages || []).some((message) => !message.deletedAt)) { showNotification(text('csEmpty'), 'error'); return; }
    if (!state.isLoaded()) await reload();
    await openShareDialog({
      document, text, client: shareClient, state, conversation, ownerName: nameOf(getAnnouncedUser()),
      existing: state.activeFor(conversationId)[0] || null, flush, copy, notify: showNotification,
      confirm: (message, title) => showCustomConfirm(message, title)
    });
  }

  // The warning is a help, never a gate: it uses only what is already known (the list is read when the account is ready), and deleting never waits for the network. A list that is not
  // there yet is asked for in the background, and the conversation is deleted as it always was.
  async function confirmDelete(ids) {
    try {
      if (!cloudOn()) return true;
      if (!state.isLoaded()) { void reload(); return true; }
      const count = [...ids].reduce((sum, id) => sum + state.activeFor(id).length, 0);
      if (count === 0) return true;
      return await showCustomConfirm(text('csDeleteBody', { n: count }), text('csDeleteTitle'));
    } catch {
      return true;
    }
  }

  // ----- "Copy to my conversations": the viewer leaves the code in the storage of the site and sends the person here; it is taken once there is a cloud account.
  const pendingStorage = () => storage || (() => { try { return globalThis.localStorage || null; } catch { return null; } })();
  const readPending = () => {
    const store = pendingStorage();
    try {
      const pending = JSON.parse(store?.getItem(PENDING_SHARE_KEY) || 'null');
      if (pending && /^[A-Za-z0-9]{24,64}$/.test(String(pending.code)) && Date.now() - Number(pending.at) < PENDING_MAX_MS) return pending;
    } catch { /* not ours */ }
    try { store?.removeItem(PENDING_SHARE_KEY); } catch { /* nothing to do */ }
    return null;
  };
  let importing = false;
  async function takePending() {
    const pending = readPending();
    if (!pending || importing) return;
    const user = getAnnouncedUser();
    if (!user) return; // not signed in yet: the key stays for after the login
    if (!user.supabaseUserId) { try { pendingStorage()?.removeItem(PENDING_SHARE_KEY); } catch { /* nothing */ } showNotification(text('csImportNeedSignIn'), 'error'); return; }
    if (!cloudOn()) return; // the cloud account is still starting
    importing = true;
    try { pendingStorage()?.removeItem(PENDING_SHARE_KEY); } catch { /* nothing */ }
    try {
      const config = configAccess.getConfig();
      const model = MODELS.find((entry) => entry.id === config.lastUsedModel) || MODELS.find((entry) => entry.id === config.defaultModel) || MODELS[0];
      const database = shareClientSupabase();
      const result = await importSharedConversation({
        code: pending.code,
        read: async (code) => { const { data, error } = await database.rpc('get_shared_conversation', { p_code: code }); if (error) throw error; return data; },
        quota, fetchImpl: window.fetch.bind(window), baseUrl: getSupabaseUrl(),
        defaults: { model: model.id, provider: model.provider, genConfig: getDefaultGenConfig(), council: createDisabledCouncilConfig(config.lastCouncilConfig) }
      });
      if (!result.ok) { showNotification(text(result.code === 'gone' ? 'csErrGone' : 'csImportFailed'), 'error'); return; }
      dataStore.getConversations().unshift(result.conversation);
      await saveAppData({ immediateCloudSync: true });
      renderSidebar();
      openConversation(result.conversation.id);
      showNotification(text(result.textOnly ? 'csImportTextOnly' : 'csImportDone'), result.textOnly ? 'error' : 'success');
    } catch {
      showNotification(text('csImportFailed'), 'error');
    } finally { importing = false; }
  }
  // The account may take a moment to be ready after the page opens or after the login: look a few times.
  const lookForPending = () => { for (const wait of [0, 2000, 6000, 15000, 30000]) setTimeout(() => { void takePending(); }, wait); };
  lookForPending();

  window.addEventListener(SHARE_EVENT, (event) => { void open(String(event.detail?.id || '')); });
  document.addEventListener(USER_READY_EVENT, () => { state.clear(); void reload(); if (readPending()) lookForPending(); });
  state.onChange(() => { try { renderSidebar(); } catch { /* the sidebar draws the tags the next time */ } });
  // The card of the Data tab is drawn each time the settings are opened (settings-vision-check-section.js asks for it through share-ref.js).
  const ensureCard = (args) => ensureSharedItemsCard({ ...args, state, client: shareClient, text, reload, cloudOn, copy, notify: showNotification, confirm: (message, title) => showCustomConfirm(message, title) });
  return setShares({ state, open, reload, ensureCard, confirmDelete: (ids) => confirmDelete(typeof ids === 'string' ? [ids] : ids) });
}
