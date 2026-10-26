// "When you press Send while a reply is running": steer, queue or send now (features/reply-steering.js). A choice in the replies card of the settings, saved with the Save button like the others.

import { normalizeReplyInputMode } from '../features/reply-steering.js';
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
  // The row is in the page (the Accessibility card); this only fills it in the language of the settings and attaches the choice.
  const row = document.getElementById('reply-input-setting-row');
  if (!row) return;
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
