import { visionText } from '../../ui/files/vision/vision-texts.js';
import { FILE_MODES, chosenFileMode } from '../sandbox/file-mode.js';
import { sandboxText } from '../sandbox/sandbox-texts.js';

export function ensureAutoWebSearchSettingsControl({ document, elements }) {
  if (document.getElementById('auto-web-search-toggle-switch')) {
    elements.autoWebSearchToggleSwitch = document.getElementById('auto-web-search-toggle-switch');
    return;
  }
  const section = document.getElementById('accessibility-section');
  if (!section) return;
  const row = document.createElement('div');
  row.className = 'flex items-center justify-between mt-4';
  row.innerHTML = `
    <label for="auto-web-search-toggle-switch" class="flex-1 text-sm font-medium" data-lang-key="enableSmartWebSearch">Enable Smart Search</label>
    <div class="relative inline-block w-12 h-6 mr-2 align-middle select-none transition duration-200 ease-in">
      <input type="checkbox" name="auto-web-search-toggle-switch" id="auto-web-search-toggle-switch" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
      <label for="auto-web-search-toggle-switch" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
    </div>`;
  const anchor = section.querySelector('#auto-naming-toggle-switch')?.closest('.flex.items-center.justify-between');
  if (anchor) anchor.after(row);
  else section.appendChild(row);
  elements.autoWebSearchToggleSwitch = row.querySelector('#auto-web-search-toggle-switch');
}

export function ensureVisionCheckSettingsControl({ document, elements, config }) {
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
}

// "Mode for new chats": Standard or Advanced (Python in the browser).
export function ensureFileModeSettingsControl({ document, elements, config }) {
  const section = document.getElementById('accessibility-section');
  let row = document.getElementById('file-mode-setting-row');
  if (!section) return;
  if (!row) {
    row = document.createElement('div');
    row.id = 'file-mode-setting-row';
    row.className = 'mt-4';
    const anchor = document.getElementById('vision-check-setting-row');
    if (anchor) anchor.after(row);
    else section.appendChild(row);
    const label = document.createElement('label');
    label.htmlFor = 'file-mode-default-select';
    label.className = 'block text-sm font-medium mb-1';
    const hint = document.createElement('p');
    hint.className = 'text-xs text-[var(--text-secondary)] mb-2';
    const select = document.createElement('select');
    select.id = 'file-mode-default-select';
    select.className = 'w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]';
    for (const mode of [FILE_MODES.advanced, FILE_MODES.standard]) {
      const option = document.createElement('option');
      option.value = mode;
      select.append(option);
    }
    row.append(label, hint, select);
  }
  if (typeof row.querySelector !== 'function') return;
  translateFileModeRow(row, config.uiLanguage);
  const languageSelect = elements.uiLanguageSelect;
  if (languageSelect?.addEventListener && !fileModeLanguageBound.has(languageSelect)) {
    fileModeLanguageBound.add(languageSelect);
    languageSelect.addEventListener('change', (event) => {
      translateFileModeRow(document.getElementById('file-mode-setting-row'), event.target.value);
    });
  }
  elements.fileModeDefaultSelect = row.querySelector('#file-mode-default-select');
  if (elements.fileModeDefaultSelect) elements.fileModeDefaultSelect.value = chosenFileMode(null, config);
}

const fileModeLanguageBound = new WeakSet();

function translateFileModeRow(row, language) {
  const label = row?.querySelector?.('label');
  const hint = row?.querySelector?.('p');
  if (label) label.textContent = sandboxText(language, 'fileModeDefaultSetting');
  if (hint) hint.textContent = sandboxText(language, 'fileModeDefaultSettingNote');
  row?.querySelectorAll?.('option').forEach((option) => {
    option.textContent = sandboxText(language, option.value === FILE_MODES.advanced ? 'fileModeAdvanced' : 'fileModeStandard');
  });
}

const languageBound = new WeakSet();

function translateVisionCheckRow(row, language) {
  const label = row?.querySelector?.('label[for="vision-check-toggle-switch"]');
  const hint = row?.querySelector?.('p');
  if (label) label.textContent = visionText(language, 'setting');
  if (hint) hint.textContent = visionText(language, 'hint');
}
