// Starts sharing for the page (docs/superpowers/specs/2026-10-31-conversation-share-design.md): keeps the list of the person's shares, opens the dialog when a menu asks (the event
// `astra:share-conversation`), draws the card "Shared items" in the Data tab and warns before a shared conversation is deleted. It is loaded after the page; a reply never waits for it.

import { getAnnouncedUser, USER_READY_EVENT } from '../features/user-ready.js';
import { getSupabaseClient } from '../../auth/supabase-client.js';
import { SERVICES, getService } from '../services.js';
import { createShareClient } from './share-client.js';
import { createShareState } from './share-state.js';
import { setShares } from './share-ref.js';
import { openShareDialog } from '../../ui/share/share-dialog.js';
import { ensureSharedItemsCard } from '../../ui/share/shared-items-card.js';

export const SHARE_EVENT = 'astra:share-conversation';

const nameOf = (user) => {
  const candidate = String(user?.displayName || user?.username || '').trim();
  return candidate && !candidate.includes('@') ? candidate : '';
};

export function startShares({ document, window = globalThis.window, configAccess, dataStore, i18n, saveAppData, showNotification, showCustomConfirm, renderSidebar, client = null }) {
  const state = createShareState();
  const shareClient = client || createShareClient({ getSupabase: () => { try { return getSupabaseClient(); } catch { return null; } } });
  const text = (key, values = {}) => {
    const table = i18n[configAccess.getUiLanguage()] || i18n['zh-TW'] || {};
    return String(table[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => (values[name] ?? ''));
  };
  const cloudOn = () => getService(SERVICES.cloudSync)?.getStatus?.()?.enabled === true;
  const conversationOf = (id) => (dataStore.getConversations() || []).find((entry) => entry.id === id);
  let loading = null;

  async function reload() {
    if (!cloudOn()) { state.clear(); return; }
    loading = loading || shareClient.list().then((result) => { if (result.ok) state.replace(result.items); return result; }).finally(() => { loading = null; });
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

  async function confirmDelete(ids) {
    if (!cloudOn()) return true;
    if (!state.isLoaded()) await reload();
    const count = [...ids].reduce((sum, id) => sum + state.activeFor(id).length, 0);
    if (count === 0) return true;
    return showCustomConfirm(text('csDeleteBody', { n: count }), text('csDeleteTitle'));
  }

  window.addEventListener(SHARE_EVENT, (event) => { void open(String(event.detail?.id || '')); });
  document.addEventListener(USER_READY_EVENT, () => { state.clear(); void reload(); });
  state.onChange(() => { try { renderSidebar(); } catch { /* the sidebar draws the tags the next time */ } });
  // The card of the Data tab is drawn each time the settings are opened (settings-vision-check-section.js asks for it through share-ref.js).
  const ensureCard = (args) => ensureSharedItemsCard({ ...args, state, client: shareClient, text, reload, cloudOn, copy, notify: showNotification, confirm: (message, title) => showCustomConfirm(message, title) });
  return setShares({ state, open, reload, ensureCard, confirmDelete: (ids) => confirmDelete(typeof ids === 'string' ? [ids] : ids) });
}
