// "When you press Send while a reply is running": steer, queue or send now (features/reply-steering.js). A choice in the replies card of the settings, saved with the Save button like the others.

import { REPLY_INPUT_MODES, normalizeReplyInputMode } from '../features/reply-steering.js';
import { replySteeringText } from '../features/reply-steering-texts.js';

const languageBound = new WeakSet();
const OPTION_KEYS = Object.freeze({ steer: 'steer', queue: 'queue', 'send-now': 'sendNow' });

function translate(row, language) {
  const label = row?.querySelector?.('label');
  const hint = row?.querySelector?.('p');
  if (label) label.textContent = replySteeringText(language, 'setting');
  if (hint) hint.textContent = replySteeringText(language, 'hint');
  row?.querySelectorAll?.('option').forEach((option) => { option.textContent = replySteeringText(language, OPTION_KEYS[option.value]); });
}

export function ensureReplyInputSettingsControl({ document, elements, config }) {
  const section = document.getElementById('accessibility-section');
  if (!section) return;
  let row = document.getElementById('reply-input-setting-row');
  if (!row) {
    row = document.createElement('div');
    row.id = 'reply-input-setting-row';
    row.className = 'mt-4';
    const anchor = document.getElementById('file-mode-setting-row') || document.getElementById('process-open-setting-row') || document.getElementById('vision-check-setting-row');
    if (anchor) anchor.after(row);
    else section.appendChild(row);
    const label = document.createElement('label');
    label.htmlFor = 'reply-input-mode-select';
    label.className = 'block text-sm font-medium mb-1';
    const hint = document.createElement('p');
    hint.className = 'text-xs text-[var(--text-secondary)] mb-2';
    const select = document.createElement('select');
    select.id = 'reply-input-mode-select';
    select.className = 'w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]';
    for (const mode of REPLY_INPUT_MODES) {
      const option = document.createElement('option');
      option.value = mode;
      select.append(option);
    }
    row.append(label, hint, select);
  }
  if (typeof row.querySelector !== 'function') return;
  translate(row, config.uiLanguage);
  const languageSelect = elements.uiLanguageSelect;
  if (languageSelect?.addEventListener && !languageBound.has(languageSelect)) {
    languageBound.add(languageSelect);
    languageSelect.addEventListener('change', (event) => translate(document.getElementById('reply-input-setting-row'), event.target.value));
  }
  elements.replyInputModeSelect = row.querySelector('#reply-input-mode-select');
  if (elements.replyInputModeSelect) elements.replyInputModeSelect.value = normalizeReplyInputMode(config.replyInputMode);
}
