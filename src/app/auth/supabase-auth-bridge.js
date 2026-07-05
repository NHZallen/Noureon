import { createLegacyRuntimeStorageAdapter } from '../runtime/kernel/storage-adapter.js';
import { reconcileStoredWorkspaceOwner } from '../runtime/kernel/user-data-retention.js';
import { createTurnstileClient } from '../runtime/security/turnstile-client.js';
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
  || 'AstraChat User'
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

  const emailLabel = document.querySelector('label[for="username-input"]');
  const setAccountLabel = (text) => {
    if (!emailLabel) return;
    emailLabel.removeAttribute('data-lang-key');
    emailLabel.textContent = text;
  };

  const googleButton = createButton(document, {
    id: 'supabase-google-btn',
    text: '使用 Google 登入',
    className: 'w-full p-3 rounded-lg font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors'
  });
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
  const localButton = createButton(document, {
    id: 'local-mode-btn',
    text: '使用舊版本機登入 / 匯入',
    className: LEGACY_ENTRY_BUTTON_CLASS
  });
  const divider = document.createElement('div');
  divider.className = 'flex items-center gap-3 py-1 text-xs text-gray-400';
  divider.innerHTML = '<span class="h-px flex-1 bg-gray-200"></span><span>或</span><span class="h-px flex-1 bg-gray-200"></span>';

  loginButton.after(forgotButton, divider, googleButton, localButton);

  const status = document.createElement('p');
  status.id = 'supabase-auth-status';
  status.className = 'hidden mt-4 text-sm text-center rounded-lg p-3';
  form.after(status);

  const recoveryPanel = document.createElement('form');
  recoveryPanel.id = 'supabase-recovery-form';
  recoveryPanel.className = 'hidden space-y-4';
  recoveryPanel.innerHTML = `
    <h3 class="text-xl font-bold text-center text-gray-800">設定新密碼</h3>
    <input id="supabase-new-password" type="password" minlength="8" autocomplete="new-password" required
      class="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
      placeholder="新密碼，至少 8 個字元">
    <input id="supabase-confirm-password" type="password" minlength="8" autocomplete="new-password" required
      class="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
      placeholder="再次輸入新密碼">
    <button type="submit" class="w-full p-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">更新密碼</button>
  `;
  status.after(recoveryPanel);

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
    recoveryPanel,
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

function isPasswordRecoveryUrl(window) {
  return window.location.hash.includes('type=recovery')
    || window.location.search.includes('type=recovery');
}

async function prepareCloudImport({ window, elements, storage, user }) {
  const record = await persistCloudUser(storage, user, { remember: false, reconcileOwner: false });
  await storage.removeItem('chat_lastUser');
  elements.setLocalMode({ importTargetUser: record });
  elements.emailInput.value = '';
  elements.passwordInput.value = '';
  setStatus(
    elements,
    '請輸入舊版帳號密碼，然後按「匯入紀錄」。匯入後資料會放到目前登入的雲端帳號底下。',
    'info'
  );
  window.history.replaceState({}, window.document.title, window.location.pathname);
  elements.emailInput.focus();
  return record;
}

async function finishCloudLogin({ window, elements, storage, user }) {
  const wantsImport = window.confirm('登入成功。是否要匯入舊版本機紀錄？');
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
      setStatus(elements, '安全驗證載入失敗，請重新整理後再試。', 'error');
      console.error('Supabase auth Turnstile failed to initialize:', error);
    }
  }

  const getCaptchaToken = () => {
    const captchaToken = turnstile.getToken('supabase-auth');
    if (turnstile.enabled && !captchaToken) {
      setStatus(elements, '請先完成人機驗證。', 'error');
      return null;
    }
    return captchaToken || undefined;
  };

  const recoveryMode = isPasswordRecoveryUrl(window);
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  let activeCloudSession = session;
  supabase.auth.onAuthStateChange((_event, nextSession) => {
    activeCloudSession = nextSession;
  });
  if (sessionError) setStatus(elements, sessionError.message, 'error');

  if (recoveryMode && session) {
    elements.form.classList.add('hidden');
    elements.recoveryPanel.classList.remove('hidden');
    setStatus(elements, '請設定您的新密碼。');
  } else if (session?.user) {
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
      setStatus(elements, '請輸入 Email，密碼至少 8 個字元。', 'error');
      return;
    }
    const captchaToken = getCaptchaToken();
    if (turnstile.enabled && !captchaToken) return;
    setBusy(elements, true);
    setStatus(elements, '登入中；如果帳號不存在，會自動建立。');

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
    setStatus(elements, '帳號已建立，請到信箱點擊驗證連結後再登入。', 'success');
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

  elements.forgotButton.addEventListener('click', async () => {
    const email = elements.emailInput.value.trim();
    if (!email) {
      setStatus(elements, '請先輸入要重設密碼的 Email。', 'error');
      return;
    }
    const captchaToken = getCaptchaToken();
    if (turnstile.enabled && !captchaToken) return;
    setBusy(elements, true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
      captchaToken
    });
    turnstile.reset('supabase-auth');
    setBusy(elements, false);
    setStatus(
      elements,
      error ? error.message : '重設密碼信已送出，請查看信箱。',
      error ? 'error' : 'success'
    );
  });

  elements.localButton.addEventListener('click', async (event) => {
    event.preventDefault();
    if (elements.isLocalMode()) {
      elements.setCloudMode();
      setStatus(elements, '已切回 Email / Google 登入。');
      return;
    }
    await supabase.auth.signOut({ scope: 'local' });
    elements.setLocalMode();
    setStatus(elements, '請輸入舊版帳號密碼；也可以在這裡匯入舊版備份。');
  });

  elements.importButton?.addEventListener('click', (event) => {
    if (elements.isLocalMode()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    elements.setLocalMode();
    setStatus(elements, '請先輸入舊版帳號密碼，再按「匯入紀錄」。');
    elements.emailInput.focus();
  });

  elements.recoveryPanel.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('supabase-new-password').value;
    const confirmation = document.getElementById('supabase-confirm-password').value;
    if (password.length < 8 || password !== confirmation) {
      setStatus(elements, '兩次密碼需一致，且至少 8 個字元。', 'error');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus(elements, error.message, 'error');
      return;
    }
    await supabase.auth.signOut();
    elements.recoveryPanel.classList.add('hidden');
    elements.form.classList.remove('hidden');
    window.history.replaceState({}, document.title, window.location.pathname);
    setStatus(elements, '密碼已更新，請用新密碼登入。', 'success');
  });

  document.addEventListener('click', async (event) => {
    const logoutButton = event.target.closest?.('#logout-btn, #settings-mobile-logout-btn, #settings-desktop-logout-btn');
    if (!logoutButton) return;
    if (!activeCloudSession && !(await hasCachedCloudUser(storage))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!window.confirm('確定要登出嗎？')) return;
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
