// The button under a reply that branches the conversation from it. Nothing is drawn without a title (the page of a shared conversation has no such button).

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-12 7"/></svg>';

const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function branchButtonHTML(title) {
  if (!title) return '';
  return `<button type="button" class="branch-message-btn p-1 rounded-md hover:bg-gray-500/20 text-[var(--text-secondary)] opacity-50 hover:opacity-100 transition-opacity" title="${escapeText(title)}" aria-label="${escapeText(title)}">${ICON}</button>`;
}
