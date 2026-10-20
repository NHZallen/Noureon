import { createSyncNowControls } from './settings-sync-now-controls.js';
import { createUserUidControls } from './settings-user-uid-controls.js';
import { isSyncVaultUnlocked, readSyncVaultRecord, syncVaultPolicy } from '../../sync/sync-vault.js';
import { getSupabaseClient, isSupabaseConfigured } from '../../auth/supabase-client.js';
import { createTurnstileClient } from '../security/turnstile-client.js';
import { SERVICES, getService } from '../services.js';
import { buildUserSectionMarkup, getUserSectionElements } from './settings-user-section-markup.js';
import { bindAccountLinkingActions } from './settings-account-linking-actions.js';
import { bindSyncVaultActions } from './settings-sync-vault-actions.js';

export function createSettingsSyncVaultControls({
  window,
  document,
  storage,
  getCurrentUser,
  getText,
  showNotification,
  // The page's stylesheet loads with it, keeping the startup CSS small.
  loadStyles = () => import('../../../styles/user-settings.css'),
  getSupabase = getSupabaseClient,
  isConfigured = isSupabaseConfigured,
  reloadPage = () => window.location.reload(),
  scheduleTimeout = (callback, delay) => window.setTimeout(callback, delay)
} = {}) {
  const text = (key, fallback) => getText?.(key, fallback) || fallback;
  let busy = false;
  const syncNow = createSyncNowControls({ document, getText: text });
  const userUid = createUserUidControls({ document, getSupabase: () => getSupabase(), isConfigured: () => isConfigured(), getText: text, scheduleTimeout: (...a) => scheduleTimeout(...a) });
  let accountTurnstile;
  let accountTurnstileMounted = false;
  let recoveryTurnstileMounted = false;

  const getElements = () => getUserSectionElements(document);

  const ensureSyncVaultSettings = () => {
    if (document.getElementById('user-section')?.dataset.syncVaultSettingsInitialized === 'true') return;
    const settingsNav = document.getElementById('settings-nav');
    const personalizationNav = settingsNav?.querySelector('[data-section="personalization"]');
    if (!settingsNav || !personalizationNav) return;

    const nav = document.getElementById('user-section-nav') || document.createElement('li');
    nav.id = 'user-section-nav';
    nav.className = 'settings-nav-item p-3 rounded-md';
    nav.dataset.section = 'user';
    nav.dataset.langKey = 'userSettings';
    nav.textContent = text('userSettings', '使用者');
    if (!nav.parentNode) personalizationNav.before(nav);

    const personalizationSection = document.getElementById('personalization-section');
    if (!personalizationSection) return;
    const section = document.getElementById('user-section') || document.createElement('div');
    section.id = 'user-section';
    section.className = 'settings-section';
    section.dataset.syncVaultSettingsInitialized = 'true';
    section.innerHTML = buildUserSectionMarkup(text);
    if (!section.parentNode) personalizationSection.before(section);
    Promise.resolve().then(loadStyles).catch((error) => globalThis.console?.warn?.('Loading the styles of the user page failed.', error));
    bindEvents();
  };

  const setBusy = (nextBusy) => {
    busy = nextBusy;
    const elements = getElements();
    for (const button of [elements.emailButton, elements.googleButton, elements.loginPasswordButton, elements.forgotLoginPasswordButton, elements.createButton, elements.unlockButton, elements.forgotButton, elements.recoveryButton, elements.changeButton, elements.lockButton, elements.resetButton]) {
      if (button) button.disabled = nextBusy;
    }
  };

  // Errors of the sync vault carry a code; the message is shown in the person's language.
  const vaultErrorText = (error) => {
    if (error?.code === 'vault-password-too-short') return text('cloudSyncPasswordTooShort', '同步密碼至少需要 10 碼。');
    if (error?.code === 'vault-password-incorrect' || error?.message?.includes('Incorrect')) return text('cloudSyncPasswordIncorrect', '同步密碼不正確。');
    if (error?.code === 'vault-not-configured') return text('cloudSyncPasswordNotSet', '尚未設定同步密碼');
    return '';
  };

  // The errors Supabase answers with (in English) that a person is likely to meet on this page.
  const authErrorText = (error) => {
    const code = error?.code || '';
    const message = String(error?.message || '');
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return text('loginPasswordCurrentIncorrect', '目前登入密碼不正確。');
    if (code === 'same_password' || /different from the old password/i.test(message)) return text('loginPasswordSameAsOld', '新密碼不能和目前的密碼相同。');
    if (/rate_limit/.test(code) || error?.status === 429 || /rate limit/i.test(message)) return text('authRateLimited', '嘗試次數過多，請稍後再試。');
    return '';
  };

  const notifyError = (error) => {
    showNotification(
      vaultErrorText(error) || authErrorText(error) || error?.message || text('cloudSyncPasswordError', '同步密碼操作失敗。'),
      'error'
    );
  };

  const setAccountMessage = (message, type = 'info') => {
    const element = getElements().accountMessage;
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('hidden', !message);
    element.classList.toggle('is-error', type === 'error');
  };

  /** A status with its dot: green and "bound", or grey and "not bound". */
  const setProviderStatus = (element, bound) => {
    const label = bound ? text('accountBound', '已綁定') : text('accountNotBound', '尚未綁定');
    const target = element.querySelector('.us-state-text') || element;
    target.textContent = label;
    element.classList.toggle('is-on', bound);
  };

  const ensureAccountTurnstile = async () => {
    if (accountTurnstileMounted) return;
    accountTurnstile ||= createTurnstileClient({ window, document });
    if (!accountTurnstile.enabled) return;
    await accountTurnstile.mount('account-email-link', getElements().emailButton);
    accountTurnstileMounted = true;
  };

  const ensureRecoveryTurnstile = async () => {
    if (recoveryTurnstileMounted) return;
    accountTurnstile ||= createTurnstileClient({ window, document });
    if (!accountTurnstile.enabled) return;
    // The check has a place of its own in the card, as tall as the check, so showing it moves nothing.
    const { turnstileSlot, turnstileHint, turnstileAnchor, forgotButton } = getElements();
    turnstileSlot?.classList.remove('hidden');
    turnstileHint?.classList.remove('hidden');
    await accountTurnstile.mount('sync-vault-recovery', turnstileAnchor || forgotButton);
    recoveryTurnstileMounted = true;
  };

  const getRecoveryStorageKey = (username) => `chatSyncVaultRecovery_v1_${username}`;

  const requestVaultRecovery = async (action, payload = {}) => {
    const supabase = getSupabase();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw sessionError || new Error(text('sessionRequired', '請重新登入後再試。'));
    }
    const response = await window.fetch('/api/sync-vault-recovery', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (result.code === 'current_password_required') throw new Error(text('cloudSyncCurrentPasswordRequired', '請在「目前同步密碼」輸入現在的同步密碼。忘記的話，請用「忘記同步密碼」。'));
      throw new Error(result.error || text('cloudSyncRecoveryFailed', '同步密碼復原服務失敗。'));
    }
    return result;
  };

  // Replacing what is kept takes the sync password kept now (or the Email sign-in of the recovery): a session alone is not enough.
  const storeVaultRecovery = (password, record, currentPassword = '') => requestVaultRecovery('store', { password, record, currentPassword });

  const isVerifiedRecoveryMode = async (username) => {
    const recoveryState = new URL(window.location.href).searchParams.get('vault_recovery');
    if (!recoveryState) return false;
    return recoveryState === await storage.getItem(getRecoveryStorageKey(username));
  };

  // The form's own button: "Set up Email login" for an account that is signed in already (its Email is known), "Bind Email" for a local one.
  const emailBindLabel = () => (getCurrentUser?.()?.authProvider === 'supabase'
    ? text('enableEmailLogin', '設定 Email 登入密碼')
    : text('bindEmail', '綁定 Email'));

  const setEmailFormOpen = (open) => {
    const { emailForm, emailToggle } = getElements();
    if (!emailForm) return;
    emailForm.classList.toggle('hidden', !open);
    if (!emailToggle) return;
    emailToggle.setAttribute('aria-expanded', String(open));
    emailToggle.textContent = open ? text('userCancelAction', '取消') : text('bindEmail', '綁定 Email');
    // The human check of a local account's Email is drawn when the form is opened, not while it is folded away.
    if (open && getCurrentUser?.()?.authProvider !== 'supabase') void ensureAccountTurnstile().catch(() => {});
  };

  // The login password and the sync password settings are folded away until asked for.
  const setLoginPasswordOpen = (open) => {
    const { loginPasswordPanel, loginPasswordToggle } = getElements();
    loginPasswordPanel?.classList.toggle('hidden', !open);
    if (!loginPasswordToggle) return;
    loginPasswordToggle.setAttribute('aria-expanded', String(open));
    loginPasswordToggle.textContent = open ? text('userCancelAction', '取消') : text('userEditAction', '修改');
  };

  const setManageOpen = (open) => {
    const { managePanel, manageToggle } = getElements();
    managePanel?.classList.toggle('hidden', !open);
    manageToggle?.setAttribute('aria-expanded', String(open));
  };

  const refreshAccountLinking = async () => {
    const user = getCurrentUser?.();
    const elements = getElements();
    if (!user?.username || !elements.emailStatus) return;
    const isCloudUser = user.authProvider === 'supabase';
    let providers = [];
    if (isCloudUser && isConfigured()) {
      const { data, error } = await getSupabase().auth.getUserIdentities();
      if (!error) providers = (data?.identities || []).map(identity => identity.provider);
    }
    const emailBound = providers.includes('email');
    const googleBound = providers.includes('google');
    const canChangeLoginPassword = isCloudUser && emailBound;
    setProviderStatus(elements.emailStatus, emailBound);
    setProviderStatus(elements.googleStatus, googleBound);
    if (elements.signinSummary) {
      elements.signinSummary.textContent = !isCloudUser
        ? text('localAccount', '本機帳號')
        : emailBound && googleBound
          ? text('userSignedInBoth', '以 Email 與 Google 登入')
          : googleBound
            ? text('userSignedInGoogle', '以 Google 登入')
            : text('userSignedInEmail', '以 Email 登入');
    }
    // A way not set up yet has a button instead of a status; the Email one opens the form for it.
    const canBindEmail = !emailBound && isConfigured();
    const canBindGoogle = !googleBound && isConfigured();
    elements.emailToggle?.classList.toggle('hidden', !canBindEmail);
    elements.emailStatus.classList.toggle('hidden', canBindEmail);
    elements.googleStatus.classList.toggle('hidden', canBindGoogle);
    if (!canBindEmail) setEmailFormOpen(false);
    // A signed-in account already has its Email: only the password is asked for.
    elements.emailInput.closest('.us-field')?.classList.toggle('hidden', isCloudUser);
    elements.emailInput.required = !isCloudUser;
    elements.googleButton.classList.toggle('hidden', !canBindGoogle);
    elements.loginPasswordRow?.classList.toggle('hidden', !canChangeLoginPassword);
    if (!canChangeLoginPassword) setLoginPasswordOpen(false);
    elements.loginPasswordUnavailable?.classList.toggle('hidden', !isCloudUser || canChangeLoginPassword);
    elements.emailButton.textContent = emailBindLabel();
    if (elements.emailToggle && elements.emailForm.classList.contains('hidden')) elements.emailToggle.textContent = text('bindEmail', '綁定 Email');
    elements.googleButton.textContent = text('bindGoogle', '綁定 Google');
    if (!isConfigured()) {
      setAccountMessage(text('cloudAccountUnavailable', '尚未連接 Supabase，無法綁定雲端帳號。'));
      return;
    }
  };

  const refreshSyncVaultControls = async () => {
    ensureSyncVaultSettings();
    await refreshAccountLinking();
    const user = getCurrentUser?.();
    const elements = getElements();
    if (!user?.username || !elements.section) return;
    const record = await readSyncVaultRecord(storage, user.username);
    const unlocked = isSyncVaultUnlocked(user.username);
    const isCloudUser = user.authProvider === 'supabase';
    const recoveryMode = isCloudUser && await isVerifiedRecoveryMode(user.username);
    // The line under it already says "local account" for a local one.
    const accountLabel = isCloudUser
      ? (user.email || user.displayName || user.username)
      : (user.displayName || user.username);
    elements.account.textContent = accountLabel;
    void userUid.refresh(user);
    if (elements.avatar) elements.avatar.textContent = Array.from(String(user.email || user.displayName || user.username).trim())[0]?.toUpperCase() || '?';
    elements.status.textContent = !isCloudUser
      ? text('cloudSyncUnavailableForLocal', '本機帳號尚未綁定，雲端同步不可用')
      : !record
      ? text('cloudSyncPasswordNotSet', '尚未設定同步密碼')
      : unlocked
        ? text('cloudSyncUnlocked', '保險庫已解鎖，可進行加密同步')
        : text('cloudSyncLockedDesc', '輸入同步密碼後，才能在裝置之間同步你的 API 金鑰。');
    // The state beside the title: a green dot when unlocked, amber when locked, grey when there is no password yet (nothing for a local account).
    if (elements.syncState) {
      const stateText = !record ? text('cloudSyncStateNotSet', '尚未設定') : unlocked ? text('cloudSyncStateUnlocked', '已解鎖') : text('cloudSyncStateLocked', '已鎖定');
      elements.syncState.querySelector('.us-state-text').textContent = stateText;
      elements.syncState.classList.toggle('hidden', !isCloudUser);
      elements.syncState.classList.toggle('is-on', Boolean(record) && unlocked);
      elements.syncState.classList.toggle('is-warn', Boolean(record) && !unlocked);
    }
    elements.cloudOnlyPanel.classList.toggle('hidden', isCloudUser);
    elements.createPanel.classList.toggle('hidden', !isCloudUser || Boolean(record) || recoveryMode);
    elements.unlockPanel.classList.toggle('hidden', !isCloudUser || !record || unlocked || recoveryMode);
    elements.recoveryPanel.classList.toggle('hidden', !recoveryMode);
    elements.unlockedPanel.classList.toggle('hidden', !isCloudUser || !record || !unlocked || recoveryMode);
    // "Manage sync password": there once a password exists, and it opens only while the vault is unlocked.
    const canManage = isCloudUser && Boolean(record) && !recoveryMode;
    elements.manageToggle?.classList.toggle('hidden', !canManage);
    elements.manageToggle?.classList.toggle('is-disabled', !unlocked);
    elements.manageToggle?.setAttribute('aria-disabled', String(!unlocked));
    if (elements.manageDesc) {
      elements.manageDesc.textContent = unlocked
        ? text('manageSyncPasswordDesc', '變更或清除同步密碼')
        : text('manageSyncPasswordLockedDesc', '變更或清除同步密碼，解鎖後才能使用');
    }
    if (!canManage || !unlocked) setManageOpen(false);
    if (isCloudUser && record && unlocked && !recoveryMode) syncNow.refresh();
    if (isCloudUser && record && !unlocked && !recoveryMode) await ensureRecoveryTurnstile();
  };

  const requireMatchingPasswords = (password, confirmation) => {
    if (password.length < syncVaultPolicy.minimumPasswordLength) {
      throw new Error(text('cloudSyncPasswordTooShort', '同步密碼至少需要 10 碼。'));
    }
    if (password !== confirmation) {
      throw new Error(text('cloudSyncPasswordMismatch', '兩次輸入的同步密碼不一致。'));
    }
  };

  const requireMatchingLoginPasswords = (password, confirmation) => {
    if (password.length < 8) {
      throw new Error(text('accountPasswordTooShort', '登入密碼至少需要 8 碼。'));
    }
    if (password !== confirmation) {
      throw new Error(text('accountPasswordMismatch', '兩次輸入的登入密碼不一致。'));
    }
  };

  const dispatchUnlocked = (username) => {
    window.dispatchEvent(new window.CustomEvent('astra:sync-vault-unlocked', { detail: { username } }));
  };

  const queueCloudSyncKind = async (kind) => {
    try {
      return await getService(SERVICES.workspaceSync)?.queueLocalChange(kind);
    } catch {
      return false;
    }
  };

  // The states and descriptions this page fills in from its data (Locked, Not set up...) are written again when the language changes.
  let languageListenerBound = false;
  const bindLanguageChange = () => {
    if (languageListenerBound) return;
    languageListenerBound = true;
    window.addEventListener('astra:language-changed', () => {
      if (!document.getElementById('user-section')?.dataset.syncVaultSettingsInitialized) return;
      // The show/hide button names what it does now (the shown ones offer to hide).
      document.querySelectorAll('#user-section [data-us-eye]').forEach((eye) => {
        const label = eye.getAttribute('aria-pressed') === 'true' ? text('userHidePassword', '') : text('userShowPassword', '');
        if (label) {
          eye.setAttribute('aria-label', label);
          eye.title = label;
        }
      });
      refreshSyncVaultControls().catch((error) => globalThis.console?.warn?.('The account page could not follow the language.', error));
    });
  };

  const bindEvents = () => {
    bindLanguageChange();
    const elements = getElements();
    syncNow.bind();
    userUid.bind();
    elements.emailToggle?.addEventListener('click', () => {
      setEmailFormOpen(elements.emailForm.classList.contains('hidden'));
    });
    elements.loginPasswordToggle?.addEventListener('click', () => {
      setLoginPasswordOpen(elements.loginPasswordPanel.classList.contains('hidden'));
    });
    elements.manageToggle?.addEventListener('click', () => {
      if (elements.manageToggle.getAttribute('aria-disabled') === 'true') return;
      setManageOpen(elements.managePanel.classList.contains('hidden'));
    });
    // The show/hide button of every password box.
    elements.section?.addEventListener('click', (event) => {
      const eye = event.target.closest?.('[data-us-eye]');
      const input = eye?.parentElement?.querySelector('input');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      const label = show ? text('userHidePassword', '隱藏密碼') : text('userShowPassword', '顯示密碼');
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', label);
      eye.title = label;
    });
    const ctx = {
      window, document, storage, getCurrentUser, showNotification, text, getSupabase, reloadPage, scheduleTimeout,
      isBusy: () => busy, setBusy, getAccountTurnstile: () => accountTurnstile, notifyError, setAccountMessage, authErrorText,
      requireMatchingPasswords, requireMatchingLoginPasswords, refreshAccountLinking, refreshSyncVaultControls, requestVaultRecovery,
      storeVaultRecovery, getRecoveryStorageKey, dispatchUnlocked, queueCloudSyncKind, setLoginPasswordOpen, setManageOpen
    };
    bindAccountLinkingActions(elements, ctx);
    bindSyncVaultActions(elements, ctx);
  };

  window.addEventListener('astra:cloud-vault', () => {
    refreshSyncVaultControls().catch(error => console.warn('Cloud sync password status refresh failed:', error));
  });

  return {
    ensureSyncVaultSettings,
    refreshSyncVaultControls
  };
}
