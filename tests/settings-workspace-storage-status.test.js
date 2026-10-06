import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { PERMISSION_TEXTS, permissionText } from '../src/app/runtime/cli/permission-texts.js';
import { ensureWorkspaceStorageStatus, pickWorkspaceStorageStatus } from '../src/app/runtime/legacy-core/settings-workspace-storage-status.js';

const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];
const KEYS = ['wsActive', 'wsDegraded', 'wsFailed', 'wsGaveUp', 'wsUnusable', 'wsRollbackFailed'];

test('every sentence of the storage line exists in the five languages, and the count is filled in', () => {
  for (const language of LANGUAGES) {
    for (const key of KEYS) {
      assert.equal(typeof PERMISSION_TEXTS[language][key], 'string', `${language} ${key}`);
      assert.ok(PERMISSION_TEXTS[language][key].length > 20, `${language} ${key} has a sentence`);
    }
    assert.match(permissionText(language, 'wsDegraded', { count: 7 }), /7/);
    assert.equal(permissionText(language, 'wsDegraded', { count: 7 }).includes('{count}'), false);
  }
});

test('which sentence is shown for what the loading code recorded', () => {
  const v2 = { mode: 'v2', reason: null, problems: [] };
  assert.equal(pickWorkspaceStorageStatus(undefined), null);
  assert.equal(pickWorkspaceStorageStatus({ mode: 'legacy', reason: 'not-enabled', problems: [] }), null, 'the old item says nothing');
  assert.equal(pickWorkspaceStorageStatus({ mode: 'legacy', reason: 'disabled', problems: [] }), null);
  assert.equal(pickWorkspaceStorageStatus({ mode: 'legacy', reason: 'rolled-back', problems: [] }), null);
  assert.deepEqual(pickWorkspaceStorageStatus(v2), { key: 'wsActive' }, 'a working split storage is announced to everyone');
  assert.deepEqual(pickWorkspaceStorageStatus({ ...v2, problems: [{ id: 'a' }, { id: 'b' }] }), { key: 'wsDegraded', values: { count: 2 } });
  assert.deepEqual(pickWorkspaceStorageStatus({ ...v2, rollbackFailed: true }), { key: 'wsRollbackFailed' });
  assert.deepEqual(pickWorkspaceStorageStatus({ mode: 'legacy', reason: 'migration-failed' }), { key: 'wsFailed' });
  assert.deepEqual(pickWorkspaceStorageStatus({ mode: 'legacy', reason: 'migration-gave-up' }), { key: 'wsGaveUp' });
  assert.deepEqual(pickWorkspaceStorageStatus({ mode: 'legacy', reason: 'unusable-corrupt' }), { key: 'wsUnusable' });
  assert.deepEqual(pickWorkspaceStorageStatus({ mode: 'legacy', reason: 'error' }), { key: 'wsUnusable' });
});

function createTab() {
  const { document } = new Window({ url: 'https://example.test/' });
  document.body.innerHTML = `<div id="data-management-section"><div class="pz"><section class="pz-card"></section><section class="pz-card pz-danger"></section></div></div><select id="ui-language-select"><option value="zh-TW"></option><option value="en"></option></select>`;
  return { document, elements: { uiLanguageSelect: document.getElementById('ui-language-select') } };
}

test('the line sits at the end of the cards, is hidden when there is nothing to say, and follows the language menu', () => {
  const { document, elements } = createTab();
  let status = { mode: 'legacy', reason: 'not-enabled', problems: [] };
  ensureWorkspaceStorageStatus({ document, elements, config: { uiLanguage: 'zh-TW' }, getStatus: () => status });

  const line = document.getElementById('workspace-storage-status');
  assert.ok(line);
  assert.equal(line.classList.contains('hidden'), true);
  assert.equal(line.previousElementSibling.classList.contains('pz-danger'), true, 'after the last card, never between two cards');
  assert.equal(line.nextElementSibling, null);
  assert.equal(document.querySelectorAll('#workspace-storage-status').length, 1);

  status = { mode: 'v2', reason: null, problems: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  ensureWorkspaceStorageStatus({ document, elements, config: { uiLanguage: 'zh-TW' }, getStatus: () => status });
  assert.equal(document.querySelectorAll('#workspace-storage-status').length, 1, 'drawn again, not added again');
  assert.equal(line.classList.contains('hidden'), false);
  assert.equal(line.textContent, permissionText('zh-TW', 'wsDegraded', { count: 3 }));

  elements.uiLanguageSelect.value = 'en';
  elements.uiLanguageSelect.dispatchEvent(new document.defaultView.Event('change'));
  assert.equal(line.textContent, permissionText('en', 'wsDegraded', { count: 3 }));
});

test('a page without the Data tab is left alone', () => {
  const { document } = new Window({ url: 'https://example.test/' });
  document.body.innerHTML = '<div></div>';
  ensureWorkspaceStorageStatus({ document, elements: {}, config: { uiLanguage: 'en' }, getStatus: () => ({ mode: 'v2', problems: [{ id: 'a' }] }) });
  assert.equal(document.getElementById('workspace-storage-status'), null);
});
