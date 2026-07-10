import { createLegacyRuntimeStorageAdapter } from '../runtime/kernel/storage-adapter.js';
import { reconcileStoredWorkspaceOwner, STORAGE_OWNER_KEY } from '../runtime/kernel/user-data-retention.js';
import { createTurnstileClient } from '../runtime/security/turnstile-client.js';
import { migrateSyncVaultRecord } from '../sync/sync-vault.js';
import { completePendingCloudAccountLink } from './account-linking.js';
import { openPasswordRecovery } from './password-recovery-page.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase-client.js';

const CLOUD_USER_PREFIX = 'supabase:';
const LEGACY_ENTRY_BUTTON_CLASS = 'w-full p-3 rounded-lg font-semibold text-white bg-gray-800 hover:bg-gray-900 focus:outline-none transition-colors';
const LEGACY_IMPORT_BUTTON_CLASS = 'w-full p-3 rounded-lg font-semibold text-white bg-gray-800 hover:bg-gray-900 focus:outline-none disabled:bg-gray-400 disabled:cursor-not-allowed';
const LEGACY_RETURN_LINK_CLASS = 'w-full text-sm text-gray-600 hover:text-gray-900 hover:underline';

const getCloudUsername = (user) => `${CLOUD_USER_PREFIX}${user.id}`;

const getDisplayName = (user) => (
  user.user_metadata?.full_name
  || user.user_metadata?.name
  || user.email?.split('@')[0]
  || 'Noureon User'
);

export function createCloudUserRecord(user) {
  return {
    username: getCloudUsername(user),
    displayName: getDisplayName(user),
    email: user.email || '',
    supabaseUserId: user.id,
    authProvider: 'supabase'
  };
}

function createButton(document, { id, text, className }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.className = className;
  button.textContent = text;
  return button;
}

