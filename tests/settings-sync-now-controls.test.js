import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createSyncNowControls, syncNowMarkup } from '../src/app/runtime/legacy-core/settings-sync-now-controls.js';

const kinds = (states) => ({
  config: { state: states[0] },
  sensitive: typeof states[1] === 'string' ? { state: states[1] } : states[1],
  vault: { state: states[2] }
});

function setup(sync) {
  const window = new Window();
  window.document.body.innerHTML = syncNowMarkup();
  const controls = createSyncNowControls({ document: window.document, getSync: () => sync });
  controls.bind();
  return { window, document: window.document, controls };
}

const lines = (document) => [...document.querySelectorAll('#sync-now-details li')].map((item) => [item.dataset.syncKind, item.dataset.syncState, item.textContent]);

test('the panel lists each kind with how it stands, and when it was last synced', () => {
  const stamp = new Date(2026, 9, 1, 12, 3).getTime();
  const { document, controls } = setup({ getStatus: () => ({ online: true, lastSyncedAt: stamp, kinds: kinds(['synced', 'pending', 'synced']) }) });
  controls.refresh();
  assert.deepEqual(lines(document), [
    ['config', 'synced', '設定：已是最新'],
    ['sensitive', 'pending', 'API 金鑰：等待上傳'],
    ['vault', 'synced', '同步密碼：已是最新']
  ]);
  assert.equal(document.getElementById('sync-now-summary').textContent, '上次同步：12:03');
});

test('a failed kind is shown with its reason, and a kind waiting for the vault says so', () => {
  const { document, controls } = setup({ getStatus: () => ({ online: true, kinds: kinds(['waiting', { state: 'failed', reason: 'JWT expired' }, 'synced']) }) });
  controls.refresh();
  assert.equal(lines(document)[0][2], '設定：等待中（需先解鎖保險庫）');
  assert.equal(lines(document)[1][2], 'API 金鑰：失敗：JWT expired');
  assert.match(document.querySelector('[data-sync-state="failed"]').className, /red/);
  assert.equal(document.getElementById('sync-now-summary').textContent, '尚未同步');
});

test('the button syncs, is disabled while it runs, and shows the result', async () => {
  let release;
  let calls = 0;
  const sync = {
    getStatus: () => ({ online: true, kinds: kinds(['pending', 'pending', 'pending']) }),
    syncNow: () => new Promise((resolve) => {
      calls += 1;
      release = () => resolve({ ok: true, status: { online: true, lastSyncedAt: Date.now(), kinds: kinds(['synced', 'synced', 'synced']) } });
    })
  };
  const { document } = setup(sync);
  const button = document.getElementById('sync-now-btn');
  button.click();
  button.click();
  assert.equal(calls, 1, 'a second press while it runs does nothing');
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, '同步中…');
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, '立即同步');
  assert.deepEqual(lines(document).map((line) => line[1]), ['synced', 'synced', 'synced']);
  assert.match(document.getElementById('sync-now-summary').textContent, /^上次同步：\d\d:\d\d$/);
});

test('offline, a sync that throws, and sync that is not ready are each said plainly', async () => {
  const offline = setup({ getStatus: () => ({ online: false, kinds: kinds(['pending', 'synced', 'synced']) }), syncNow: async () => ({ ok: false, reason: 'offline', status: { online: false, kinds: kinds(['pending', 'synced', 'synced']) } }) });
  await offline.controls.run();
  assert.equal(offline.document.getElementById('sync-now-summary').textContent, '目前離線，連線後會自動同步');

  const broken = setup({ getStatus: () => ({ online: true, kinds: kinds(['synced', 'synced', 'synced']) }), syncNow: async () => { throw new Error('network down'); } });
  await broken.controls.run();
  assert.equal(broken.document.getElementById('sync-now-summary').textContent, '失敗：network down');
  assert.equal(broken.document.getElementById('sync-now-btn').disabled, false);

  const notReady = setup({ queueLocalChange() {} });
  await notReady.controls.run();
  assert.equal(notReady.document.getElementById('sync-now-summary').textContent, '雲端同步還在準備中，請稍後再試');
});

test('the panel is part of the unlocked sync vault panel and only that', async () => {
  const { createSettingsSyncVaultControls } = await import('../src/app/runtime/legacy-core/settings-sync-vault-controls.js');
  const window = new Window();
  window.document.body.innerHTML = '<div id="settings-modal"><ul id="settings-nav"><li class="settings-nav-item" data-section="personalization">P</li></ul><div id="personalization-section" class="settings-section"></div></div>';
  const controls = createSettingsSyncVaultControls({ window, document: window.document, storage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }, getCurrentUser: () => ({ username: 'u' }), getText: (_key, fallback) => fallback, showNotification: () => {} });
  controls.ensureSyncVaultSettings();
  const panel = window.document.getElementById('sync-now-panel');
  assert.equal(panel.closest('#sync-vault-unlocked-panel') !== null, true);
  assert.equal(window.document.querySelectorAll('#sync-now-btn').length, 1);
});
