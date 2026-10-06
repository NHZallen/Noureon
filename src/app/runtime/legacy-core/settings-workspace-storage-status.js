// One quiet line at the very bottom of the Data management tab about where the workspace is kept (workspace-store-v2.js). It says so when the
// split storage is in use (so that a missing line means the old single item is in use), and when something is worth knowing: conversations
// that could not be read, a migration that failed or was given up, a split storage that could not be used, a rollback that did not happen.
// Nothing is shown for the old single item.

import { permissionText } from '../cli/permission-texts.js';

const LINE_ID = 'workspace-storage-status';
const languageBound = new WeakSet();

// Which sentence to show for what the loading code recorded (globalThis.__noureonWorkspaceStorage), or null for none.
export function pickWorkspaceStorageStatus(status) {
  if (!status) return null;
  if (status.mode === 'v2') {
    if (status.rollbackFailed) return { key: 'wsRollbackFailed' };
    if (status.problems?.length) return { key: 'wsDegraded', values: { count: status.problems.length } };
    return { key: 'wsActive' };
  }
  if (status.reason === 'migration-failed') return { key: 'wsFailed' };
  if (status.reason === 'migration-gave-up') return { key: 'wsGaveUp' };
  if (String(status.reason || '').startsWith('unusable') || status.reason === 'error') return { key: 'wsUnusable' };
  return null;
}

export function ensureWorkspaceStorageStatus({
  document,
  elements,
  config,
  getStatus = () => globalThis.__noureonWorkspaceStorage
}) {
  const section = document.getElementById('data-management-section');
  if (!section || typeof section.appendChild !== 'function') return;
  let line = document.getElementById(LINE_ID);
  if (!line) {
    line = document.createElement('p');
    line.id = LINE_ID;
    line.className = 'text-xs text-[var(--text-secondary)] mt-4 px-1 hidden';
    // At the very end, so that it never sits between two cards (the spacing of the cards depends on one following the other).
    (section.querySelector?.('.pz') || section).appendChild(line);
  }

  let language = config.uiLanguage;
  const draw = () => {
    const picked = pickWorkspaceStorageStatus(getStatus());
    line.textContent = picked ? permissionText(language, picked.key, picked.values) : '';
    // (A page built from a minimal fake document has no classList.toggle.)
    if (typeof line.classList?.toggle === 'function') line.classList.toggle('hidden', !picked);
  };
  draw();
  const languageSelect = elements?.uiLanguageSelect;
  if (languageSelect?.addEventListener && !languageBound.has(languageSelect)) {
    languageBound.add(languageSelect);
    languageSelect.addEventListener('change', (event) => { language = event.target.value; draw(); });
  }
}
