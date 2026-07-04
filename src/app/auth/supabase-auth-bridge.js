import { createLegacyRuntimeStorageAdapter } from '../runtime/kernel/storage-adapter.js';
import { createTurnstileClient } from '../runtime/security/turnstile-client.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase-client.js';

const CLOUD_USER_PREFIX = 'supabase:';

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
  if (!form || !emailInput || !passwordInput || !loginButton) return null;

  const emailLabel = document.querySelector('label[for="username-input"]');
  if (emailLabel) {
    emailLabel.removeAttribute('data-lang-key');
    emailLabel.textContent = 'Email';
  }
  emailInput.type = 'email';
  emailInput.autocomplete = 'email';
  emailInput.placeholder = 'name@example.com';
  emailInput.removeAttribute('data-lang-key-placeholder');
  passwordInput.autocomplete = 'current-password';
  passwordInput.placeholder = '至少 8 個字元';
  passwordInput.removeAttribute('data-lang-key-placeholder');

  loginButton.removeAttribute('data-lang-key');
  loginButton.textContent = '登入';

  const actionContainer = loginButton.parentElement;
  const signupButton = createButton(document, {
    id: 'supabase-signup-btn',
    text: '建立帳號',
    className: 'w-full p-3 rounded-lg font-semibold border border-blue-600 text-blue-700 bg-white hover:bg-blue-50 transition-colors'
  });
  const googleButton = createButton(document, {
    id: 'supabase-google-btn',
    text: '使用 Google 登入',
    className: 'w-full p-3 rounded-lg font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors'
  });
  const forgotButton = createButton(document, {
    id: 'supabase-forgot-password-btn',
    text: '忘記密碼？',
    className: 'w-full text-sm text-blue-700 hover:underline'
  });
  const localButton = createButton(document, {
    id: 'local-mode-btn',
    text: '不登入，僅在此裝置使用',
    className: 'w-full text-sm text-gray-600 hover:text-gray-900 hover:underline'
  });

  const divider = document.createElement('div');
  divider.className = 'flex items-center gap-3 py-1 text-xs text-gray-400';
  divider.innerHTML = '<span class="h-px flex-1 bg-gray-200"></span><span>或</span><span class="h-px flex-1 bg-gray-200"></span>';

  loginButton.after(signupButton, forgotButton, divider, googleButton, localButton);

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
      placeholder="新密碼（至少 8 個字元）">
    <input id="supabase-confirm-password" type="password" minlength="8" autocomplete="new-password" required
      class="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
      placeholder="再次輸入新密碼">
    <button type="submit" class="w-full p-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">更新密碼</button>
  `;
  status.after(recoveryPanel);

  return {
    form,
    emailInput,
    passwordInput,
    loginButton,
    signupButton,
    googleButton,
    forgotButton,
    localButton,
    status,
    recoveryPanel
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
  for (const button of [elements.loginButton, elements.signupButton, elements.googleButton, elements.forgotButton]) {
    button.disabled = busy;
  }
}

function getAuthValues(elements) {
  return {
    email: elements.emailInput.value.trim(),
    password: elements.passwordInput.value
  };
}

async function persistCloudUser(storage, user) {
  const record = createCloudUserRecord(user);
  await storage.setItem(`chatUser_${record.username}`, JSON.stringify(record));
  await storage.setItem('chat_lastUser', record.username);
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

function isPasswordRecoveryUrl(window) {
  return window.location.hash.includes('type=recovery')
    || window.location.search.includes('type=recovery');
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
      setStatus(elements, '請先完成安全驗證。', 'error');
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
    setStatus(elements, '請設定新的登入密碼。');
  } else if (session?.user) {
    await persistCloudUser(storage, session.user);
  } else {
    await clearStaleCloudUser(storage);
  }

  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const { email, password } = getAuthValues(elements);
    if (!email || !password) {
      setStatus(elements, '請輸入 Email 和密碼。', 'error');
      return;
    }
    const captchaToken = getCaptchaToken();
    if (turnstile.enabled && !captchaToken) return;
    setBusy(elements, true);
    setStatus(elements, '正在登入…');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken }
    });
    turnstile.reset('supabase-auth');
    setBusy(elements, false);
    if (error) {
      setStatus(elements, error.message, 'error');
      return;
    }
    await persistCloudUser(storage, data.user);
    window.location.reload();
  }, true);

  elements.signupButton.addEventListener('click', async () => {
    const { email, password } = getAuthValues(elements);
    if (!email || password.length < 8) {
      setStatus(elements, '請輸入有效 Email，密碼至少需要 8 個字元。', 'error');
      return;
    }
    const captchaToken = getCaptchaToken();
    if (turnstile.enabled && !captchaToken) return;
    setBusy(elements, true);
    setStatus(elements, '正在建立帳號…');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        captchaToken
      }
    });
    turnstile.reset('supabase-auth');
    setBusy(elements, false);
    if (error) {
      setStatus(elements, error.message, 'error');
      return;
    }
    if (data.session && data.user) {
      await persistCloudUser(storage, data.user);
      window.location.reload();
      return;
    }
    setStatus(elements, '帳號已建立，請到信箱點擊驗證連結後再登入。', 'success');
  });

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
      error ? error.message : '重設密碼信已寄出，請查看信箱。',
      error ? 'error' : 'success'
    );
  });

  elements.localButton.addEventListener('click', async () => {
    await supabase.auth.signOut({ scope: 'local' });
    const localUser = {
      username: 'local-device-user',
      displayName: '本機使用者',
      authProvider: 'local'
    };
    await storage.setItem(`chatUser_${localUser.username}`, JSON.stringify(localUser));
    await storage.setItem('chat_lastUser', localUser.username);
    window.location.reload();
  });

  elements.recoveryPanel.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('supabase-new-password').value;
    const confirmation = document.getElementById('supabase-confirm-password').value;
    if (password.length < 8 || password !== confirmation) {
      setStatus(elements, '兩次密碼必須相同，且至少 8 個字元。', 'error');
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
    setStatus(elements, '密碼已更新，請使用新密碼登入。', 'success');
  });

  document.addEventListener('click', async (event) => {
    const logoutButton = event.target.closest?.('#logout-btn');
    if (!logoutButton) return;
    if (!activeCloudSession) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!window.confirm('確定要登出嗎？')) return;
    await supabase.auth.signOut();
    activeCloudSession = null;
    await storage.removeItem('chat_lastUser');
    window.location.reload();
  }, true);

  return { enabled: true, session };
}
