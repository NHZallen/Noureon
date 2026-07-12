import i18n from '../../data/i18n/index.js';
import { createTurnstileClient } from '../runtime/security/turnstile-client.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase-client.js';

export const PASSWORD_RECOVERY_ROUTE = '/forgot-password';
export const PASSWORD_RESET_ROUTE = '/reset-password';
export const RECOVERY_EMAIL_KEY = 'noureon_password_recovery_email';
export const RECOVERY_LANGUAGE_KEY = 'noureon_password_recovery_language';
export const RECOVERY_VERIFICATION_KEY = 'noureon_password_recovery_verified';

const RECOVERY_WINDOW_MS = 10 * 60 * 1000;
const SUPPORTED_LANGUAGES = new Set(['zh-TW', 'en', 'fr', 'ru', 'es', 'ar']);
const LANGUAGE_LABELS = {
  'zh-TW': '繁體中文',
  en: 'English',
  fr: 'Français',
  ru: 'Русский',
  es: 'Español',
  ar: 'العربية'
};

function normalizeLanguage(value) {
  if (SUPPORTED_LANGUAGES.has(value)) return value;
  if (value?.toLowerCase().startsWith('zh')) return 'zh-TW';
  if (value?.toLowerCase().startsWith('fr')) return 'fr';
  if (value?.toLowerCase().startsWith('ru')) return 'ru';
  if (value?.toLowerCase().startsWith('es')) return 'es';
  if (value?.toLowerCase().startsWith('ar')) return 'ar';
  return 'en';
}

function getStoredLanguage(window) {
  return normalizeLanguage(
    new URL(window.location.href).searchParams.get('lang')
    || window.sessionStorage.getItem(RECOVERY_LANGUAGE_KEY)
    || window.document.documentElement.lang
    || window.navigator.language
  );
}

function defaultNavigate(window, path, { replace = false } = {}) {
  if (replace) {
    window.location.replace(path);
    return;
  }
  window.location.assign(path);
}

export function isPasswordRecoveryRoute(pathname) {
  return pathname === PASSWORD_RECOVERY_ROUTE || pathname === PASSWORD_RESET_ROUTE;
}

export function openPasswordRecovery(window, { email = '', language } = {}) {
  const nextLanguage = normalizeLanguage(language || window.document.documentElement.lang || window.navigator.language);
  window.sessionStorage.setItem(RECOVERY_LANGUAGE_KEY, nextLanguage);
  if (email) window.sessionStorage.setItem(RECOVERY_EMAIL_KEY, email.trim());
  window.location.assign(PASSWORD_RECOVERY_ROUTE);
}