export function enhanceAuthShell(document) {
  const form = document.getElementById('auth-form');
  const emailInput = document.getElementById('username-input');
  const passwordInput = document.getElementById('password-input');
  const loginButton = document.getElementById('register-btn');
  const importButton = document.getElementById('import-btn-auth');
  if (!form || !emailInput || !passwordInput || !loginButton) return null;

  const getTranslations = () => {
    const window = document.defaultView || globalThis;
    const i18n = window.i18n || globalThis.i18n || {};
    const lang = document.documentElement?.lang || 'zh-TW';
    return i18n[lang] || i18n['zh-TW'] || {};
  };
  const text = (key, fallback) => getTranslations()[key] || fallback;
  const setText = (element, key, fallback) => {
    if (!element) return;
    if (element.id === 'supabase-google-btn') {
      Array.from(element.childNodes)
        .filter((node) => node.nodeType === 3)
        .forEach((node) => node.remove());
      let label = element.querySelector('.auth-button-label');
      if (!label) {
        label = document.createElement('span');
        label.className = 'auth-button-label';
        element.appendChild(label);
      }
      label.dataset.langKey = key;
      label.textContent = text(key, fallback);
      return;
    }
    element.dataset.langKey = key;
    element.textContent = text(key, fallback);
  };
  const setPlaceholder = (element, key, fallback) => {
    if (!element) return;
    element.dataset.langKeyPlaceholder = key;
    element.placeholder = text(key, fallback);
  };
  const emailLabel = document.querySelector('label[for="username-input"]');
  const setAccountLabel = (key, fallback) => {
    if (!emailLabel) return;
    setText(emailLabel, key, fallback);
  };

  const googleButton = createButton(document, {
    id: 'supabase-google-btn',
    text: '使用 Google 登入',
    className: 'w-full p-3 rounded-lg font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors'
  });
  setText(googleButton, 'supabaseGoogleLogin', '使用 Google 登入');
  googleButton.classList.add('flex', 'items-center', 'justify-center', 'gap-2');
  const googleLogo = document.createElement('img');
  googleLogo.src = '/google-g-logo.png';
  googleLogo.width = 20;
  googleLogo.height = 20;
  googleLogo.alt = '';
  googleLogo.className = 'flex-shrink-0 object-contain';
  googleLogo.setAttribute('aria-hidden', 'true');
  googleButton.prepend(googleLogo);
  const forgotButton = createButton(document, {
    id: 'supabase-forgot-password-btn',
    text: '忘記密碼？',
    className: 'w-full text-sm text-blue-700 hover:underline'
  });
  setText(forgotButton, 'forgotPassword', '忘記密碼？');
  const localButton = createButton(document, {
    id: 'local-mode-btn',
    text: '使用舊版本機登入 / 匯入',
    className: LEGACY_ENTRY_BUTTON_CLASS
  });
  setText(localButton, 'localModeEntry', '使用舊版本機登入 / 匯入');
  const divider = document.createElement('div');
  divider.className = 'flex items-center gap-3 py-1 text-xs text-gray-400';
  divider.innerHTML = `<span class="h-px flex-1 bg-gray-200"></span><span data-lang-key="authDividerOr">${text('authDividerOr', 'or')}</span><span class="h-px flex-1 bg-gray-200"></span>`;
  loginButton.after(forgotButton, divider, googleButton, localButton);

  const status = document.createElement('p');
  status.id = 'supabase-auth-status';
  status.className = 'hidden mt-4 text-sm text-center rounded-lg p-3';
  form.after(status);

  const updateLocalImportButton = () => {
    if (!importButton || form.dataset.authMode !== 'local') return;
    importButton.disabled = !(emailInput.value.trim() && passwordInput.value);
  };

  const setCloudMode = () => {
    form.dataset.authMode = 'cloud';
    delete form.dataset.importTargetUser;
    setAccountLabel('Email');
    emailInput.type = 'email';
    emailInput.autocomplete = 'email';
    emailInput.placeholder = 'name@example.com';
    emailInput.removeAttribute('data-lang-key-placeholder');
    passwordInput.autocomplete = 'current-password';
    passwordInput.placeholder = '至少 8 個字元';
    passwordInput.removeAttribute('data-lang-key-placeholder');
    loginButton.removeAttribute('data-lang-key');
    loginButton.textContent = '登入 / 建立帳號';
    googleButton.classList.remove('hidden');
    forgotButton.classList.remove('hidden');
    divider.classList.remove('hidden');
    localButton.textContent = '使用舊版本機登入 / 匯入';
    localButton.className = LEGACY_ENTRY_BUTTON_CLASS;
    if (importButton) {
      importButton.removeAttribute('data-lang-key');
      importButton.textContent = '匯入舊版紀錄';
      importButton.disabled = false;
      importButton.className = `${LEGACY_IMPORT_BUTTON_CLASS} hidden`;
      localButton.after(importButton);
    }
    setAccountLabel('authEmailLabel', 'Email');
    setPlaceholder(emailInput, 'authEmailPlaceholder', 'name@example.com');
    setPlaceholder(passwordInput, 'authPasswordPlaceholder', '至少 8 個字元');
    setText(loginButton, 'cloudLoginRegister', '登入 / 建立帳號');
    setText(googleButton, 'supabaseGoogleLogin', '使用 Google 登入');
    setText(forgotButton, 'forgotPassword', '忘記密碼？');
    setText(localButton, 'localModeEntry', '使用舊版本機登入 / 匯入');
    if (importButton) setText(importButton, 'importLocalRecords', '匯入舊紀錄');
  };

  const setLocalMode = ({ importTargetUser = null } = {}) => {
    form.dataset.authMode = 'local';
    if (importTargetUser) {
      form.dataset.importTargetUser = JSON.stringify(importTargetUser);
    } else {
      delete form.dataset.importTargetUser;
    }
    setAccountLabel('舊版帳號 / 本機名稱');
    emailInput.type = 'text';
    emailInput.autocomplete = 'username';
    emailInput.placeholder = '輸入舊版帳號或新的本機名稱';
    passwordInput.autocomplete = 'current-password';
    passwordInput.placeholder = '舊版密碼或新的本機密碼';
    loginButton.removeAttribute('data-lang-key');
    loginButton.textContent = importTargetUser ? '稍後再匯入，直接進入' : '登入 / 註冊本機帳號';
    googleButton.classList.add('hidden');
    forgotButton.classList.add('hidden');
    divider.classList.add('hidden');
    localButton.textContent = '返回 Email / Google 登入';
    localButton.className = LEGACY_RETURN_LINK_CLASS;
    if (importButton) {
      importButton.removeAttribute('data-lang-key');
      importButton.textContent = '匯入紀錄';
      importButton.className = LEGACY_IMPORT_BUTTON_CLASS;
      localButton.before(importButton);
      updateLocalImportButton();
    }
    setAccountLabel('localAccountLabel', '舊版帳號 / 本機名稱');
    setPlaceholder(emailInput, 'localUsernamePlaceholder', '輸入舊版帳號或本機名稱');
    setPlaceholder(passwordInput, 'localPasswordPlaceholder', '舊版密碼或新的本機密碼');
    setText(loginButton, importTargetUser ? 'localImportLogin' : 'localLoginRegister', importTargetUser ? '登入並完成匯入' : '登入 / 註冊本機帳號');
    setText(localButton, 'localModeReturn', '返回 Email / Google 登入');
    if (importButton) setText(importButton, 'importRecords', '匯入紀錄');
  };

  emailInput.addEventListener('input', updateLocalImportButton);
  passwordInput.addEventListener('input', updateLocalImportButton);
  setCloudMode();

  return {
    form,
    emailInput,
    passwordInput,
    loginButton,
    googleButton,
    forgotButton,
    localButton,
    importButton,
    status,
    setCloudMode,
    setLocalMode,
    isLocalMode: () => form.dataset.authMode === 'local'
  };
}

