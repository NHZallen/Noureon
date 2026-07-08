import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { ensureUserSettingsSection } from '../src/app/runtime/legacy-core/settings-user-section-shell.js';
import { createSettingsUserProfileControls } from '../src/app/runtime/legacy-core/settings-user-profile-controls.js';
import { renderUserAvatar } from '../src/app/runtime/legacy-core/user-profile-view.js';

function createFixture() {
  const window = new Window();
  window.document.body.innerHTML = `
    <div id="settings-modal">
      <ul id="settings-nav">
        <li class="settings-nav-item" data-section="personalization">Personalization</li>
      </ul>
      <div id="personalization-section" class="settings-section"></div>
    </div>
    <div class="user-avatar"></div>
    <span id="username-display"></span>
  `;
  ensureUserSettingsSection({
    document: window.document,
    getText: (_key, fallback) => fallback
  });

  const saved = new Map();
  const state = {
    currentUser: {
      username: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      avatarUrl: 'data:image/png;base64,old-avatar'
    }
  };
  const controls = createSettingsUserProfileControls({
    window,
    document: window.document,
    elements: {
      usernameDisplay: window.document.getElementById('username-display')
    },
    state,
    getUserKey: username => `user:${username}`,
    setItem: async (key, value) => saved.set(key, value),
    getText: (_key, fallback) => fallback,
    showNotification: () => {},
    imageCompressor: async (data, mimeType) => ({ data, mimeType })
  });

  return { window, state, controls, saved };
}

test('user settings shell includes display name and avatar controls', () => {
  const { window } = createFixture();

  assert.ok(window.document.getElementById('settings-user-profile-panel'));
  assert.ok(window.document.getElementById('settings-user-display-name-input'));
  assert.ok(window.document.getElementById('settings-user-avatar-upload-btn'));
  assert.ok(window.document.getElementById('settings-user-profile-save-btn'));
});

test('profile controls persist display name and update the sidebar summary', async () => {
  const { window, state, controls, saved } = createFixture();
  controls.bindUserProfileControls();
  controls.syncUserProfileControls();

  window.document.getElementById('settings-user-display-name-input').value = 'Alicia';
  await controls.persistCurrentUserProfile();

  assert.equal(state.currentUser.displayName, 'Alicia');
  assert.equal(JSON.parse(saved.get('user:alice')).displayName, 'Alicia');
  assert.equal(window.document.getElementById('username-display').textContent, 'Alicia');
  assert.equal(window.document.querySelector('.user-avatar img').src, 'data:image/png;base64,old-avatar');
});

test('profile controls can remove the current avatar before saving', async () => {
  const { window, state, controls, saved } = createFixture();
  controls.bindUserProfileControls();
  controls.syncUserProfileControls();

  window.document.getElementById('settings-user-avatar-remove-btn').click();
  await controls.persistCurrentUserProfile();

  assert.equal(state.currentUser.avatarUrl, undefined);
  assert.equal(JSON.parse(saved.get('user:alice')).avatarUrl, undefined);
  assert.equal(window.document.querySelector('.user-avatar').textContent, 'A');
});

test('renderUserAvatar falls back to the user initial when no image is set', () => {
  const window = new Window();
  const avatar = window.document.createElement('div');

  renderUserAvatar(avatar, { displayName: 'Taylor' });

  assert.equal(avatar.textContent, 'T');
  assert.equal(avatar.querySelector('img'), null);
});
