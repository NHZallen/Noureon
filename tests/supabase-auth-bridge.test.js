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
  assert.ok(window.document.getElementById('local-mode-btn'));
  assert.equal(window.document.getElementById('import-btn-auth').disabled, false);
  assert.ok(window.document.getElementById('supabase-recovery-form'));

  elements.setLocalMode();
  assert.equal(elements.form.dataset.authMode, 'local');
  assert.equal(elements.emailInput.type, 'text');
  assert.equal(elements.loginButton.textContent, '登入 / 註冊本機帳號');
  assert.ok(window.document.getElementById('supabase-google-btn').classList.contains('hidden'));
});

test('auth bridge keeps secrets out of browser source and wires required flows', () => {
  const source = readFileSync(new URL('../src/app/auth/supabase-auth-bridge.js', import.meta.url), 'utf8');
  const clientSource = readFileSync(new URL('../src/app/auth/supabase-client.js', import.meta.url), 'utf8');

  assert.match(source, /signInWithPassword/);
  assert.match(source, /signUp/);
  assert.match(source, /signInWithOAuth/);
  assert.match(source, /resetPasswordForEmail/);
  assert.match(source, /updateUser/);
  assert.match(source, /import\s+\{\s*reconcileStoredWorkspaceOwner\s*\}/);
  assert.match(source, /await\s+reconcileStoredWorkspaceOwner\(\{/);
  assert.match(source, /nextUsername:\s*record\.username/);
  assert.match(source, /nextUsername:\s*targetUser\.username/);
  assert.match(source, /captchaToken/);
  assert.doesNotMatch(source, /service_role|sb_secret_/);
  assert.doesNotMatch(clientSource, /service_role|sb_secret_/);
  assert.match(clientSource, /VITE_SUPABASE_PUBLISHABLE_KEY/);
});
