import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';
import {
  createCloudUserRecord,
  enhanceAuthShell
} from '../src/app/auth/supabase-auth-bridge.js';

test('cloud users receive a stable private local storage namespace', () => {
  const record = createCloudUserRecord({
    id: 'user-123',
    email: 'person@example.com',
    user_metadata: { full_name: 'Astra User' }
  });

  assert.deepEqual(record, {
    username: 'supabase:user-123',
    displayName: 'Astra User',
    email: 'person@example.com',
    supabaseUserId: 'user-123',
    authProvider: 'supabase'
  });
  assert.equal('password' in record, false);
});

test('auth shell enhancement adds cloud, local, and import entry points', () => {
  const window = new Window();
  window.document.body.innerHTML = `
    <form id="auth-form">
      <label for="username-input" data-lang-key="username">Username</label>
      <input id="username-input" data-lang-key-placeholder="usernamePlaceholder">
      <input id="password-input" type="password" data-lang-key-placeholder="passwordPlaceholder">
      <div>
        <button id="register-btn" type="submit" data-lang-key="loginRegisterButton">Login</button>
        <button id="import-btn-auth" type="button" disabled data-lang-key="importRecords">Import</button>
      </div>
    </form>
  `;

  const elements = enhanceAuthShell(window.document);

  assert.ok(elements);
  assert.equal(elements.form.dataset.authMode, 'cloud');
  assert.equal(elements.emailInput.type, 'email');
  assert.equal(elements.emailInput.autocomplete, 'email');
  assert.equal(elements.loginButton.textContent, '登入 / 建立帳號');
  const googleButton = window.document.getElementById('supabase-google-btn');
  assert.ok(googleButton);
  const googleLogo = googleButton.querySelector('img');
  assert.ok(googleLogo);
  assert.equal(googleLogo.getAttribute('src'), '/google-g-logo.png');
  assert.equal(googleLogo.getAttribute('width'), '20');
  assert.equal(googleLogo.getAttribute('height'), '20');
  assert.equal(googleLogo.getAttribute('alt'), '');
  assert.equal(googleLogo.getAttribute('aria-hidden'), 'true');
  assert.ok(window.document.getElementById('supabase-forgot-password-btn'));
  const localButton = window.document.getElementById('local-mode-btn');
  const importButton = window.document.getElementById('import-btn-auth');
  assert.ok(localButton);
  assert.equal(localButton.textContent, '使用舊版本機登入 / 匯入');
  assert.equal(localButton.classList.contains('bg-gray-800'), true);
  assert.equal(localButton.classList.contains('text-white'), true);
  assert.equal(localButton.classList.contains('focus:outline-none'), true);
  assert.equal(localButton.classList.contains('focus:ring-gray-500'), false);
  assert.equal(importButton.disabled, false);
  assert.equal(importButton.classList.contains('hidden'), true);
  assert.ok(window.document.getElementById('supabase-recovery-form'));

  elements.setLocalMode();
  assert.equal(elements.form.dataset.authMode, 'local');
  assert.equal(elements.emailInput.type, 'text');
  assert.equal(elements.loginButton.textContent, '登入 / 註冊本機帳號');
  assert.ok(window.document.getElementById('supabase-google-btn').classList.contains('hidden'));
  assert.equal(importButton.classList.contains('hidden'), false);
  assert.equal(importButton.classList.contains('bg-gray-800'), true);
  assert.equal(importButton.classList.contains('bg-green-600'), false);
  assert.equal(importButton.classList.contains('focus:ring-gray-500'), false);
  assert.equal(localButton.textContent, '返回 Email / Google 登入');
  assert.equal(localButton.classList.contains('bg-gray-800'), false);
  assert.equal(localButton.classList.contains('hover:underline'), true);
});

