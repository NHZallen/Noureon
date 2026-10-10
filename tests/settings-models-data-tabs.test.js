import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import fragment03 from '../src/templates/fragments/03-shell.fragment.js';
import fragment04 from '../src/templates/fragments/04-shell.fragment.js';
import { ensureStorageUsageBlock } from '../src/app/runtime/legacy-core/settings-storage-usage.js';
import { ensureAutoWebSearchSettingsControl, ensureFileModeSettingsControl, ensureProcessOpenSettingsControl, ensureVisionCheckSettingsControl } from '../src/app/runtime/legacy-core/settings-vision-check-control.js';
import { createSettingsMemorySummaryControls } from '../src/app/runtime/legacy-core/settings-memory-summary-controls.js';

// The Models and Data tabs are written out in full in the page (03-shell fragment): the controls that used to build them find
// what is there and only attach to it.
const NEXT_SECTION = { 'model-management-section': 'data-management-section', 'data-management-section': 'accessibility-section', 'accessibility-section': 'trash-section' };
const sectionHtml = (id) => {
  const start = fragment03.indexOf(`<div id="${id}"`);
  const end = id === 'accessibility-section' ? fragment03.length : fragment03.indexOf(`<div id="${NEXT_SECTION[id]}"`);
  assert.ok(start >= 0 && end > start, `${id} is in the page`);
  return fragment03.slice(start, end);
};

const createPage = () => {
  const window = new Window({ url: 'https://example.test/' });
  window.document.body.innerHTML = `${sectionHtml('model-management-section')}${sectionHtml('data-management-section')}`;
  return window;
};

test('the Models tab has every field in its final place, in cards', () => {
  const { document } = createPage();
  const cards = [...document.querySelectorAll('#model-management-section .pz-card')];
  assert.deepEqual(cards.map((card) => card.querySelector('.pz-head h3').dataset.langKey),
    ['apiKeyManagement', 'settingsCardWebSearch', 'settingsCardDocTranslation', 'settingsCardMemory']);
  const idsIn = (card) => [...card.querySelectorAll('[id]')].map((element) => element.id);
  assert.deepEqual(idsIn(cards[0]), ['gemini-api-key-input', 'openrouter-api-key-input-all', 'nvidia-api-key-input', 'clear-all-api-keys-btn']);
  assert.deepEqual(idsIn(cards[1]), ['search-provider-select', 'tavily-api-key-input', 'tavily-search-depth-select', 'tinyfish-api-key-link', 'tinyfish-api-key-input']);
  assert.deepEqual(idsIn(cards[2]), ['council-translator-model-select', 'single-document-translator-model-select']);
  assert.deepEqual(idsIn(cards[3]), ['memory-model-setting', 'memory-model-title', 'memory-model-description', 'memory-model-select']);
  assert.equal(document.querySelectorAll('[data-translator-picker]').length, 2);
});

test('each key sits in its own block, so the key controls can wrap it with the show and clear buttons', () => {
  const { document } = createPage();
  for (const id of ['gemini-api-key-input', 'openrouter-api-key-input-all', 'nvidia-api-key-input', 'tavily-api-key-input', 'tinyfish-api-key-input']) {
    const block = document.getElementById(id).closest('div');
    assert.equal(block.classList.contains('pz-key'), true, `${id} has a block of its own`);
    assert.equal(block.querySelectorAll('input').length, 1, `${id} shares its block with no other field`);
  }
  // What comes and goes with the search source is a whole row or key block, never half of one.
  assert.equal(document.getElementById('tavily-search-depth-select').closest('div').classList.contains('pz-row'), true);
});

