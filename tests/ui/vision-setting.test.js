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

test('visual check setting follows the language menu while settings stay open', () => {
  const window = new Window();
  try {
    const document = window.document;
    document.body.innerHTML = '<section id="accessibility-section"><div class="flex items-center justify-between"><input id="auto-web-search-toggle-switch"></div></section><select id="lang"><option value="zh-TW"></option><option value="fr"></option></select>';
    const elements = { uiLanguageSelect: document.getElementById('lang') };
    ensureVisionCheckSettingsControl({ document, elements, config: { uiLanguage: 'zh-TW' } });
    ensureVisionCheckSettingsControl({ document, elements, config: { uiLanguage: 'zh-TW' } });
    elements.uiLanguageSelect.value = 'fr';
    elements.uiLanguageSelect.dispatchEvent(new window.Event('change'));
    const row = document.getElementById('vision-check-setting-row');
    assert.equal(row.querySelector('label').textContent, visionText('fr', 'setting'));
    assert.equal(row.querySelector('p').textContent, visionText('fr', 'hint'));
  } finally {
    window.happyDOM.abort();
  }
});

test('the setting for showing the steps by default sits under the visual check one, follows the config, and translates', async () => {
  const { sandboxText } = await import('../../src/app/runtime/sandbox/sandbox-texts.js');
  const window = new Window();
  try {
    const document = window.document;
    document.body.innerHTML = '<section id="accessibility-section"><div class="flex items-center justify-between"><input id="auto-web-search-toggle-switch"></div></section><select id="lang"><option value="zh-TW"></option><option value="fr"></option></select>';
    const elements = { uiLanguageSelect: document.getElementById('lang') };
    ensureVisionCheckSettingsControl({ document, elements, config: { uiLanguage: 'zh-TW', processOpen: true } });
    const row = document.getElementById('process-open-setting-row');
    assert.equal(row.previousElementSibling.id, 'vision-check-setting-row');
    assert.equal(elements.processToggle.checked, true);
    assert.equal(row.querySelector('label').textContent, sandboxText('zh-TW', 'processOpenSetting'));
    ensureVisionCheckSettingsControl({ document, elements, config: { uiLanguage: 'zh-TW', processOpen: false } });
    assert.equal(elements.processToggle.checked, false);
    assert.equal(document.querySelectorAll('#process-open-setting-row').length, 1);
    elements.uiLanguageSelect.value = 'fr';
    elements.uiLanguageSelect.dispatchEvent(new window.Event('change'));
    assert.equal(row.querySelector('label').textContent, sandboxText('fr', 'processOpenSetting'));
    assert.equal(row.querySelector('p').textContent, sandboxText('fr', 'processOpenHint'));
    for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
      assert.ok(sandboxText(language, 'processWorking') && sandboxText(language, 'processOpenSetting') && sandboxText(language, 'processOpenHint'), language);
    }
  } finally {
    window.happyDOM.abort();
  }
});