test('auth shell enhancement localizes dynamic login controls', () => {
  const window = new Window();
  window.document.documentElement.lang = 'en';
  window.i18n = {
    en: {
      authEmailLabel: 'Email',
      authEmailPlaceholder: 'email@example.test',
      authPasswordPlaceholder: 'Eight or more characters',
      cloudLoginRegister: 'Cloud sign in',
      forgotPassword: 'Reset password',
      authDividerOr: 'OR',
      supabaseGoogleLogin: 'Continue with Google',
      localModeEntry: 'Use local account',
      localModeReturn: 'Back to cloud sign in',
      importLocalRecords: 'Import local data',
      localAccountLabel: 'Local account',
      localUsernamePlaceholder: 'Local username',
      localPasswordPlaceholder: 'Local password',
      localLoginRegister: 'Local sign in',
      resetPasswordTitle: 'Create a new password',
      newPasswordPlaceholder: 'New password',
      confirmNewPasswordPlaceholder: 'Confirm password',
      resetPasswordButton: 'Update password',
      importRecords: 'Import data'
    }
  };
  window.document.body.innerHTML = `
    <form id="auth-form">
      <label for="username-input">Username</label>
      <input id="username-input">
      <input id="password-input" type="password">
      <div>
        <button id="register-btn" type="submit">Login</button>
        <button id="import-btn-auth" type="button">Import</button>
      </div>
    </form>
  `;

  const elements = enhanceAuthShell(window.document);

  assert.equal(elements.loginButton.textContent, 'Cloud sign in');
  assert.equal(elements.emailInput.placeholder, 'email@example.test');
  assert.equal(elements.passwordInput.placeholder, 'Eight or more characters');
  assert.equal(window.document.querySelector('label[for="username-input"]').textContent, 'Email');
  assert.equal(window.document.querySelector('[data-lang-key="authDividerOr"]').textContent, 'OR');
  assert.equal(window.document.getElementById('supabase-google-btn').textContent.trim(), 'Continue with Google');
  assert.equal(window.document.getElementById('supabase-forgot-password-btn').textContent, 'Reset password');
  assert.equal(window.document.querySelector('#supabase-recovery-form h3').textContent, 'Create a new password');
  assert.equal(window.document.getElementById('supabase-new-password').placeholder, 'New password');
  assert.equal(window.document.getElementById('supabase-confirm-password').placeholder, 'Confirm password');

  elements.setLocalMode();
  assert.equal(elements.loginButton.textContent, 'Local sign in');
  assert.equal(elements.localButton.textContent, 'Back to cloud sign in');
  assert.equal(elements.importButton.textContent, 'Import data');
});

test('auth bridge keeps secrets out of browser source and wires required flows', () => {
  const source = readFileSync(new URL('../src/app/auth/supabase-auth-bridge.js', import.meta.url), 'utf8');
  const clientSource = readFileSync(new URL('../src/app/auth/supabase-client.js', import.meta.url), 'utf8');
  const shellSource = readFileSync(
    new URL('../src/templates/fragments/00-shell.fragment.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /signInWithPassword/);
  assert.match(source, /signUp/);
  assert.match(source, /signInWithOAuth/);
  assert.match(source, /resetPasswordForEmail/);
  assert.match(source, /updateUser/);
  assert.match(source, /import\s+\{\s*reconcileStoredWorkspaceOwner,\s*STORAGE_OWNER_KEY\s*\}/);
  assert.match(source, /migrateSyncVaultRecord/);
  assert.match(source, /await\s+reconcileStoredWorkspaceOwner\(\{/);
  assert.match(source, /nextUsername:\s*record\.username/);
  assert.match(source, /nextUsername:\s*targetUser\.username/);
  assert.match(source, /captchaToken/);
  assert.doesNotMatch(source, /service_role|sb_secret_/);
  assert.doesNotMatch(clientSource, /service_role|sb_secret_/);
  assert.match(clientSource, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(shellSource, /id=\\"import-btn-auth\\"[^>]*bg-green-/);
  assert.doesNotMatch(`${source}\n${shellSource}`, /中原標準時間|2026\/8\/1/);
});
