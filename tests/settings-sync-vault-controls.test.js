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

test('sync vault settings hydrate an already-rendered user navigation shell', () => {
  const { window, controls } = createFixture();
  const nav = window.document.createElement('li');
  nav.id = 'user-section-nav';
  nav.className = 'settings-nav-item p-3 rounded-md';
  nav.dataset.section = 'user';
  window.document.getElementById('settings-nav').prepend(nav);
  const section = window.document.createElement('div');
  section.id = 'user-section';
  section.className = 'settings-section';
  window.document.getElementById('personalization-section').before(section);

  controls.ensureSyncVaultSettings();

  assert.equal(window.document.querySelectorAll('#user-section-nav').length, 1);
  assert.equal(section.dataset.syncVaultSettingsInitialized, 'true');
  assert.notEqual(window.document.getElementById('sync-vault-account'), null);
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
  assert.ok(window.document.getElementById('sync-vault-recovery-setup-btn'));
  assert.ok(window.document.getElementById('sync-vault-recovery-code'));
});

test('recovery setup requires explicit confirmation and client-side encryption', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/app/runtime/legacy-core/settings-sync-vault-controls.js', import.meta.url), 'utf8');
  const createStart = source.indexOf("elements.createButton.addEventListener('click'");
  const unlockStart = source.indexOf("elements.unlockButton.addEventListener('click'", createStart);
  const createHandler = source.slice(createStart, unlockStart);

  assert.doesNotMatch(createHandler, /storeVaultRecovery|encryptSyncVaultRecovery/);
  assert.match(source, /recoverySetupSaved\.checked/);
  assert.match(source, /encryptSyncVaultRecovery\(\{/);
  assert.match(source, /decryptSyncVaultRecovery\(response\.payload/);
});
