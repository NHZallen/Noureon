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
    block = document.createElement('div');
    block.id = BLOCK_ID;
    block.className = 'mt-6';
    section.appendChild(block);
  }
  if (typeof block.replaceChildren !== 'function') return;

  let language = config.uiLanguage;
  let usage = null;
  const draw = () => {
    block.replaceChildren();
    if (getSync()?.getStatus?.()?.enabled !== true) return;
    const title = document.createElement('h3');
    title.className = 'text-lg font-semibold mb-2';
    title.textContent = permissionText(language, 'storageTitle');
    block.appendChild(title);
    if (!usage?.ok || usage.usedBytes === null) {
      const unknown = document.createElement('p');
      unknown.className = 'text-xs text-[var(--text-secondary)]';
      unknown.textContent = usage ? permissionText(language, 'storageUnknown') : '…';
      block.appendChild(unknown);
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
    block.append(label, track);
    if (full) {
      const warning = document.createElement('p');
      warning.className = 'text-xs mt-2';
      warning.textContent = permissionText(language, 'storageFull');
      block.appendChild(warning);
    }
    const note = document.createElement('p');
    note.className = 'text-xs text-[var(--text-secondary)] mt-2';
    note.textContent = permissionText(language, 'storageNote');
    block.appendChild(note);
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
