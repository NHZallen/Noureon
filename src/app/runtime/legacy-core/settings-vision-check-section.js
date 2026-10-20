// The automatic visual check row of the settings, with the Privacy and Permissions tabs and the storage lines that are set up with it.
// Loaded with the settings dialog (settings-dialog-parts.js), not with the page; the lighter rows stay in settings-vision-check-control.js.

import { ensurePrivacySettingsSection } from './settings-privacy-section.js';
import { ensurePermissionsSettingsSection } from './settings-permissions-section.js';
import { ensureWorkspaceStorageStatus } from './settings-workspace-storage-status.js';
import { ensureProcessOpenSettingsControl } from './settings-vision-check-control.js';
import { visionText } from '../../ui/files/vision/vision-texts.js';

export function ensureVisionCheckSettingsControl({ document, elements, config, saveConfig, showNotification }) {
  // The Privacy and Permissions tabs are set up with the other tabs that are added here.
  ensurePrivacySettingsSection({ document, elements, config, saveConfig });
  ensurePermissionsSettingsSection({ document, elements, config, saveConfig, showNotification });
  // The cloud space line is loaded with the settings, not with the page.
  void import('./settings-storage-usage.js').then(({ ensureStorageUsageBlock }) => ensureStorageUsageBlock({ document, elements, config })).catch(() => {});
  ensureWorkspaceStorageStatus({ document, elements, config });
  const section = document.getElementById('accessibility-section');
  if (!section) return;
  let row = document.getElementById('vision-check-setting-row');
  if (!row) {
    row = document.createElement('div');
    row.id = 'vision-check-setting-row';
    row.className = 'mt-4';
    const anchor = section.querySelector('#auto-web-search-toggle-switch')?.closest('.flex.items-center.justify-between');
    if (anchor) anchor.after(row);
    else section.appendChild(row);
    const line = document.createElement('div');
    line.className = 'flex items-center justify-between';
    const label = document.createElement('label');
    label.htmlFor = 'vision-check-toggle-switch';
    label.className = 'flex-1 text-sm font-medium';
    const control = document.createElement('div');
    control.className = 'relative inline-block w-12 h-6 mr-2 align-middle select-none transition duration-200 ease-in';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'vision-check-toggle-switch';
    input.className = 'toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer';
    const track = document.createElement('label');
    track.htmlFor = input.id;
    track.className = 'toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer';
    control.append(input, track);
    line.append(label, control);
    const hint = document.createElement('p');
    hint.className = 'text-xs text-[var(--text-secondary)] mt-1';
    row.append(line, hint);
  }
  if (typeof row.querySelector !== 'function') return;
  translateVisionCheckRow(row, config.uiLanguage);
  // The language menu applies at once while settings stay open.
  const languageSelect = elements.uiLanguageSelect;
  if (languageSelect?.addEventListener && !languageBound.has(languageSelect)) {
    languageBound.add(languageSelect);
    languageSelect.addEventListener('change', (event) => {
      translateVisionCheckRow(document.getElementById('vision-check-setting-row'), event.target.value);
    });
  }
  elements.visionCheckToggleSwitch = row.querySelector('#vision-check-toggle-switch');
  ensureProcessOpenSettingsControl({ document, elements, config });
}

const languageBound = new WeakSet();

function translateVisionCheckRow(row, language) {
  const label = row?.querySelector?.('label[for="vision-check-toggle-switch"]');
  const hint = row?.querySelector?.('p');
  if (label) label.textContent = visionText(language, 'setting');
  if (hint) hint.textContent = visionText(language, 'hint');
}
