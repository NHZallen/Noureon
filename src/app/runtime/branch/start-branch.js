// Starts Branch Chat for the page: the button under a reply sends the event `noureon:branch-message`; the conversation is copied up to that reply, put at the top of the list and opened.
// It is loaded after the page; nothing of a reply waits for it.

import { branchConversation } from './branch-conversation.js';
import { branchButtonHTML } from './branch-button.js';

export const BRANCH_EVENT = 'noureon:branch-message';

/** Puts the branch button after the copy button under every reply that has none yet (the footers are made again each time the messages are drawn, so this is run again). */
export function decorateFooters(list, title) {
  if (!list || !title) return 0;
  let added = 0;
  for (const footer of list.querySelectorAll('.message-footer-left')) {
    if (footer.querySelector('.branch-message-btn')) continue;
    const copyButton = footer.querySelector('.copy-content-btn');
    if (copyButton) copyButton.insertAdjacentHTML('afterend', branchButtonHTML(title)); else footer.insertAdjacentHTML('afterbegin', branchButtonHTML(title));
    added += 1;
  }
  return added;
}

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
  // The buttons are put under the replies from here, not drawn by the code that draws the messages: that code is the biggest piece of the page and has no room (check:sizes).
  const list = document.getElementById('message-list');
  const Observer = window?.MutationObserver || globalThis.MutationObserver;
  if (list && Observer) {
    let queued = false;
    const run = () => { queued = false; decorateFooters(list, text('branchChat')); };
    new Observer(() => { if (!queued) { queued = true; (window.requestAnimationFrame || ((callback) => setTimeout(callback, 16)))(run); } }).observe(list, { childList: true, subtree: true });
    run();
  }
  document.addEventListener(BRANCH_EVENT, (event) => { void run({ conversationId: String(event.detail?.conversationId || ''), messageIndex: Number(event.detail?.messageIndex) }); });
  return { run };
}
