// The switch "Suggested reply" in the replies card of the settings (features/reply-suggestion.js): on by default, saved with the Save button like the others. The row is in the
// page (03-shell fragment); this fills it in the language of the settings and attaches the choice.

import { replySuggestionText } from '../features/reply-suggestion-texts.js';

const languageBound = new WeakSet();

function translate(row, language) {
  const label = row?.querySelector?.('label.pz-label');
  const hint = row?.querySelector?.('p');
  if (label) label.textContent = replySuggestionText(language, 'setting');
  if (hint) hint.textContent = replySuggestionText(language, 'hint');
}

export function ensureReplySuggestionSettingsControl({ document, elements, config }) {
  const row = document.getElementById('reply-suggestion-setting-row');
  if (!row || typeof row.querySelector !== 'function') return;
  translate(row, config.uiLanguage);
  const languageSelect = elements.uiLanguageSelect;
  if (languageSelect?.addEventListener && !languageBound.has(languageSelect)) {
    languageBound.add(languageSelect);
    languageSelect.addEventListener('change', (event) => translate(document.getElementById('reply-suggestion-setting-row'), event.target.value));
  }
  elements.replySuggestionToggle = row.querySelector('#reply-suggestion-toggle-switch');
  if (elements.replySuggestionToggle) elements.replySuggestionToggle.checked = config.replySuggestionEnabled !== false;
}
