import { createSyncNowControls, syncNowMarkup } from './settings-sync-now-controls.js';
import {
  cancelSyncVaultRotation,
  changeSyncVaultPassword,
  createAndUnlockSyncVault,
  getSyncVaultStorageKey,
  isSyncVaultUnlocked,
  lockSyncVault,
  readSyncVaultRecord,
  removeSyncVault,
  syncVaultPolicy,
  unlockSyncVault
} from '../../sync/sync-vault.js';
import { getSupabaseClient, isSupabaseConfigured } from '../../auth/supabase-client.js';
import {
  clearPendingCloudAccountLink,
  completePendingCloudAccountLink,
  markPendingCloudAccountLink
} from '../../auth/account-linking.js';
import { createCloudUserRecord } from '../../auth/supabase-auth-bridge.js';
import { openPasswordRecovery } from '../../auth/password-recovery-route.js';
import { createTurnstileClient } from '../security/turnstile-client.js';

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
  let accountTurnstile;
  let accountTurnstileMounted = false;
  let recoveryTurnstileMounted = false;

  const getElements = () => ({
    nav: document.getElementById('user-section-nav'),
    section: document.getElementById('user-section'),
    emailStatus: document.getElementById('account-email-status'),
    googleStatus: document.getElementById('account-google-status'),
    emailForm: document.getElementById('account-email-link-form'),
    emailToggle: document.getElementById('account-email-link-toggle'),
    emailInput: document.getElementById('account-link-email'),
    emailPassword: document.getElementById('account-link-password'),
    emailConfirmation: document.getElementById('account-link-password-confirmation'),
    emailButton: document.getElementById('account-email-link-btn'),
    googleButton: document.getElementById('account-google-link-btn'),
    loginPasswordPanel: document.getElementById('login-password-panel'),
    loginPasswordUnavailable: document.getElementById('login-password-unavailable'),
    loginCurrentPassword: document.getElementById('login-current-password'),
    loginNewPassword: document.getElementById('login-new-password'),
    loginConfirmation: document.getElementById('login-new-password-confirmation'),
    loginPasswordButton: document.getElementById('login-password-change-btn'),
    forgotLoginPasswordButton: document.getElementById('login-password-forgot-btn'),
    loginPasswordRow: document.getElementById('login-password-row'),
    loginPasswordToggle: document.getElementById('login-password-toggle'),
    loginSignOutAll: document.getElementById('login-password-signout-all'),
    accountMessage: document.getElementById('account-link-message'),
    avatar: document.getElementById('user-avatar'),
    signinSummary: document.getElementById('user-signin-summary'),
    syncState: document.getElementById('sync-vault-state'),
    turnstileSlot: document.getElementById('sync-vault-turnstile-slot'),
    turnstileAnchor: document.getElementById('sync-vault-turnstile-anchor'),
    turnstileHint: document.getElementById('sync-vault-turnstile-hint'),
    manageToggle: document.getElementById('sync-vault-manage-toggle'),
    manageDesc: document.getElementById('sync-vault-manage-desc'),
    managePanel: document.getElementById('sync-vault-manage-panel'),
    account: document.getElementById('sync-vault-account'),
    status: document.getElementById('sync-vault-status'),
    cloudOnlyPanel: document.getElementById('sync-vault-cloud-only-panel'),
    createPanel: document.getElementById('sync-vault-create-panel'),
    unlockPanel: document.getElementById('sync-vault-unlock-panel'),
    unlockedPanel: document.getElementById('sync-vault-unlocked-panel'),
    createPassword: document.getElementById('sync-vault-create-password'),
    createConfirmation: document.getElementById('sync-vault-create-confirmation'),
    unlockPassword: document.getElementById('sync-vault-unlock-password'),
    currentPassword: document.getElementById('sync-vault-current-password'),
    nextPassword: document.getElementById('sync-vault-next-password'),
    nextConfirmation: document.getElementById('sync-vault-next-confirmation'),
    createButton: document.getElementById('sync-vault-create-btn'),
    unlockButton: document.getElementById('sync-vault-unlock-btn'),
    forgotButton: document.getElementById('sync-vault-forgot-btn'),
    recoveryPanel: document.getElementById('sync-vault-recovery-panel'),
    recoveryPassword: document.getElementById('sync-vault-recovery-password'),
    recoveryConfirmation: document.getElementById('sync-vault-recovery-confirmation'),
    recoveryButton: document.getElementById('sync-vault-recovery-save-btn'),
    changeButton: document.getElementById('sync-vault-change-btn'),
    lockButton: document.getElementById('sync-vault-lock-btn'),
    resetButton: document.getElementById('sync-vault-reset-btn')
  });

  const ICONS = {
    mail: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>',
    key: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M16 7l2.5 2.5M14 9l2 2"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6.3 8.6 4.8 4.8 0 0 0 7 19z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    eye: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  const eyeButton = () => {
    const label = text('userShowPassword', '顯示密碼');
    return `<button type="button" class="us-eye" data-us-eye aria-pressed="false" title="${label}" aria-label="${label}">${ICONS.eye}</button>`;
  };

  /** A labelled password box with the show/hide button; `hint` is the small line under it. */
  const passwordField = ({ id, label, labelKey, autocomplete, minlength = 0, placeholder = '', placeholderKey = '', hint = '', hintKey = '' }) => `
      <div class="us-field">
        <label for="${id}" data-lang-key="${labelKey}">${label}</label>
        <div class="us-input">
          <input id="${id}" type="password" ${minlength ? `minlength="${minlength}"` : ''} autocomplete="${autocomplete}"${placeholderKey ? ` data-lang-key-placeholder="${placeholderKey}" placeholder="${placeholder}"` : ''}>
          ${eyeButton()}
        </div>
        ${hintKey ? `<p class="us-hint" data-lang-key="${hintKey}">${hint}</p>` : ''}
      </div>`;

  const statusMarkup = (id, extraClass = '') => `<span id="${id}" class="us-state${extraClass}"><i class="us-dot"></i><span class="us-state-text"></span></span>`;

  const buildUserSectionMarkup = () => {
    const minimum = syncVaultPolicy.minimumPasswordLength;
    return `
      <div class="us">
        <div class="us-identity">
          <div id="user-avatar" class="us-avatar" aria-hidden="true"></div>
          <div class="min-w-0">
            <p id="sync-vault-account" class="us-email"></p>
            <p id="user-signin-summary" class="us-sub"></p>
          </div>
        </div>

        <section class="us-card">
          <div class="us-head">
            <h3 data-lang-key="userSignInMethods">登入方式</h3>
            <p data-lang-key="accountLinkingDesc">綁定 Email、Google 其中一種即可使用雲端功能，也可以兩種都綁定。</p>
          </div>
          <div class="us-row">
            <span class="us-mark">${ICONS.mail}</span>
            <div class="us-row-text">
              <span class="us-row-title">Email</span>
              <span class="us-row-desc" data-lang-key="emailLoginProviderDesc">使用 Email 登入。</span>
            </div>
            ${statusMarkup('account-email-status')}
            <button id="account-email-link-toggle" type="button" class="us-btn hidden" aria-expanded="false" aria-controls="account-email-link-form">綁定 Email</button>
          </div>
          <form id="account-email-link-form" class="us-form hidden">
            <div class="us-field">
              <label for="account-link-email" data-lang-key="emailAddress">Email 地址</label>
              <div class="us-input"><input id="account-link-email" type="email" autocomplete="email"></div>
            </div>
            <div class="us-pair">
              ${passwordField({ id: 'account-link-password', label: '登入密碼（至少 8 碼）', labelKey: 'accountPassword', autocomplete: 'new-password', minlength: 8 })}
              ${passwordField({ id: 'account-link-password-confirmation', label: '再次輸入登入密碼', labelKey: 'accountPasswordConfirm', autocomplete: 'new-password', minlength: 8 })}
            </div>
            <div class="us-actions"><button id="account-email-link-btn" type="submit" class="us-btn is-primary" data-lang-key="bindEmail">綁定 Email</button></div>
          </form>
          <div class="us-row">
            <span class="us-mark"><img src="/google-g-logo.png" width="18" height="18" alt="" aria-hidden="true"></span>
            <div class="us-row-text">
              <span class="us-row-title">Google</span>
              <span class="us-row-desc" data-lang-key="googleLoginProviderDesc">使用 Google 帳號登入 Noureon。</span>
            </div>
            ${statusMarkup('account-google-status')}
            <button id="account-google-link-btn" type="button" class="us-btn hidden" data-lang-key="bindGoogle">綁定 Google</button>
          </div>
          <div id="login-password-row" class="us-row hidden">
            <span class="us-mark">${ICONS.key}</span>
            <div class="us-row-text">
              <span class="us-row-title" data-lang-key="loginPasswordRowTitle">登入密碼</span>
              <span class="us-row-desc" data-lang-key="loginPasswordRowDesc">用來登入你的帳號</span>
            </div>
            <button id="login-password-toggle" type="button" class="us-btn" aria-expanded="false" aria-controls="login-password-panel" data-lang-key="userEditAction">修改</button>
          </div>
          <div id="login-password-unavailable" class="us-note hidden" data-lang-key="loginPasswordUnavailable">目前沒有 Email 登入密碼。綁定 Email 後即可在這裡更新密碼。</div>
          <div id="login-password-panel" class="hidden">
            <div class="us-panel">
              ${passwordField({ id: 'login-current-password', label: '目前登入密碼', labelKey: 'currentLoginPassword', autocomplete: 'current-password', minlength: 8 })}
              <div class="us-pair">
                ${passwordField({ id: 'login-new-password', label: '新密碼', labelKey: 'newLoginPasswordLabel', autocomplete: 'new-password', minlength: 8, hint: '至少 8 碼', hintKey: 'loginPasswordMinHint' })}
                ${passwordField({ id: 'login-new-password-confirmation', label: '再次輸入新密碼', labelKey: 'confirmNewLoginPasswordLabel', autocomplete: 'new-password', minlength: 8 })}
              </div>
              <label class="us-check">
                <input id="login-password-signout-all" type="checkbox" checked>
                <span><span data-lang-key="signOutEverywhere">更新後登出所有裝置（包含這一台）</span><small data-lang-key="signOutEverywhereHint">所有裝置都要重新登入。</small></span>
              </label>
              <p class="us-hint" data-lang-key="passwordChangedEmailNotice">密碼更新後，我們會寄一封通知信到你的 Email，信裡附重設連結。</p>
            </div>
            <div class="us-foot">
              <button id="login-password-forgot-btn" type="button" class="us-link" data-lang-key="forgotLoginPassword">忘記登入密碼</button>
              <button id="login-password-change-btn" type="button" class="us-btn is-primary is-block" data-lang-key="updateLoginPassword">更新登入密碼</button>
            </div>
          </div>
        </section>

        <section class="us-card">
          <div class="us-head">
            <div class="us-head-main">
              <span class="us-mark">${ICONS.cloud}</span>
              <div class="us-head-text">
                <div class="us-head-line">
                  <h3 data-lang-key="cloudSyncTitle">雲端同步</h3>
                  ${statusMarkup('sync-vault-state', ' hidden')}
                </div>
                <p id="sync-vault-status" class="us-desc"></p>
              </div>
            </div>
          </div>
          <div id="sync-vault-cloud-only-panel" class="us-note hidden" data-lang-key="cloudSyncRequiresCloudAccount">綁定 Email 或 Google 帳號後，才能設定同步密碼並使用雲端同步。</div>
          <div id="sync-vault-create-panel" class="hidden">
            <div class="us-panel">
              <div class="us-pair">
                ${passwordField({ id: 'sync-vault-create-password', label: '同步密碼', labelKey: 'cloudSyncPassword', autocomplete: 'new-password', minlength: minimum, placeholder: '至少 10 碼的同步密碼', placeholderKey: 'cloudSyncPasswordPlaceholder' })}
                ${passwordField({ id: 'sync-vault-create-confirmation', label: '再次輸入同步密碼', labelKey: 'cloudSyncPasswordConfirm', autocomplete: 'new-password', minlength: minimum })}
              </div>
            </div>
            <div class="us-foot is-end"><button id="sync-vault-create-btn" type="button" class="us-btn is-primary is-block" data-lang-key="createCloudSyncPassword">建立同步密碼</button></div>
          </div>
          <div id="sync-vault-unlock-panel" class="hidden">
            <div class="us-panel">
              ${passwordField({ id: 'sync-vault-unlock-password', label: '同步密碼', labelKey: 'cloudSyncPassword', autocomplete: 'current-password', minlength: minimum })}
              <div id="sync-vault-turnstile-slot" class="us-slot hidden"><span id="sync-vault-turnstile-anchor"></span></div>
              <p id="sync-vault-turnstile-hint" class="us-hint hidden" data-lang-key="turnstileForgotHint">忘記同步密碼時，需要先完成這個驗證。</p>
            </div>
            <div class="us-foot">
              <button id="sync-vault-forgot-btn" type="button" class="us-link" data-lang-key="forgotCloudSyncPassword">忘記同步密碼</button>
              <button id="sync-vault-unlock-btn" type="button" class="us-btn is-primary is-block" data-lang-key="unlockCloudSync">解鎖雲端同步</button>
            </div>
          </div>
          <div id="sync-vault-recovery-panel" class="hidden">
            <div class="us-panel">
              <p class="us-desc" data-lang-key="cloudSyncRecoveryWarning">Email 驗證成功後可建立新同步密碼，既有加密同步資料會保留。</p>
              <div class="us-pair">
                ${passwordField({ id: 'sync-vault-recovery-password', label: '新的同步密碼（至少 10 碼）', labelKey: 'newCloudSyncPassword', autocomplete: 'new-password', minlength: minimum })}
                ${passwordField({ id: 'sync-vault-recovery-confirmation', label: '再次輸入同步密碼', labelKey: 'cloudSyncPasswordConfirm', autocomplete: 'new-password', minlength: minimum })}
              </div>
            </div>
            <div class="us-foot is-end"><button id="sync-vault-recovery-save-btn" type="button" class="us-btn is-primary is-block" data-lang-key="confirmCloudSyncPasswordReset">重設同步密碼</button></div>
          </div>
          <div id="sync-vault-unlocked-panel" class="hidden">
            <div class="us-body">${syncNowMarkup()}</div>
            <div class="us-foot is-end"><button id="sync-vault-lock-btn" type="button" class="us-btn" data-lang-key="lockCloudSync">鎖定</button></div>
          </div>
          <button id="sync-vault-manage-toggle" type="button" class="us-row hidden is-disabled" aria-expanded="false" aria-controls="sync-vault-manage-panel" aria-disabled="true">
            <span class="us-row-text">
              <span class="us-row-title" data-lang-key="manageSyncPassword">管理同步密碼</span>
              <span id="sync-vault-manage-desc" class="us-row-desc"></span>
            </span>
            <span class="us-chevron">${ICONS.chevron}</span>
          </button>
          <div id="sync-vault-manage-panel" class="hidden">
            <div class="us-panel">
              ${passwordField({ id: 'sync-vault-current-password', label: '目前同步密碼', labelKey: 'currentCloudSyncPassword', autocomplete: 'current-password' })}
              <div class="us-pair">
                ${passwordField({ id: 'sync-vault-next-password', label: '新的同步密碼（至少 10 碼）', labelKey: 'newCloudSyncPassword', autocomplete: 'new-password', minlength: minimum })}
                ${passwordField({ id: 'sync-vault-next-confirmation', label: '再次輸入同步密碼', labelKey: 'cloudSyncPasswordConfirm', autocomplete: 'new-password', minlength: minimum })}
              </div>
            </div>
            <div class="us-foot">
              <button id="sync-vault-reset-btn" type="button" class="us-btn is-danger" data-lang-key="resetCloudSyncPassword">清除同步密碼</button>
              <button id="sync-vault-change-btn" type="button" class="us-btn is-primary is-block" data-lang-key="saveCloudSyncPassword">儲存新密碼</button>
            </div>
          </div>
        </section>
        <p class="us-footnote" data-lang-key="passwordKindsNote">登入密碼用來登入帳號；同步密碼用來加密你的 API 金鑰，只在你的裝置上使用，兩者不同。</p>
        <p id="account-link-message" class="us-message hidden"></p>
      </div>
    `;
  };

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
    section.innerHTML = buildUserSectionMarkup();
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

  const notifyError = (error) => {
    const incorrect = error?.message?.includes('Incorrect');
    showNotification(
      incorrect ? text('cloudSyncPasswordIncorrect', '同步密碼不正確。') : (error?.message || text('cloudSyncPasswordError', '同步密碼操作失敗。')),
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
      throw new Error(result.error || text('cloudSyncRecoveryFailed', '同步密碼復原服務失敗。'));
    }
    return result;
  };

  const storeVaultRecovery = (password, record) => requestVaultRecovery('store', { password, record });

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
      return await globalThis.__astraCloudWorkspaceSync?.queueLocalChange(kind);
    } catch {
      return false;
    }
  };

  const bindEvents = () => {
    const elements = getElements();
    syncNow.bind();
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
    elements.emailForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      const user = getCurrentUser();
      const isCloudUser = user.authProvider === 'supabase';
      const email = elements.emailInput.value.trim();
      const password = elements.emailPassword.value;
      try {
        if (password.length < 8) throw new Error(text('accountPasswordTooShort', '登入密碼至少需要 8 碼。'));
        if (password !== elements.emailConfirmation.value) throw new Error(text('accountPasswordMismatch', '兩次輸入的登入密碼不一致。'));
        setBusy(true);
        const supabase = getSupabase();
        if (isCloudUser) {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
          setAccountMessage(text('emailLoginEnabled', 'Email 登入密碼已設定。'));
          elements.emailPassword.value = '';
          elements.emailConfirmation.value = '';
          await refreshAccountLinking();
          return;
        }
        if (!email) throw new Error(text('emailRequired', '請輸入 Email。'));
        const captchaToken = accountTurnstile?.getToken('account-email-link');
        if (accountTurnstile?.enabled && !captchaToken) throw new Error(text('turnstileRequired', '請先完成人機驗證。'));
        await markPendingCloudAccountLink(storage, user);
        let result = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: captchaToken || undefined }
        });
        if (result.error) {
          result = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
              captchaToken: captchaToken || undefined
            }
          });
        }
        accountTurnstile?.reset('account-email-link');
        if (result.error) {
          await clearPendingCloudAccountLink(storage);
          throw result.error;
        }
        if (result.data.session?.user) {
          await completePendingCloudAccountLink({
            storage,
            cloudUserRecord: createCloudUserRecord(result.data.session.user)
          });
          window.location.reload();
          return;
        }
        setAccountMessage(text('confirmEmailToBind', '驗證信已寄出；完成 Email 驗證後會自動綁定本機資料。'));
      } catch (error) {
        setAccountMessage(error?.message || text('accountLinkFailed', '帳號綁定失敗。'), 'error');
      } finally {
        setBusy(false);
      }
    });
    elements.googleButton.addEventListener('click', async () => {
      if (busy) return;
      const user = getCurrentUser();
      try {
        setBusy(true);
        const supabase = getSupabase();
        if (user.authProvider === 'supabase') {
          const { error } = await supabase.auth.linkIdentity({
            provider: 'google',
            options: { redirectTo: window.location.origin }
          });
          if (error) throw error;
          return;
        }
        await markPendingCloudAccountLink(storage, user);
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin }
        });
        if (error) {
          await clearPendingCloudAccountLink(storage);
          throw error;
        }
      } catch (error) {
        setBusy(false);
        setAccountMessage(error?.message || text('accountLinkFailed', '帳號綁定失敗。'), 'error');
      }
    });
    elements.loginPasswordButton?.addEventListener('click', async () => {
      if (busy) return;
      try {
        const user = getCurrentUser();
        if (user.authProvider !== 'supabase') {
          throw new Error(text('cloudSyncRequiresCloudAccount', '請先綁定 Email 或 Google 帳號。'));
        }
        const currentPassword = elements.loginCurrentPassword.value;
        const nextPassword = elements.loginNewPassword.value;
        requireMatchingLoginPasswords(nextPassword, elements.loginConfirmation.value);
        if (!currentPassword) {
          throw new Error(text('currentLoginPasswordRequired', '請輸入目前登入密碼。'));
        }
        setBusy(true);
        const supabase = getSupabase();
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const email = data.user?.email || user.email;
        if (!email) throw new Error(text('recoveryEmailUnavailable', '此帳號沒有可用的 Email。'));
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
        if (signInError) throw signInError;
        const { error } = await supabase.auth.updateUser({ password: nextPassword });
        if (error) throw error;
        elements.loginCurrentPassword.value = '';
        elements.loginNewPassword.value = '';
        elements.loginConfirmation.value = '';
        if (!elements.loginSignOutAll?.checked) {
          setAccountMessage(text('loginPasswordChanged', '登入密碼已更新。'));
          setLoginPasswordOpen(false);
          return;
        }
        // Every device is signed out, this one too: the page loads again and asks for the new password.
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
        if (signOutError) {
          setAccountMessage(text('loginPasswordSignOutFailed', '登入密碼已更新，但登出其他裝置失敗，請稍後到其他裝置手動登出。'), 'error');
          return;
        }
        await storage.removeItem('chat_lastUser');
        setAccountMessage(text('loginPasswordChangedSignedOut', '登入密碼已更新，所有裝置已登出。'));
        scheduleTimeout(reloadPage, 1500);
      } catch (error) {
        setAccountMessage(error?.message || text('loginPasswordChangeFailed', '登入密碼更新失敗。'), 'error');
      } finally {
        setBusy(false);
      }
    });
    elements.forgotLoginPasswordButton?.addEventListener('click', () => {
      const user = getCurrentUser();
      openPasswordRecovery(window, {
        email: user?.email || '',
        language: document.documentElement.lang
      });
    });
    elements.createButton.addEventListener('click', async () => {
      if (busy) return;
      try {
        const user = getCurrentUser();
        if (user.authProvider !== 'supabase') throw new Error(text('cloudSyncRequiresCloudAccount', '請先綁定 Email 或 Google 帳號。'));
        requireMatchingPasswords(elements.createPassword.value, elements.createConfirmation.value);
        setBusy(true);
        const record = await createAndUnlockSyncVault({ storage, username: user.username, password: elements.createPassword.value });
        try {
          await storeVaultRecovery(elements.createPassword.value, record);
        } catch (error) {
          await removeSyncVault({ storage, username: user.username });
          throw error;
        }
        elements.createPassword.value = '';
        elements.createConfirmation.value = '';
        dispatchUnlocked(user.username);
        showNotification(text('cloudSyncPasswordCreated', '同步密碼已建立，保險庫已解鎖。'));
        await refreshSyncVaultControls();
      } catch (error) {
        notifyError(error);
      } finally {
        setBusy(false);
      }
    });
    elements.unlockButton.addEventListener('click', async () => {
      if (busy) return;
      try {
        const user = getCurrentUser();
        setBusy(true);
        await unlockSyncVault({ storage, username: user.username, password: elements.unlockPassword.value });
        elements.unlockPassword.value = '';
        dispatchUnlocked(user.username);
        showNotification(text('cloudSyncUnlockedNotice', '雲端同步已解鎖。'));
        await refreshSyncVaultControls();
      } catch (error) {
        notifyError(error);
      } finally {
        setBusy(false);
      }
    });
    elements.forgotButton.addEventListener('click', async () => {
      if (busy) return;
      const user = getCurrentUser();
      try {
        setBusy(true);
        const supabase = getSupabase();
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const email = data.user?.email;
        if (!email) throw new Error(text('recoveryEmailUnavailable', '此帳號沒有可用的 Email。'));
        const captchaToken = accountTurnstile?.getToken('sync-vault-recovery');
        if (accountTurnstile?.enabled && !captchaToken) throw new Error(text('turnstileRequired', '請先完成人機驗證。'));
        const recoveryState = window.crypto.randomUUID();
        await storage.setItem(getRecoveryStorageKey(user.username), recoveryState);
        const recoveryUrl = new URL(window.location.href);
        recoveryUrl.searchParams.set('vault_recovery', recoveryState);
        recoveryUrl.hash = '';
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: recoveryUrl.toString(),
            shouldCreateUser: false,
            captchaToken: captchaToken || undefined
          }
        });
        accountTurnstile?.reset('sync-vault-recovery');
        if (error) throw error;
        setAccountMessage(text('cloudSyncRecoveryEmailSent', '重設驗證信已寄出，請從信件連結返回。'));
      } catch (error) {
        setAccountMessage(error?.message || text('cloudSyncRecoveryFailed', '無法寄出重設驗證信。'), 'error');
      } finally {
        setBusy(false);
      }
    });
    elements.recoveryButton.addEventListener('click', async () => {
      if (busy) return;
      const user = getCurrentUser();
      try {
        requireMatchingPasswords(elements.recoveryPassword.value, elements.recoveryConfirmation.value);
        setBusy(true);
        const recovered = await requestVaultRecovery('recover');
        await queueCloudSyncKind('vault');
        await storage.setItem(getSyncVaultStorageKey(user.username), JSON.stringify(recovered.record));
        await queueCloudSyncKind('vault');
        const nextRecord = await changeSyncVaultPassword({
          storage,
          username: user.username,
          currentPassword: recovered.password,
          nextPassword: elements.recoveryPassword.value
        });
        try {
          await storeVaultRecovery(elements.recoveryPassword.value, nextRecord);
        } catch (error) {
          await queueCloudSyncKind('vault');
          await storage.setItem(getSyncVaultStorageKey(user.username), JSON.stringify(recovered.record));
          await unlockSyncVault({ storage, username: user.username, password: recovered.password });
          await cancelSyncVaultRotation({ storage, username: user.username });
          await queueCloudSyncKind('sensitive');
          await queueCloudSyncKind('vault');
          throw error;
        }
        await storage.removeItem(getRecoveryStorageKey(user.username));
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('vault_recovery');
        window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        elements.recoveryPassword.value = '';
        elements.recoveryConfirmation.value = '';
        dispatchUnlocked(user.username);
        showNotification(text('cloudSyncPasswordReset', '同步密碼已重設，既有加密同步資料仍可繼續使用。'));
        await refreshSyncVaultControls();
      } catch (error) {
        notifyError(error);
      } finally {
        setBusy(false);
      }
    });
    elements.lockButton.addEventListener('click', async () => {
      const user = getCurrentUser();
      lockSyncVault(user.username);
      await refreshSyncVaultControls();
    });
    elements.changeButton.addEventListener('click', async () => {
      if (busy) return;
      try {
        const user = getCurrentUser();
        requireMatchingPasswords(elements.nextPassword.value, elements.nextConfirmation.value);
        setBusy(true);
        const previousRecord = await readSyncVaultRecord(storage, user.username);
        const nextRecord = await changeSyncVaultPassword({
          storage,
          username: user.username,
          currentPassword: elements.currentPassword.value,
          nextPassword: elements.nextPassword.value
        });
        try {
          await storeVaultRecovery(elements.nextPassword.value, nextRecord);
        } catch (error) {
          await queueCloudSyncKind('vault');
          await storage.setItem(getSyncVaultStorageKey(user.username), JSON.stringify(previousRecord));
          await unlockSyncVault({ storage, username: user.username, password: elements.currentPassword.value });
          await cancelSyncVaultRotation({ storage, username: user.username });
          await queueCloudSyncKind('sensitive');
          await queueCloudSyncKind('vault');
          throw error;
        }
        elements.currentPassword.value = '';
        elements.nextPassword.value = '';
        elements.nextConfirmation.value = '';
        dispatchUnlocked(user.username);
        showNotification(text('cloudSyncPasswordChanged', '同步密碼已變更。'));
        setManageOpen(false);
        await refreshSyncVaultControls();
      } catch (error) {
        notifyError(error);
      } finally {
        setBusy(false);
      }
    });
    elements.resetButton.addEventListener('click', async () => {
      if (!window.confirm(text('cloudSyncPasswordResetConfirm', '清除同步密碼後，既有加密資料將無法解密。確定要繼續嗎？'))) return;
      const user = getCurrentUser();
      try {
        await requestVaultRecovery('delete');
      } catch (error) {
        notifyError(error);
        return;
      }
      await removeSyncVault({ storage, username: user.username });
      await queueCloudSyncKind('vault');
      await queueCloudSyncKind('sensitive');
      showNotification(text('cloudSyncPasswordRemoved', '同步密碼已清除。'));
      await refreshSyncVaultControls();
    });
  };

  window.addEventListener('astra:cloud-vault', () => {
    refreshSyncVaultControls().catch(error => console.warn('Cloud sync password status refresh failed:', error));
  });

  return {
    ensureSyncVaultSettings,
    refreshSyncVaultControls
  };
}
