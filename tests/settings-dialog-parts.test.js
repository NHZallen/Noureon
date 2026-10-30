import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import fragment03 from '../src/templates/fragments/03-shell.fragment.js';
import { createSettingsDialogParts } from '../src/app/runtime/settings/settings-dialog-parts.js';

// The parts of the settings dialog that load with it (not with the page): the visual check row and the memory of notes. Built once, filled from the settings every time the dialog is built.
test('the dialog parts are built once and filled from the settings each time', () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `<ul id="settings-nav"><li class="settings-nav-item" data-section="personalization"></li></ul><div id="personalization-section"></div>${fragment03}`;
  const elements = { uiLanguageSelect: null };
  const config = { uiLanguage: 'en', visionCheckEnabled: false, processOpen: true };
  const parts = createSettingsDialogParts({
    document, elements,
    models: [{ id: 'gemini-3.5-flash-lite', name: 'Flash Lite' }], i18n: { en: {}, 'zh-TW': {} }, config,
    getApiKeyForProvider: () => '', saveConfig: async () => {}, showNotification() {}, showCustomPrompt: async () => null, showCustomDialog: async () => true
  });
  assert.equal(parts.build(), true, 'built the first time');
  assert.equal(elements.visionCheckToggleSwitch?.checked, false);
  assert.equal(elements.processToggle?.checked, true);
  assert.ok(document.getElementById('memory-notes-settings'), 'the memory of notes is in the dialog');
  config.processOpen = false;
  assert.equal(parts.build(), false, 'only filled again');
  assert.equal(elements.processToggle.checked, false);
  assert.equal(document.querySelectorAll('#memory-notes-settings').length, 1);
  window.close();
});
