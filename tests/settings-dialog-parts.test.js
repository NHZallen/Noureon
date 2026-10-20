import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import fragment03 from '../src/templates/fragments/03-shell.fragment.js';
import { createSettingsDialogParts } from '../src/app/runtime/legacy-core/settings-dialog-parts.js';

// The parts of the settings dialog that load with it (not with the page): the visual check row, the memory summary and the recall of
// past conversations. Built once, filled from the settings every time the dialog is built.
test('the dialog parts are built once and filled from the settings each time', () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `<ul id="settings-nav"><li class="settings-nav-item" data-section="personalization"></li></ul><div id="personalization-section"></div>${fragment03}`;
  const elements = {
    memoryToggle1: document.getElementById('memory-toggle-1'),
    autoMemoryToggleSwitch: document.getElementById('auto-memory-toggle-switch'),
    uiLanguageSelect: null
  };
  const config = { uiLanguage: 'en', memoryProfileEnabled: false, enableAutoMemory: true, historyRecallEnabled: true, visionCheckEnabled: false, processOpen: true };
  const parts = createSettingsDialogParts({
    document, elements, state: { memoryState: {} },
    legacyRuntimeContext: { resolveOptionalBinding: () => null, resolveBinding: () => () => null, registerLazyBinding() {} },
    models: [{ id: 'gemini-3.5-flash-lite', name: 'Flash Lite' }], i18n: { en: {}, 'zh-TW': {} }, config,
    getApiKeyForProvider: () => '', saveConfig: async () => {}, showNotification() {}, showCustomPrompt: async () => null, showCustomDialog: async () => true
  });
  assert.equal(parts.build(), true, 'built the first time');
  assert.equal(document.getElementById('history-recall-toggle-switch')?.checked, true);
  assert.equal(elements.visionCheckToggleSwitch?.checked, false);
  assert.equal(elements.processToggle?.checked, true);
  assert.ok(document.getElementById('memory-summary-settings'), 'the memory summary is in the dialog');
  config.processOpen = false;
  assert.equal(parts.build(), false, 'only filled again');
  assert.equal(elements.processToggle.checked, false);
  assert.equal(document.querySelectorAll('#memory-summary-settings').length, 1);
  assert.equal(typeof parts.resolveHistoryRecallEnabled, 'function');
  window.close();
});