function setStatus(elements, message, type = 'info') {
  elements.status.textContent = message;
  elements.status.classList.remove('hidden', 'bg-red-50', 'text-red-700', 'bg-green-50', 'text-green-700', 'bg-blue-50', 'text-blue-700');
  const styles = type === 'error'
    ? ['bg-red-50', 'text-red-700']
    : type === 'success'
      ? ['bg-green-50', 'text-green-700']
      : ['bg-blue-50', 'text-blue-700'];
  elements.status.classList.add(...styles);
}

function getAuthText(elements, key, fallback) {
  const document = elements.status?.ownerDocument || globalThis.document;
  const window = document?.defaultView || globalThis;
  const i18n = window.i18n || globalThis.i18n || {};
  const lang = document?.documentElement?.lang || 'zh-TW';
  return i18n[lang]?.[key] || i18n['zh-TW']?.[key] || fallback;
}

function setBusy(elements, busy) {
  for (const button of [elements.loginButton, elements.googleButton, elements.forgotButton, elements.localButton]) {
    if (button) button.disabled = busy;
  }
}

function getAuthValues(elements) {
  return {
    email: elements.emailInput.value.trim(),
    password: elements.passwordInput.value
  };
}

async function persistCloudUser(storage, user, { remember = true, reconcileOwner = true } = {}) {
  const record = createCloudUserRecord(user);
  if (reconcileOwner) {
    await reconcileStoredWorkspaceOwner({
      nextUsername: record.username,
      getItem: (...args) => storage.getItem(...args),
      setItem: (...args) => storage.setItem(...args),
      removeItem: (...args) => storage.removeItem(...args),
      storageAdapter: storage
    });
  }
  await storage.setItem(`chatUser_${record.username}`, JSON.stringify(record));
  if (remember) {
    await storage.setItem('chat_lastUser', record.username);
  }
  return record;
}

async function clearStaleCloudUser(storage) {
  const lastUsername = await storage.getItem('chat_lastUser');
  if (!lastUsername?.startsWith(CLOUD_USER_PREFIX)) return;
  const savedUser = await storage.getItem(`chatUser_${lastUsername}`);
  if (!savedUser) {
    await storage.removeItem('chat_lastUser');
    return;
  }
  try {
    if (JSON.parse(savedUser)?.authProvider === 'supabase') {
      await storage.removeItem('chat_lastUser');
    }
  } catch {
    await storage.removeItem('chat_lastUser');
  }
}

async function hasCachedCloudUser(storage) {
  const lastUsername = await storage.getItem('chat_lastUser');
  if (!lastUsername?.startsWith(CLOUD_USER_PREFIX)) return false;
  const savedUser = await storage.getItem(`chatUser_${lastUsername}`);
  if (!savedUser) return false;
  try {
    return JSON.parse(savedUser)?.authProvider === 'supabase';
  } catch {
    return false;
  }
}

async function prepareCloudImport({ window, elements, storage, user }) {
  const record = await persistCloudUser(storage, user, { remember: false, reconcileOwner: false });
  await storage.removeItem('chat_lastUser');
  elements.setLocalMode({ importTargetUser: record });
  elements.emailInput.value = '';
  elements.passwordInput.value = '';
  setStatus(elements, getAuthText(elements, 'cloudImportPasswordHint', 'Enter the legacy account password; legacy data will be imported after login.'), 'info');
  window.history.replaceState({}, window.document.title, window.location.pathname);
  elements.emailInput.focus();
  return record;
}

async function finishCloudLogin({ window, elements, storage, user }) {
  const wantsImport = window.confirm(getAuthText(elements, 'cloudLoginImportConfirm', '要匯入舊版本機資料到這個雲端帳號嗎？'));
  if (wantsImport) {
    await prepareCloudImport({ window, elements, storage, user });
    return;
  }
  await persistCloudUser(storage, user);
  window.location.reload();
}