test('the memory model control that is in the page is used, and saves once however often the tab is opened', async () => {
  const { document } = createPage();
  const saved = [];
  const config = { uiLanguage: 'zh-TW', memoryModelId: 'gemini-3.5-flash-lite' };
  const controls = createSettingsMemorySummaryControls({
    document,
    models: [{ id: 'gemini-3.5-flash-lite', name: 'Flash Lite' }, { id: 'gemini-3-flash', name: 'Flash' }],
    getConfig: () => config,
    getMemoryState: () => ({}),
    saveConfig: async () => { saved.push(config.memoryModelId); }
  });
  document.body.insertAdjacentHTML('beforeend', '<div id="memory-section"></div>');
  controls.ensureControls();
  controls.ensureControls();

  assert.equal(document.querySelectorAll('#memory-model-setting').length, 1, 'no second control is built');
  assert.equal(document.getElementById('model-management-section').contains(document.getElementById('memory-model-setting')), true);
  const select = document.getElementById('memory-model-select');
  assert.deepEqual([...select.options].map((option) => option.value), ['gemini-3.5-flash-lite', 'gemini-3-flash']);
  assert.equal(document.getElementById('memory-model-title').textContent.length > 0, true);

  select.value = 'gemini-3-flash';
  select.dispatchEvent(new document.defaultView.Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(saved, ['gemini-3-flash'], 'one change is saved once');
});

test('the Data tab has the three actions as rows and the delete-all button in the danger card', () => {
  const { document } = createPage();
  const [sync, danger] = [...document.querySelectorAll('#data-management-section .pz-card')];
  assert.deepEqual([...sync.querySelectorAll('button')].map((button) => button.id), ['export-data-btn', 'import-data-btn', 'open-archived-modal-btn']);
  for (const button of sync.querySelectorAll('button')) {
    assert.equal(button.classList.contains('pz-nav'), true);
    assert.equal(button.querySelector('[data-lang-key]') !== null, true, 'the words are in a span: translating them keeps the arrow');
    assert.equal(button.getAttribute('data-lang-key'), null);
  }
  assert.equal(danger.classList.contains('pz-danger'), true);
  const button = danger.querySelector('#delete-all-data-btn');
  assert.equal(button.dataset.langKey, 'deleteAllDataButton');
  assert.equal(danger.querySelector('[data-lang-key="deleteAllData"]') !== null, true, 'the row says what it deletes, the button says Delete');
});

test('the cloud space line becomes a card of the Data tab, above the danger card', async () => {
  const { document } = createPage();
  let usage;
  ensureStorageUsageBlock({
    document,
    elements: {},
    config: { uiLanguage: 'zh-TW' },
    getSync: () => ({ getStatus: () => ({ enabled: true }) }),
    read: async () => { usage = { ok: true, usedBytes: 50 * 1024 * 1024, quotaBytes: 500 * 1024 * 1024 }; return usage; }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const cards = [...document.querySelectorAll('#data-management-section .pz > .pz-card')];
  assert.deepEqual(cards.map((card) => card.id || (card.classList.contains('pz-danger') ? 'danger' : 'sync')), ['sync', 'storage-usage-block', 'danger']);
  const block = document.getElementById('storage-usage-block');
  assert.equal(block.querySelector('.pz-head h3').textContent.length > 0, true);
  assert.equal(block.querySelector('.pz-block .storage-usage-track') !== null, true);
  assert.equal(usage.ok, true);
});

test('the Accessibility tab has its rows in the page, and the controls that used to build them only attach to them', () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = sectionHtml('accessibility-section');
  const elements = {};
  const config = { uiLanguage: 'en', processOpen: true, fileModeDefault: 'standard' };
  const before = document.querySelectorAll('#accessibility-section .pz-row').length;

  ensureAutoWebSearchSettingsControl({ document, elements });
  ensureVisionCheckSettingsControl({ document, elements, config, saveConfig: async () => {}, showNotification: () => {} });
  ensureProcessOpenSettingsControl({ document, elements, config });
  ensureFileModeSettingsControl({ document, elements, config });

  assert.equal(document.querySelectorAll('#accessibility-section .pz-row').length, before, 'no row is added');
  assert.equal(document.querySelectorAll('#vision-check-setting-row, #process-open-setting-row, #file-mode-setting-row').length, 3);
  assert.deepEqual(
    [...document.querySelectorAll('#accessibility-section .pz-card .pz-head h3')].map((heading) => heading.dataset.langKey),
    ['settingsCardChat', 'settingsCardRepliesFiles']
  );
  assert.equal(elements.visionCheckToggleSwitch, document.getElementById('vision-check-toggle-switch'));
  assert.equal(elements.processToggle.checked, true, 'the setting is shown on the switch that is in the page');
  assert.equal(elements.fileModeDefaultSelect.value, 'standard');
  assert.equal(document.querySelector('#process-open-setting-row .pz-label').textContent.length > 0, true);
  assert.notEqual(document.querySelector('#vision-check-setting-row .pz-label').textContent, '自動看圖檢查簡報', 'the words are in the language of the settings');
});

test('the Trash tab has its actions and batch bar in the page', () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  const start = fragment04.indexOf('<div id="trash-section"');
  const end = fragment04.indexOf('<div id="about-section"');
  document.body.innerHTML = fragment04.slice(start, end);
  for (const id of ['trash-batch-select-btn', 'empty-trash-btn', 'trash-batch-action-bar', 'trash-selection-count', 'trash-cancel-selection-btn', 'trash-batch-restore-btn', 'trash-batch-delete-btn', 'trash-list-container']) {
    assert.ok(document.getElementById(id), `${id} is in the page`);
  }
  assert.equal(document.getElementById('trash-batch-action-bar').classList.contains('hidden'), true);
  assert.equal(document.getElementById('trash-batch-restore-btn').disabled, true);
});

test('the About tab keeps its controls and links the help center, the terms, the privacy policy and the update notes to their pages, each in a new tab', () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  const start = fragment04.indexOf('<div id="about-section"');
  document.body.innerHTML = fragment04.slice(start, fragment04.indexOf('<div class="p-4 bg-[var(--sidebar-bg)]', start));
  for (const id of ['feedback-textarea', 'send-feedback-btn', 'update-info-btn', 'enable-update-notifications-toggle', 'version-number-display']) {
    assert.ok(document.getElementById(id), `${id} is in the page`);
  }
  assert.deepEqual(
    [...document.querySelectorAll('#about-section .pz-card .pz-head h3')].map((heading) => heading.dataset.langKey),
    ['feedback', 'settingsCardSupport', 'settingsCardLegal', 'versionInfo']
  );
  assert.equal(document.querySelectorAll('#about-section details').length, 0, 'nothing is folded any more');
  const links = [...document.querySelectorAll('#about-section a.pz-nav')];
  assert.deepEqual(links.map((link) => [link.getAttribute('href'), link.querySelector('span').dataset.langKey]), [
    ['/help', 'helpCenter'],
    ['/terms', 'termsOfUse'],
    ['/privacy', 'privacyPolicy'],
    ['/updates', 'viewUpdateHistory']
  ]);
  for (const link of links) {
    assert.equal(link.getAttribute('target'), '_blank', 'a new tab: the page has no way back to the settings');
    assert.match(link.getAttribute('rel'), /noopener/);
  }
  assert.equal(document.getElementById('update-info-btn'), links[3]);
});

test('the landing page links the terms and the privacy policy, and the new-version window links the update notes, each in a new tab', async () => {
  const shell = await import('../src/templates/fragments/00-shell.fragment.js');
  const more = await import('../src/templates/fragments/06-shell.fragment.js');
  const { document } = new Window({ url: 'https://example.test/' });
  document.body.innerHTML = shell.default + more.default;
  const footer = [...document.querySelectorAll('footer a[href^="/"]')];
  assert.deepEqual(footer.map((link) => [link.getAttribute('href'), link.dataset.langKey, link.getAttribute('target')]), [
    ['/help', undefined, '_blank'],
    ['/updates', undefined, '_blank'],
    ['/terms', 'termsOfUse', '_blank'],
    ['/privacy', 'privacyPolicy', '_blank']
  ]);
  const notes = document.getElementById('latest-update-history-btn');
  assert.equal(notes.tagName, 'A');
  assert.equal(notes.getAttribute('href'), '/updates');
  assert.equal(notes.getAttribute('target'), '_blank');
  assert.equal(document.getElementById('update-info-modal'), null, 'the old window of the history is gone');
});
