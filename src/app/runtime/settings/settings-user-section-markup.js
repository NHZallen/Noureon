// The user page of the settings (settings-sync-vault-controls.js): its markup (the account, the sign-in methods, the sync password) and
// the lookup of its elements.

import { syncVaultPolicy } from '../../sync/sync-vault.js';
import { syncNowMarkup } from './settings-sync-now-controls.js';
import { userUidMarkup } from './settings-user-uid-controls.js';

export const getUserSectionElements = (document) => ({
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

/** The markup of the page in the language in use (`text` gives a word and its fallback). */
export function buildUserSectionMarkup(text) {
  const ICONS = {
    mail: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>',
    key: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M16 7l2.5 2.5M14 9l2 2"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6.3 8.6 4.8 4.8 0 0 0 7 19z"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    // Hidden (dots): the eye with a slash. Shown (text): the open eye. The button's aria-pressed picks which one is drawn (user-settings.css).
    eyeOff: '<svg class="us-eye-off" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="m3 3 18 18"/></svg>',
    eye: '<svg class="us-eye-on" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  };

  const eyeButton = () => {
    const label = text('userShowPassword', '顯示密碼');
    return `<button type="button" class="us-eye" data-us-eye aria-pressed="false" title="${label}" aria-label="${label}" data-lang-key-title="userShowPassword" data-lang-key-aria="userShowPassword">${ICONS.eyeOff}${ICONS.eye}</button>`;
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

  const markup = () => {
    const minimum = syncVaultPolicy.minimumPasswordLength;
    return `
      <div class="us">
        <div class="us-identity">
          <div class="us-avatar-wrap">
            <div id="user-avatar" class="us-avatar" aria-hidden="true"></div>
            <button id="user-avatar-edit" type="button" class="us-avatar-edit" aria-haspopup="menu" aria-expanded="false" hidden>${ICONS.pencil}</button>
            <div id="user-avatar-menu" class="us-avatar-menu" role="menu" hidden>
              <button type="button" role="menuitem" data-avatar-action="change"></button>
              <button type="button" role="menuitem" data-avatar-action="reset"></button>
            </div>
            <input id="user-avatar-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          </div>
          <div class="min-w-0">
            <p id="sync-vault-account" class="us-email"></p>
            <div class="us-tags">
              <span id="user-signin-summary" class="us-chip"></span>${userUidMarkup(text('userUidCopy', '複製 UID'))}
            </div>
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
  return markup();
}
