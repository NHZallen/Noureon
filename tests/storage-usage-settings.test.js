import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { ensureStorageUsageBlock } from '../src/app/runtime/legacy-core/settings-storage-usage.js';
import { formatBytes } from '../src/app/runtime/cli/storage-client.js';
import { PERMISSION_TEXTS } from '../src/app/runtime/cli/permission-texts.js';

const MB = 1024 * 1024;
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
const page = () => {
  const { document } = new Window({ url: 'https://example.test/' });
  document.body.innerHTML = '<div id="data-management-section"></div><select id="ui-language-select"><option value="en">en</option><option value="fr">fr</option></select>';
  return { document, elements: { uiLanguageSelect: document.getElementById('ui-language-select') } };
};
const signedIn = () => ({ getStatus: () => ({ enabled: true }) });

test('formatBytes keeps decimals only where they help', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(12.34 * MB), '12.3 MB');
  assert.equal(formatBytes(500 * MB), '500 MB');
});

test('the data management tab shows the cloud space used of 500 MB, once, and a bar', async () => {
  const { document, elements } = page();
  const config = { uiLanguage: 'en' };
  const read = async () => ({ ok: true, usedBytes: 120 * MB, quotaBytes: 500 * MB });
  ensureStorageUsageBlock({ document, elements, config, getSync: signedIn, read });
  ensureStorageUsageBlock({ document, elements, config, getSync: signedIn, read });
  await flush();
  assert.equal(document.querySelectorAll('#storage-usage-block').length, 1);
  assert.match(document.getElementById('storage-usage-block').textContent, /Cloud space 120 MB \/ 500 MB/);
  assert.equal(document.querySelector('.storage-usage-fill').style.width, '24%');
  assert.equal(document.querySelector('.storage-usage-fill.is-full'), null);
});

test('a full space says so, and nothing is drawn without a cloud account', async () => {
  const { document, elements } = page();
  ensureStorageUsageBlock({ document, elements, config: { uiLanguage: 'en' }, getSync: signedIn, read: async () => ({ ok: true, usedBytes: 500 * MB, quotaBytes: 500 * MB }) });
  await flush();
  assert.ok(document.querySelector('.storage-usage-fill.is-full'));
  assert.ok(document.getElementById('storage-usage-block').textContent.includes(PERMISSION_TEXTS.en.storageFull));
  const other = page();
  ensureStorageUsageBlock({ document: other.document, elements: other.elements, config: { uiLanguage: 'en' }, getSync: () => null, read: async () => { throw new Error('not asked'); } });
  await flush();
  assert.equal(other.document.getElementById('storage-usage-block').textContent, '');
});

test('when the usage cannot be read, the block says so, and it follows the language menu', async () => {
  const { document, elements } = page();
  ensureStorageUsageBlock({ document, elements, config: { uiLanguage: 'en' }, getSync: signedIn, read: async () => ({ ok: false, code: 'unavailable' }) });
  await flush();
  assert.ok(document.getElementById('storage-usage-block').textContent.includes(PERMISSION_TEXTS.en.storageUnknown));
  elements.uiLanguageSelect.value = 'fr';
  elements.uiLanguageSelect.dispatchEvent(new document.defaultView.Event('change'));
  assert.ok(document.getElementById('storage-usage-block').textContent.includes(PERMISSION_TEXTS.fr.storageUnknown));
});

test('without a cloud account the block is hidden (an empty card would still draw its border as a thin bar), and shown once there is one', async () => {
  const { document, elements } = page();
  let enabled = false;
  const sync = () => ({ getStatus: () => ({ enabled }) });
  ensureStorageUsageBlock({ document, elements, config: { uiLanguage: 'en' }, getSync: sync, read: async () => ({ ok: true, usedBytes: MB, quotaBytes: 500 * MB }) });
  assert.equal(document.getElementById('storage-usage-block').classList.contains('hidden'), true);

  enabled = true;
  ensureStorageUsageBlock({ document, elements, config: { uiLanguage: 'en' }, getSync: sync, read: async () => ({ ok: true, usedBytes: MB, quotaBytes: 500 * MB }) });
  await flush();
  assert.equal(document.getElementById('storage-usage-block').classList.contains('hidden'), false);
});
