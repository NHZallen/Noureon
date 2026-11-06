// Starts Branch Chat for the page: the button under a reply sends the event `noureon:branch-message`; the conversation is copied up to that reply, put at the top of the list and opened.
// It is loaded after the page; nothing of a reply waits for it.

import { branchConversation } from './branch-conversation.js';

export const BRANCH_EVENT = 'noureon:branch-message';

export function startBranch({ document, window = globalThis.window, configAccess, dataStore, i18n, saveAppData, showNotification, renderSidebar, openConversation = () => {} }) {
  const text = (key, values = {}) => {
    const table = i18n[configAccess.getUiLanguage()] || i18n['zh-TW'] || {};
    return String(table[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => (values[name] ?? ''));
  };
  async function run({ conversationId, messageIndex }) {
    const conversation = (dataStore.getConversations() || []).find((entry) => entry.id === conversationId);
    const branch = conversation ? branchConversation({ conversation, messageIndex, title: text('branchTitle', { title: String(conversation.title || '') }) }) : null;
    if (!branch) { showNotification(text('branchNothing'), 'error'); return null; }
    try {
      dataStore.getConversations().unshift(branch);
      await saveAppData({ immediateCloudSync: true });
      renderSidebar();
      openConversation(branch.id);
      showNotification(text('branchDone'), 'success');
      return branch;
    } catch {
      showNotification(text('branchFailed'), 'error');
      return null;
    }
  }
  document.addEventListener(BRANCH_EVENT, (event) => { void run({ conversationId: String(event.detail?.conversationId || ''), messageIndex: Number(event.detail?.messageIndex) }); });
  return { run };
}