export async function initializeSupabaseAuthBridge({ window, document } = globalThis) {
  if (!isSupabaseConfigured()) return { enabled: false };

  const supabase = getSupabaseClient();
  const storage = createLegacyRuntimeStorageAdapter();
  const elements = enhanceAuthShell(document);
  if (!elements) return { enabled: true };
  const turnstile = createTurnstileClient({ window, document });
  if (turnstile.enabled) {
    try {
      await turnstile.mount('supabase-auth', elements.loginButton);
    } catch (error) {
      setStatus(elements, getAuthText(elements, 'turnstileInitFailed', '驗證模組載入失敗，請重新整理後再試。'), 'error');
      console.error('Supabase auth Turnstile failed to initialize:', error);
    }
  }

  const getCaptchaToken = () => {
    const captchaToken = turnstile.getToken('supabase-auth');
    if (turnstile.enabled && !captchaToken) {
      setStatus(elements, getAuthText(elements, 'turnstileRequired', '請先完成驗證。'), 'error');
      return null;
    }
    return captchaToken || undefined;
  };

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  let activeCloudSession = session;
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    activeCloudSession = nextSession;
  });
  if (sessionError) setStatus(elements, sessionError.message, 'error');

  if (session?.user) {
    const completedLink = await completePendingCloudAccountLink({
      storage,
      cloudUserRecord: createCloudUserRecord(session.user)
    });
    if (completedLink) {
      window.location.reload();
      return { enabled: true, session };
    }
    const lastUsername = await storage.getItem('chat_lastUser');
    if (lastUsername === getCloudUsername(session.user)) {
      await persistCloudUser(storage, session.user);
    } else {
      await finishCloudLogin({ window, elements, storage, user: session.user });
    }
  } else {
    await clearStaleCloudUser(storage);
  }

  elements.form.addEventListener('submit', async (event) => {
    if (elements.isLocalMode()) {
      const importTarget = elements.form.dataset.importTargetUser;
      if (!importTarget) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const targetUser = JSON.parse(importTarget);
      const previousUsername = await storage.getItem(STORAGE_OWNER_KEY);
      await migrateSyncVaultRecord({
        storage,
        fromUsername: previousUsername,
        toUsername: targetUser.username
      });
      await reconcileStoredWorkspaceOwner({
        nextUsername: targetUser.username,
        getItem: (...args) => storage.getItem(...args),
        setItem: (...args) => storage.setItem(...args),
        removeItem: (...args) => storage.removeItem(...args),
        storageAdapter: storage
      });
      await storage.setItem(`chatUser_${targetUser.username}`, JSON.stringify(targetUser));
      await storage.setItem('chat_lastUser', targetUser.username);
      window.location.reload();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const { email, password } = getAuthValues(elements);
    if (!email || password.length < 8) {
      setStatus(elements, getAuthText(elements, 'cloudAuthMissingFields', '請輸入 Email，且密碼至少 8 個字元。'), 'error');
      return;
    }
    const captchaToken = getCaptchaToken();
    if (turnstile.enabled && !captchaToken) return;
    setBusy(elements, true);
    setStatus(elements, getAuthText(elements, 'cloudAuthSigningIn', '正在登入，若帳號不存在會自動建立...'));

    let result = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken }
    });
    if (result.error) {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          captchaToken
        }
      });
    }

    turnstile.reset('supabase-auth');
    setBusy(elements, false);
    if (result.error) {
      setStatus(elements, result.error.message, 'error');
      return;
    }
    if (result.data.session && result.data.user) {
      await finishCloudLogin({ window, elements, storage, user: result.data.user });
      return;
    }
    setStatus(elements, getAuthText(elements, 'cloudAuthCheckEmail', '帳號已建立，請確認信箱完成驗證後再登入。'), 'success');
  }, true);

  elements.googleButton.addEventListener('click', async () => {
    setBusy(elements, true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) {
      setBusy(elements, false);
      setStatus(elements, error.message, 'error');
    }
  });

  elements.forgotButton.addEventListener('click', () => {
    openPasswordRecovery(window, {
      email: elements.emailInput.value.trim(),
      language: document.documentElement.lang
    });
  });

  elements.localButton.addEventListener('click', async (event) => {
    event.preventDefault();
    if (elements.isLocalMode()) {
      elements.setCloudMode();
      setStatus(elements, getAuthText(elements, 'cloudModeReturned', '已切回 Email / Google 登入。'));
      return;
    }
    await supabase.auth.signOut({ scope: 'local' });
    elements.setLocalMode();
    setStatus(elements, getAuthText(elements, 'localModeHint', '請輸入舊版帳號密碼；也可以在這裡匯入舊版備份。'));
  });

  elements.importButton?.addEventListener('click', (event) => {
    if (elements.isLocalMode()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    elements.setLocalMode();
    setStatus(elements, getAuthText(elements, 'importCredentialsHint', '請輸入舊版帳號密碼，匯入後會綁定到目前雲端帳號。'));
    elements.emailInput.focus();
  });

  document.addEventListener('click', async (event) => {
    const logoutButton = event.target.closest?.('#logout-btn, #settings-mobile-logout-btn, #settings-desktop-logout-btn');
    if (!logoutButton) return;
    if (!activeCloudSession && !(await hasCachedCloudUser(storage))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!window.confirm(getAuthText(elements, 'confirmLogout', '您確定要登出嗎？'))) return;
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('Supabase sign out failed; clearing local session marker anyway.', error);
    }
    activeCloudSession = null;
    await storage.removeItem('chat_lastUser');
    window.location.reload();
  }, true);

  return { enabled: true, session };
}
