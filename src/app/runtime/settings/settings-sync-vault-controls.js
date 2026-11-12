import { createSyncNowControls } from './settings-sync-now-controls.js';
import { createUserUidControls } from './settings-user-uid-controls.js';
import { announceUser } from '../features/user-ready.js';
import { isSyncVaultUnlocked, readSyncVaultRecord, syncVaultPolicy } from '../../sync/sync-vault.js';
import { getSupabaseClient, isSupabaseConfigured } from '../../auth/supabase-client.js';
import { readEmailLogin } from '../../auth/email-login-state.js';
import { createTurnstileClient } from '../security/turnstile-client.js';
import { SERVICES, getService } from '../services.js';
import { buildUserSectionMarkup, getUserSectionElements } from './settings-user-section-markup.js';
import { mountSecurityPage, togglePasswordEye } from './settings-security-page.js';
import { createVaultRecoveryClient, getRecoveryStorageKey } from './settings-vault-recovery-client.js';
import { createAuthenticatorControls } from './settings-security-authenticator.js';
import { createPasskeyControls } from './settings-security-passkey.js';
import { createSecurityErrors } from './settings-security-errors.js';
import { createIdentityConfirmation } from './settings-identity-confirmation.js';
import { createSecurityNotifier } from './settings-security-notice.js';
import { createDevicesControls } from './settings-security-devices.js';
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
  passkeyApi,
  notifySecurity = createSecurityNotifier(),
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

    // The security page (passwords, recovery, authenticator app) comes right after.
    mountSecurityPage({ document, text, userNav: nav, userSection: section });
    Promise.resolve().then(loadStyles).catch((error) => globalThis.console?.warn?.('Loading the styles of the user page failed.', error));
    bindEvents();
  };

  const setBusy = (nextBusy) => {
    busy = nextBusy;
    const elements = getElements();
    for (const button of [elements.emailButton, elements.googleButton, elements.loginPasswordButton, elements.forgotLoginPasswordButton, elements.createButton, elements.unlockButton, elements.forgotButton, elements.recoveryButton, elements.startOverButton, elements.changeButton, elements.lockButton, elements.resetButton]) {
      if (button) button.disabled = nextBusy;
    }
  };

  const { authErrorText, notifyError } = createSecurityErrors({ text, showNotification });

  // `page`: 'user' (linking Email and Google) or 'security' (the passwords).
  const setAccountMessage = (message, type = 'info', page = 'user') => {
    const element = page === 'security' ? getElements().securityMessage : getElements().accountMessage;
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
    // The check has its own place in the card, so showing it moves nothing.
    const { turnstileSlot, turnstileHint, turnstileAnchor, forgotButton } = getElements();
    turnstileSlot?.classList.remove('hidden');
    turnstileHint?.classList.remove('hidden');
    await accountTurnstile.mount('sync-vault-recovery', turnstileAnchor || forgotButton);
    recoveryTurnstileMounted = true;
  };

  const { request: requestVaultRecovery, store: storeVaultRecovery, isVerifiedMode: isVerifiedRecoveryMode } = createVaultRecoveryClient({ window, storage, getSupabase: () => getSupabase(), text });

  const authenticator = createAuthenticatorControls({ document, window, getSupabase: () => getSupabase(), getCurrentUser, getElements, text, showNotification, notifyError, notifySecurity });
  // The passkeys ask the person to confirm through the same function the other actions use, which asks them (the passkeys) in turn.
  const identity = {};
  const passkeys = createPasskeyControls({ document, window, storage, getSupabase: () => getSupabase(), getCurrentUser, getElements, text, showNotification, notifyError, confirmIdentity: (options) => identity.confirm(options), notifySecurity, ...(passkeyApi && { passkey: passkeyApi }) });
  identity.confirm = createIdentityConfirmation({ authenticator, passkeys });
  const devices = createDevicesControls({ window, storage, reloadPage, scheduleTimeout, getSupabase: () => getSupabase(), getCurrentUser, getElements, text, showNotification, notifyError, notifySecurity });

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
    // The human check of a local account's Email is drawn when the form opens.
    if (open && getCurrentUser?.()?.authProvider !== 'supabase') void ensureAccountTurnstile().catch(() => {});
  };

  // The password settings are folded away until asked for.
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
    let emailBound = false;
    if (isCloudUser && isConfigured()) {
      // Email login is "has a password", not "has an Email identity": an account made with Google that set a password has none (auth/email-login-state.js).
      const state = await readEmailLogin(getSupabase());
      providers = state.providers;
      emailBound = state.emailLogin;
    }
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
    authenticator.bind();
    passkeys.bind();
    devices.bind();
    devices.refresh().catch(() => {});
    void authenticator.refresh();
    passkeys.refresh().catch((error) => globalThis.console?.warn?.('The passkey card could not be drawn.', error));
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
    announceUser(document, user);
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
    await passkeys.syncPanels({ recovery: recoveryMode, unlock: true });
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
      document.querySelectorAll('#user-section [data-us-eye], #security-section [data-us-eye]').forEach((eye) => {
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
    // The show/hide button of the password boxes.
    elements.section?.addEventListener('click', (event) => togglePasswordEye(event, text));
    elements.securitySection?.addEventListener('click', (event) => togglePasswordEye(event, text));
    const ctx = {
      window, document, storage, getCurrentUser, showNotification, text, getSupabase, reloadPage, scheduleTimeout,
      isBusy: () => busy, setBusy, getAccountTurnstile: () => accountTurnstile, notifyError, setAccountMessage, authErrorText,
      requireMatchingPasswords, requireMatchingLoginPasswords, refreshAccountLinking, refreshSyncVaultControls, requestVaultRecovery,
      storeVaultRecovery, getRecoveryStorageKey, confirmIdentity: identity.confirm, notifySecurity, passkeys, dispatchUnlocked, queueCloudSyncKind, setLoginPasswordOpen, setManageOpen
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
