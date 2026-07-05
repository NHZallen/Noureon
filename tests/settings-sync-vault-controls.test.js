import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createSettingsSyncVaultControls } from '../src/app/runtime/legacy-core/settings-sync-vault-controls.js';

function createFixture() {
  const window = new Window();
  window.document.body.innerHTML = `
    <div id="settings-modal">
      <ul id="settings-nav">
        <li class="settings-nav-item" data-section="personalization">Personalization</li>
      </ul>
      <div id="personalization-section" class="settings-section"></div>
    </div>
  `;
  let currentUser = { username: 'local-user', displayName: 'Local User' };
  const values = new Map();
  const storage = {
    getItem: async key => values.get(key) || null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key)
  };
  const controls = createSettingsSyncVaultControls({
    window,
    document: window.document,
    storage,
    getCurrentUser: () => currentUser,
    getText: (_key, fallback) => fallback,
    showNotification: () => {}
  });
  return {
    window,
    controls,
    setCurrentUser: user => { currentUser = user; }
  };
}

test('sync vault settings add a user section while keeping local accounts read only', async () => {
  const { window, controls } = createFixture();

  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();

  assert.equal(window.document.querySelector('#settings-nav').firstElementChild.id, 'user-section-nav');
  assert.ok(window.document.getElementById('user-section'));
  assert.equal(window.document.getElementById('sync-vault-cloud-only-panel').classList.contains('hidden'), false);
  assert.equal(window.document.getElementById('sync-vault-create-panel').classList.contains('hidden'), true);
  assert.match(window.document.getElementById('sync-vault-status').textContent, /不可用/);
  assert.doesNotMatch(window.document.getElementById('sync-vault-cloud-only-panel').className, /amber|yellow/);
});

test('linked Supabase accounts can create a sync vault password', async () => {
  const { window, controls, setCurrentUser } = createFixture();
  setCurrentUser({
    username: 'supabase:user-123',
    email: 'person@example.com',
    authProvider: 'supabase'
  });

  controls.ensureSyncVaultSettings();
  await controls.refreshSyncVaultControls();

  assert.equal(window.document.getElementById('sync-vault-cloud-only-panel').classList.contains('hidden'), true);
  assert.equal(window.document.getElementById('sync-vault-create-panel').classList.contains('hidden'), false);
  assert.equal(window.document.getElementById('sync-vault-account').textContent, 'person@example.com');
});
