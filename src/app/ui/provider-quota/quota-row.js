// The row above the Extensions entry of the left menu where the usage rings of the providers stand side by side (OpenCode Go: opencode-quota/, OpenRouter:
// openrouter-ring.js). The row is made by the first ring that asks for it and stays above the Extensions entry, which is made by another part of the page, a
// moment later. An empty row (no ring is shown) takes no room (styles/opencode-quota.css).

export const QUOTA_ROW_ID = 'provider-quota-row';
const EXTENSIONS_ID = 'open-cli-store-btn';

export function getQuotaRow(document) {
  const list = document.querySelector('#sidebar .overflow-y-auto');
  if (!list) return null;
  let row = document.getElementById(QUOTA_ROW_ID);
  if (!row) {
    row = document.createElement('div');
    row.id = QUOTA_ROW_ID;
    row.className = 'oq-row';
  }
  const place = () => {
    const entry = document.getElementById(EXTENSIONS_ID);
    const before = entry && entry.parentNode === list ? entry : list.firstChild;
    if (before === row || (row.parentNode === list && row.nextSibling === before)) return;
    list.insertBefore(row, before);
  };
  place();
  const win = document.defaultView;
  if (!row.dataset.watched && typeof win?.MutationObserver === 'function') {
    row.dataset.watched = 'true';
    new win.MutationObserver(() => place()).observe(list, { childList: true });
  }
  return row;
}
