import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { ensureVisionCheckSettingsControl } from '../../src/app/runtime/legacy-core/settings-vision-check-control.js';
import { visionText } from '../../src/app/ui/files/vision/vision-texts.js';

test('visual check setting sits beside web search and translates in all five languages', () => {
  const window = new Window();
  try {
    const document = window.document;
    document.body.innerHTML = '<section id="accessibility-section"><div class="flex items-center justify-between"><input id="auto-web-search-toggle-switch"></div></section>';
    const elements = {};
    for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
      ensureVisionCheckSettingsControl({ document, elements, config: { uiLanguage: language } });
      const row = document.getElementById('vision-check-setting-row');
      assert.equal(row.previousElementSibling.querySelector('input').id, 'auto-web-search-toggle-switch');
      assert.equal(row.querySelector('label').textContent, visionText(language, 'setting'));
      assert.equal(row.querySelector('p').textContent, visionText(language, 'hint'));
      assert.equal(elements.visionCheckToggleSwitch, row.querySelector('input'));
    }
    assert.equal(document.querySelectorAll('#vision-check-setting-row').length, 1);
  } finally {
    window.happyDOM.abort();
  }
});
