import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import {
  initializePasswordRecoveryPage,
  openPasswordRecovery,
  PASSWORD_RECOVERY_ROUTE,
  PASSWORD_RESET_ROUTE,
  RECOVERY_EMAIL_KEY,
  RECOVERY_LANGUAGE_KEY,
  RECOVERY_VERIFICATION_KEY
} from '../src/app/auth/password-recovery-page.js';

const idleTurnstile = {
  enabled: false,
  mount: async () => false,
  getToken: () => '',
  reset: () => {}
};

const verifiedTurnstile = {
  enabled: true,
  mount: async () => true,
  getToken: () => 'captcha-token',
  reset: () => {}
};

function createWindow(pathname) {
  const window = new Window({ url: `https://noureon.com${pathname}` });
  window.document.body.innerHTML = '<div id="app"></div>';
  return window;
}

async function flush(window) {
  await new Promise(resolve => window.setTimeout(resolve, 0));
}

test('password recovery entry remembers the current language and optional Email', () => {
  const values = new Map();
  let target = '';
  const window = {
    document: { documentElement: { lang: 'fr' } },
    navigator: { language: 'en' },
    sessionStorage: {
      setItem: (key, value) => values.set(key, value)
    },
    location: { assign: (path) => { target = path; } }
  };

  openPasswordRecovery(window, { email: 'person@example.com' });

  assert.equal(target, PASSWORD_RECOVERY_ROUTE);
  assert.equal(values.get(RECOVERY_LANGUAGE_KEY), 'fr');
  assert.equal(values.get(RECOVERY_EMAIL_KEY), 'person@example.com');
});

test('language links switch both recovery pages and keep a URL fallback', async () => {
  for (const path of [PASSWORD_RECOVERY_ROUTE, PASSWORD_RESET_ROUTE]) {
    const window = createWindow(path);
    window.document.documentElement.lang = 'zh-TW';
    await initializePasswordRecoveryPage({
      window,
      document: window.document,
      supabase: { auth: {} },
      turnstile: idleTurnstile,
      navigate: () => {}
    });

    const englishLink = window.document.querySelector('[data-recovery-language="en"]');
    assert.equal(englishLink.getAttribute('href'), '?lang=en');
    englishLink.click();

    assert.equal(window.document.documentElement.lang, 'en');
    assert.equal(window.document.getElementById('recovery-language-label').textContent, 'English');
    assert.match(window.document.querySelector('h1').textContent, /Reset|Verify/);
    assert.equal(new URL(window.location.href).searchParams.get('lang'), 'en');
    window.close();
  }
});

test('forgot-password sends a recovery code and only opens reset after OTP verification', async () => {
  const window = createWindow(PASSWORD_RECOVERY_ROUTE);
  const calls = [];
  const navigations = [];
  const supabase = {
    auth: {
      resetPasswordForEmail: async (email, options) => {
        calls.push({ method: 'send', email, options });
        return { error: null };
      },
      verifyOtp: async (payload) => {
        calls.push({ method: 'verify', payload });
        return { data: { session: { user: { id: 'user-123' } } }, error: null };
      }
    }
  };

  await initializePasswordRecoveryPage({
    window,
    document: window.document,
    supabase,
    turnstile: verifiedTurnstile,
    navigate: (path, options) => navigations.push({ path, options })
  });

  const email = window.document.getElementById('password-recovery-email');
  email.value = 'person@example.com';
  window.document.getElementById('password-recovery-request-form')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush(window);

  assert.equal(calls[0].method, 'send');
  assert.equal(calls[0].email, 'person@example.com');
  assert.equal(calls[0].options.captchaToken, 'captcha-token');
  assert.equal(window.document.getElementById('password-recovery-code-form').classList.contains('hidden'), false);

  window.document.getElementById('password-recovery-code').value = '12345678';
  window.document.getElementById('password-recovery-code-form')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush(window);

  assert.deepEqual(calls[1], {
    method: 'verify',
    payload: { email: 'person@example.com', token: '12345678', type: 'recovery' }
  });
  assert.equal(navigations[0].path, PASSWORD_RESET_ROUTE);
  assert.equal(JSON.parse(window.sessionStorage.getItem(RECOVERY_VERIFICATION_KEY)).userId, 'user-123');
  window.close();
});

test('direct reset-password access is blocked without claiming an expired verification', async () => {
  const window = createWindow(PASSWORD_RESET_ROUTE);
  await initializePasswordRecoveryPage({
    window,
    document: window.document,
    supabase: { auth: {} },
    turnstile: idleTurnstile,
    navigate: () => {}
  });

  const blocked = window.document.getElementById('password-reset-blocked');
  const message = window.document.getElementById('password-reset-blocked-message').textContent;
  assert.equal(blocked.classList.contains('hidden'), false);
  assert.match(message, /verify the code/i);
  assert.doesNotMatch(message, /expired/i);
  assert.equal(window.document.getElementById('password-reset-content').classList.contains('hidden'), true);
  window.close();
});

test('verified recovery session can update the password and returns to the root sign-in page', async () => {
  const window = createWindow(PASSWORD_RESET_ROUTE);
  const navigations = [];
  const calls = [];
  window.sessionStorage.setItem(RECOVERY_VERIFICATION_KEY, JSON.stringify({
    userId: 'user-123',
    verifiedAt: Date.now(),
    expiresAt: Date.now() + 60_000
  }));
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-123' } } }, error: null }),
      updateUser: async (payload) => {
        calls.push({ method: 'update', payload });
        return { error: null };
      },
      signOut: async (payload) => {
        calls.push({ method: 'signOut', payload });
        return { error: null };
      }
    }
  };

  await initializePasswordRecoveryPage({
    window,
    document: window.document,
    supabase,
    turnstile: idleTurnstile,
    navigate: (path, options) => navigations.push({ path, options })
  });

  assert.equal(window.document.getElementById('password-reset-content').classList.contains('hidden'), false);
  window.document.getElementById('password-reset-new').value = 'new-password';
  window.document.getElementById('password-reset-confirmation').value = 'new-password';
  window.document.getElementById('password-reset-form')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush(window);

  assert.deepEqual(calls, [
    { method: 'update', payload: { password: 'new-password' } },
    { method: 'signOut', payload: { scope: 'local' } }
  ]);
  assert.deepEqual(navigations, [{ path: '/', options: { replace: true } }]);
  assert.equal(window.sessionStorage.getItem(RECOVERY_VERIFICATION_KEY), null);
  window.close();
});
