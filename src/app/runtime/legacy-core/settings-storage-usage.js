// The "Cloud space" line of the Data management tab of the settings: how much of the person's 500 MB is used, with a thin bar. It is only
// drawn for a signed-in cloud account (the files are kept there) and is read again each time the settings are opened.

import { formatBytes, getStorageUsage } from '../cli/storage-client.js';
import { permissionText } from '../cli/permission-texts.js';

const BLOCK_ID = 'storage-usage-block';
const languageBound = new WeakSet();

export function ensureStorageUsageBlock({ document, elements, config, getSync = () => globalThis.__astraCloudSyncV2, read = getStorageUsage }) {
  const section = document.getElementById('data-management-section');
  if (!section || typeof section.appendChild !== 'function') return;
  let block = document.getElementById(BLOCK_ID);
  if (!block) {
    // In the cards of the tab it is a card of its own above the danger card; in a page without them, a block at the end.
    const cards = section.querySelector?.('.pz');
    block = document.createElement('div');
    block.id = BLOCK_ID;
    block.className = cards ? 'pz-card' : 'mt-6';
    const danger = cards?.querySelector?.('.pz-danger');
    if (danger) cards.insertBefore(block, danger);
    else (cards || section).appendChild(block);
  }
  if (typeof block.replaceChildren !== 'function') return;

  let language = config.uiLanguage;
  let usage = null;
  const draw = () => {
    block.replaceChildren();
    // Without a cloud account there is nothing to show, and an empty card would still draw its border as a thin bar.
    const enabled = getSync()?.getStatus?.()?.enabled === true;
    if (typeof block.classList?.toggle === 'function') block.classList.toggle('hidden', !enabled);
    if (!enabled) return;
    const card = block.classList?.contains?.('pz-card') === true;
    const title = document.createElement('h3');
    title.textContent = permissionText(language, 'storageTitle');
    let out = block;
    if (card) {
      const head = document.createElement('div');
      head.className = 'pz-head';
      head.appendChild(title);
      out = document.createElement('div');
      out.className = 'pz-block';
      block.append(head, out);
    } else {
      title.className = 'text-lg font-semibold mb-2';
      block.appendChild(title);
    }
    if (!usage?.ok || usage.usedBytes === null) {
      const unknown = document.createElement('p');
      unknown.className = 'text-xs text-[var(--text-secondary)]';
      unknown.textContent = usage ? permissionText(language, 'storageUnknown') : '…';
      out.appendChild(unknown);
      return;
    }
    const full = usage.usedBytes >= usage.quotaBytes;
    const label = document.createElement('p');
    label.className = 'text-sm mb-1';
    label.textContent = permissionText(language, 'storageUsed', { used: formatBytes(usage.usedBytes), total: formatBytes(usage.quotaBytes) });
    const track = document.createElement('div');
    track.className = 'storage-usage-track';
    const fill = document.createElement('div');
    fill.className = `storage-usage-fill${full ? ' is-full' : ''}`;
    fill.style.width = `${Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100))}%`;
    track.appendChild(fill);
    out.append(label, track);
    if (full) {
      const warning = document.createElement('p');
      warning.className = 'text-xs mt-2';
      warning.textContent = permissionText(language, 'storageFull');
      out.appendChild(warning);
    }
    const note = document.createElement('p');
    note.className = 'text-xs text-[var(--text-secondary)] mt-2';
    note.textContent = permissionText(language, 'storageNote');
    out.appendChild(note);
  };

  draw();
  if (getSync()?.getStatus?.()?.enabled === true) {
    void read().then((result) => { usage = result; draw(); }).catch(() => { usage = { ok: false }; draw(); });
  }
  // The language menu applies at once while the settings stay open.
  const languageSelect = elements?.uiLanguageSelect;
  if (languageSelect?.addEventListener && !languageBound.has(languageSelect)) {
    languageBound.add(languageSelect);
    languageSelect.addEventListener('change', (event) => { language = event.target.value; draw(); });
  }
}