function commonPageMarkup(content) {
  return `
    <div class="min-h-screen flex flex-col bg-white text-gray-900">
      <header class="relative z-20 p-4 sm:px-6 lg:px-8 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
          <a href="/" class="flex items-center gap-2" aria-label="Noureon">
            <img class="h-8 w-8 rounded-lg object-cover" src="/logo.png" alt="" width="32" height="32">
            <span class="text-xl font-bold text-gray-800">Noureon</span>
          </a>
          <div class="relative" id="recovery-language-switcher">
            <button id="recovery-language-button" type="button" class="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900" aria-expanded="false">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"></path></svg>
              <span id="recovery-language-label">繁體中文</span>
            </button>
            <div id="recovery-language-menu" class="hidden absolute right-0 mt-2 w-36 rounded-md shadow-lg bg-white ring-1 ring-black/5 z-30 py-1">
              ${Object.entries(LANGUAGE_LABELS).map(([value, label]) => `<a href="?lang=${value}" data-recovery-language="${value}" class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100">${label}</a>`).join('')}
            </div>
          </div>
        </div>
      </header>

      <main class="relative flex-1 flex items-center justify-center overflow-hidden py-12 sm:py-20 px-4">
        <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div class="absolute top-0 left-0 w-80 h-80 bg-blue-100 rounded-full opacity-50 -translate-x-24 -translate-y-24"></div>
          <div class="absolute bottom-0 right-0 w-96 h-96 bg-indigo-100 rounded-full opacity-50 translate-x-28 translate-y-28"></div>
        </div>
        <section class="relative w-full max-w-md p-7 sm:p-8 bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200">
          ${content}
        </section>
      </main>

      <footer class="bg-white border-t border-gray-200">
        <div class="max-w-7xl mx-auto py-6 px-4 text-center text-sm text-gray-500">
          <p data-lang-key="copyright">Noureon 版權所有</p>
          <p class="mt-1"><a href="mailto:support@noureon.com" class="text-blue-600 hover:underline">support@noureon.com</a></p>
        </div>
      </footer>
    </div>
  `;
}

function forgotPasswordMarkup() {
  return commonPageMarkup(`
    <div class="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="14" x="3" y="5" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg>
    </div>
    <h1 class="text-2xl font-bold text-center text-gray-800" data-lang-key="passwordRecoveryTitle">重設密碼</h1>
    <p class="mt-2 mb-7 text-center text-sm leading-6 text-gray-500" data-lang-key="passwordRecoveryDescription">輸入綁定的 Email，我們會寄送 8 位數驗證碼。</p>

    <form id="password-recovery-request-form" novalidate>
      <label for="password-recovery-email" class="block text-sm font-medium text-gray-700 mb-1" data-lang-key="authEmailLabel">Email</label>
      <input id="password-recovery-email" type="email" autocomplete="email" required class="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" placeholder="name@example.com" data-lang-key-placeholder="authEmailPlaceholder">
      <button id="password-recovery-send-button" type="submit" class="mt-5 w-full p-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-300" data-lang-key="passwordRecoverySendCode">寄送驗證碼</button>
    </form>

    <form id="password-recovery-code-form" class="hidden" novalidate>
      <p class="mb-5 rounded-lg bg-blue-50 p-3 text-sm leading-6 text-blue-700" data-lang-key="passwordRecoveryCodeSent">若此 Email 已綁定帳號，驗證碼已寄出。請檢查收件匣與垃圾郵件。</p>
      <label for="password-recovery-code" class="block text-sm font-medium text-gray-700 mb-1" data-lang-key="passwordRecoveryCodeLabel">8 位數驗證碼</label>
      <input id="password-recovery-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" pattern="[0-9]{8}" required class="w-full p-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.22em] font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" placeholder="00000000">
      <button id="password-recovery-verify-button" type="submit" class="mt-5 w-full p-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-300" data-lang-key="passwordRecoveryVerifyCode">驗證並繼續</button>
      <button id="password-recovery-request-again" type="button" class="mt-3 w-full text-sm text-blue-700 hover:underline disabled:text-gray-400 disabled:no-underline" disabled></button>
    </form>

    <p id="password-recovery-status" class="hidden mt-5 rounded-lg p-3 text-center text-sm" role="status" aria-live="polite"></p>
    <a href="/" class="mt-6 block text-center text-sm text-gray-600 hover:text-gray-900 hover:underline" data-lang-key="passwordRecoveryBackToLogin">返回登入</a>
  `);
}

function resetPasswordMarkup() {
  return commonPageMarkup(`
    <div class="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="16" height="12" x="4" y="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>
    </div>
    <div id="password-reset-loading" class="text-center text-sm text-gray-500" data-lang-key="passwordResetChecking">正在確認驗證狀態…</div>

    <div id="password-reset-blocked" class="hidden text-center">
      <h1 class="text-2xl font-bold text-gray-800" data-lang-key="passwordResetVerificationRequiredTitle">請先驗證 Email</h1>
      <p id="password-reset-blocked-message" class="mt-3 text-sm leading-6 text-gray-500"></p>
      <a href="/forgot-password" class="mt-6 block w-full p-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700" data-lang-key="passwordResetStart">開始重設密碼</a>
      <a href="/" class="mt-4 block text-sm text-gray-600 hover:text-gray-900 hover:underline" data-lang-key="passwordRecoveryBackToLogin">返回登入</a>
    </div>

    <div id="password-reset-content" class="hidden">
      <h1 class="text-2xl font-bold text-center text-gray-800" data-lang-key="passwordResetNewTitle">設定新密碼</h1>
      <p class="mt-2 mb-7 text-center text-sm leading-6 text-gray-500" data-lang-key="passwordResetNewDescription">建立至少 8 個字元的新登入密碼。</p>
      <form id="password-reset-form" novalidate>
        <label for="password-reset-new" class="block text-sm font-medium text-gray-700 mb-1" data-lang-key="passwordResetNewLabel">新密碼</label>
        <input id="password-reset-new" type="password" minlength="8" autocomplete="new-password" required class="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" data-lang-key-placeholder="newPasswordPlaceholder" placeholder="新密碼（至少 8 個字元）">
        <label for="password-reset-confirmation" class="mt-4 block text-sm font-medium text-gray-700 mb-1" data-lang-key="passwordResetConfirmLabel">確認新密碼</label>
        <input id="password-reset-confirmation" type="password" minlength="8" autocomplete="new-password" required class="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" data-lang-key-placeholder="confirmNewPasswordPlaceholder" placeholder="再次輸入新密碼">
        <button id="password-reset-submit" type="submit" class="mt-6 w-full p-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-300" data-lang-key="resetPasswordButton">更新密碼</button>
      </form>
      <p id="password-reset-status" class="hidden mt-5 rounded-lg p-3 text-center text-sm" role="status" aria-live="polite"></p>
    </div>
  `);
}

function applyLanguage(document, language, route) {
  const translations = i18n[language] || i18n.en;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = translations[route === PASSWORD_RESET_ROUTE ? 'passwordResetPageTitle' : 'passwordRecoveryPageTitle'] || 'Noureon';
  document.querySelectorAll('[data-lang-key]').forEach((element) => {
    const value = translations[element.dataset.langKey];
    if (value) element.textContent = value;
  });
  document.querySelectorAll('[data-lang-key-placeholder]').forEach((element) => {
    const value = translations[element.dataset.langKeyPlaceholder];
    if (value) element.placeholder = value;
  });
  const label = document.getElementById('recovery-language-label');
  if (label) label.textContent = LANGUAGE_LABELS[language];
}

function bindLanguageSwitcher({ window, document, route, getLanguage, setLanguage }) {
  const button = document.getElementById('recovery-language-button');
  const menu = document.getElementById('recovery-language-menu');
  button?.addEventListener('click', () => {
    const opening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !opening);
    button.setAttribute('aria-expanded', String(opening));
  });
  document.querySelectorAll('[data-recovery-language]').forEach((option) => {
    option.addEventListener('click', (event) => {
      event.preventDefault();
      const language = normalizeLanguage(option.dataset.recoveryLanguage);
      setLanguage(language);
      window.sessionStorage.setItem(RECOVERY_LANGUAGE_KEY, language);
      const url = new URL(window.location.href);
      url.searchParams.set('lang', language);
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
      menu.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
      applyLanguage(document, language, route);
    });
  });
  applyLanguage(document, getLanguage(), route);
}

function setStatus(element, message, type = 'info') {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('hidden', 'bg-red-50', 'text-red-700', 'bg-green-50', 'text-green-700', 'bg-blue-50', 'text-blue-700');
  element.classList.add(...(type === 'error'
    ? ['bg-red-50', 'text-red-700']
    : type === 'success'
      ? ['bg-green-50', 'text-green-700']
      : ['bg-blue-50', 'text-blue-700']));
}

function setButtonBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
}

function readVerification(window) {
  const raw = window.sessionStorage.getItem(RECOVERY_VERIFICATION_KEY);
  if (!raw) return { marker: null, expired: false };
  try {
    const marker = JSON.parse(raw);
    return { marker, expired: !marker?.userId || !marker?.expiresAt || marker.expiresAt <= Date.now() };
  } catch {
    return { marker: null, expired: false };
  }
}

async function initializeForgotPassword({ window, document, supabase, turnstile, navigate, text }) {
  const requestForm = document.getElementById('password-recovery-request-form');
  const codeForm = document.getElementById('password-recovery-code-form');
  const emailInput = document.getElementById('password-recovery-email');
  const codeInput = document.getElementById('password-recovery-code');
  const sendButton = document.getElementById('password-recovery-send-button');
  const verifyButton = document.getElementById('password-recovery-verify-button');
  const requestAgain = document.getElementById('password-recovery-request-again');
  const status = document.getElementById('password-recovery-status');
  let submittedEmail = window.sessionStorage.getItem(RECOVERY_EMAIL_KEY) || '';
  let countdownTimer;
  emailInput.value = submittedEmail;

  if (!turnstile.enabled) {
    setStatus(status, text('turnstileInitFailed', '驗證模組載入失敗，請重新整理後再試。'), 'error');
    sendButton.disabled = true;
  }

  const showRequestForm = () => {
    requestForm.classList.remove('hidden');
    codeForm.classList.add('hidden');
    status.classList.add('hidden');
    emailInput.focus();
  };

  const startResendCountdown = () => {
    let remaining = 60;
    requestAgain.disabled = true;
    const update = () => {
      requestAgain.textContent = text('passwordRecoveryResendCountdown', '重新寄送（{seconds} 秒）').replace('{seconds}', remaining);
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        requestAgain.disabled = false;
        requestAgain.textContent = text('passwordRecoveryRequestAnother', '重新取得驗證碼');
      }
      remaining -= 1;
    };
    update();
    countdownTimer = window.setInterval(update, 1000);
    countdownTimer?.unref?.();
  };

  if (turnstile.enabled) {
    try {
      await turnstile.mount('password-recovery-send', sendButton);
    } catch (error) {
      setStatus(status, text('turnstileInitFailed', '驗證模組載入失敗，請重新整理後再試。'), 'error');
      sendButton.disabled = true;
      console.error('Password recovery Turnstile failed to initialize:', error);
    }
  }

  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    if (!email || !emailInput.checkValidity()) {
      setStatus(status, text('passwordRecoveryEmailInvalid', '請輸入有效的 Email。'), 'error');
      return;
    }
    if (!turnstile.enabled) {
      setStatus(status, text('turnstileInitFailed', '驗證模組載入失敗，請重新整理後再試。'), 'error');
      return;
    }
    const captchaToken = turnstile.getToken('password-recovery-send');
    if (!captchaToken) {
      setStatus(status, text('turnstileRequired', '請先完成人機驗證。'), 'error');
      return;
    }
    setButtonBusy(sendButton, true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      captchaToken: captchaToken || undefined
    });
    turnstile.reset('password-recovery-send');
    setButtonBusy(sendButton, false);
    if (error) {
      setStatus(status, text('passwordRecoverySendFailed', '目前無法寄送驗證碼，請稍後再試。'), 'error');
      return;
    }
    submittedEmail = email;
    window.sessionStorage.setItem(RECOVERY_EMAIL_KEY, email);
    requestForm.classList.add('hidden');
    codeForm.classList.remove('hidden');
    status.classList.add('hidden');
    codeInput.focus();
    startResendCountdown();
  });

  requestAgain.addEventListener('click', showRequestForm);

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = codeInput.value.replace(/\s/g, '');
    if (!/^\d{8}$/.test(token)) {
      setStatus(status, text('passwordRecoveryCodeInvalidFormat', '請輸入 8 位數驗證碼。'), 'error');
      return;
    }
    setButtonBusy(verifyButton, true);
    const { data, error } = await supabase.auth.verifyOtp({ email: submittedEmail, token, type: 'recovery' });
    setButtonBusy(verifyButton, false);
    if (error || !data?.session?.user) {
      setStatus(status, text('passwordRecoveryCodeInvalid', '驗證碼錯誤或已失效，請重新確認。'), 'error');
      return;
    }
    window.sessionStorage.setItem(RECOVERY_VERIFICATION_KEY, JSON.stringify({
      userId: data.session.user.id,
      verifiedAt: Date.now(),
      expiresAt: Date.now() + RECOVERY_WINDOW_MS
    }));
    navigate(PASSWORD_RESET_ROUTE);
  });
}

async function initializeResetPassword({ window, document, supabase, navigate, text }) {
  const loading = document.getElementById('password-reset-loading');
  const blocked = document.getElementById('password-reset-blocked');
  const blockedMessage = document.getElementById('password-reset-blocked-message');
  const content = document.getElementById('password-reset-content');
  const form = document.getElementById('password-reset-form');
  const passwordInput = document.getElementById('password-reset-new');
  const confirmationInput = document.getElementById('password-reset-confirmation');
  const submitButton = document.getElementById('password-reset-submit');
  const status = document.getElementById('password-reset-status');
  const verification = readVerification(window);

  const showBlocked = (key, fallback) => {
    loading.classList.add('hidden');
    content.classList.add('hidden');
    blocked.classList.remove('hidden');
    blockedMessage.dataset.langKey = key;
    blockedMessage.textContent = text(key, fallback);
  };

  if (!verification.marker) {
    window.sessionStorage.removeItem(RECOVERY_VERIFICATION_KEY);
    showBlocked('passwordResetVerificationRequired', '若要重設密碼，請先輸入 Email 並完成驗證碼驗證。');
    return;
  }
  if (verification.expired) {
    window.sessionStorage.removeItem(RECOVERY_VERIFICATION_KEY);
    showBlocked('passwordResetVerificationExpired', '此次驗證已失效，請重新取得驗證碼。');
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.user || data.session.user.id !== verification.marker.userId) {
    window.sessionStorage.removeItem(RECOVERY_VERIFICATION_KEY);
    showBlocked('passwordResetVerificationUnavailable', '無法確認此次驗證，請重新取得驗證碼。');
    return;
  }

  loading.classList.add('hidden');
  content.classList.remove('hidden');
  passwordInput.focus();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = passwordInput.value;
    if (password.length < 8) {
      setStatus(status, text('passwordResetTooShort', '新密碼至少需要 8 個字元。'), 'error');
      return;
    }
    if (password !== confirmationInput.value) {
      setStatus(status, text('passwordResetMismatchOnly', '兩次輸入的新密碼不一致。'), 'error');
      return;
    }
    setButtonBusy(submitButton, true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setButtonBusy(submitButton, false);
      setStatus(status, text('passwordResetUpdateFailed', '無法更新密碼，請重新取得驗證碼後再試。'), 'error');
      return;
    }
    window.sessionStorage.removeItem(RECOVERY_VERIFICATION_KEY);
    window.sessionStorage.removeItem(RECOVERY_EMAIL_KEY);
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/', { replace: true });
  });
}

export async function initializePasswordRecoveryPage({
  window,
  document,
  supabase = getSupabaseClient(),
  turnstile = createTurnstileClient({ window, document }),
  navigate = (path, options) => defaultNavigate(window, path, options)
} = globalThis) {
  const route = window.location.pathname;
  if (!isPasswordRecoveryRoute(route)) return { handled: false };

  document.getElementById('app').innerHTML = route === PASSWORD_RESET_ROUTE
    ? resetPasswordMarkup()
    : forgotPasswordMarkup();

  let language = getStoredLanguage(window);
  const text = (key, fallback) => (i18n[language] || i18n.en)[key] || fallback;
  bindLanguageSwitcher({
    window,
    document,
    route,
    getLanguage: () => language,
    setLanguage: (nextLanguage) => { language = nextLanguage; }
  });

  if (!isSupabaseConfigured() && !supabase) {
    if (route === PASSWORD_RESET_ROUTE) {
      document.getElementById('password-reset-loading').classList.add('hidden');
      document.getElementById('password-reset-blocked').classList.remove('hidden');
      const message = document.getElementById('password-reset-blocked-message');
      message.dataset.langKey = 'cloudAccountUnavailable';
      message.textContent = text('cloudAccountUnavailable', '尚未連接 Supabase，無法使用帳號救援。');
    } else {
      setStatus(
        document.getElementById('password-recovery-status'),
        text('cloudAccountUnavailable', '尚未連接 Supabase，無法使用帳號救援。'),
        'error'
      );
    }
    document.querySelectorAll('button[type="submit"]').forEach(button => { button.disabled = true; });
    return { handled: true, enabled: false };
  }

  if (route === PASSWORD_RESET_ROUTE) {
    await initializeResetPassword({ window, document, supabase, navigate, text });
  } else {
    await initializeForgotPassword({ window, document, supabase, turnstile, navigate, text });
  }
  return { handled: true, enabled: true };
}
