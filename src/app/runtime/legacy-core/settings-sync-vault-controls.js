import {
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
import { openPasswordRecovery } from '../../auth/password-recovery-page.js';
import { createTurnstileClient } from '../security/turnstile-client.js';
import {
  decryptSyncVaultRecovery,
  encryptSyncVaultRecovery,
  generateSyncVaultRecoveryCode
} from '../../sync/sync-vault-recovery-code.js';

export function createSettingsSyncVaultControls({
  window,
  document,
  storage,
  getCurrentUser,
  getText,
  showNotification
} = {}) {
  const text = (key, fallback) => getText?.(key, fallback) || fallback;
  let busy = false;
  let accountTurnstile;
  let accountTurnstileMounted = false;
  let recoveryTurnstileMounted = false;

  const getElements = () => ({
    nav: document.getElementById('user-section-nav'),
    section: document.getElementById('user-section'),
    emailStatus: document.getElementById('account-email-status'),
    googleStatus: document.getElementById('account-google-status'),
    emailForm: document.getElementById('account-email-link-form'),
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
    accountMessage: document.getElementById('account-link-message'),
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
    recoveryCode: document.getElementById('sync-vault-recovery-code'),
    recoveryPassword: document.getElementById('sync-vault-recovery-password'),
    recoveryConfirmation: document.getElementById('sync-vault-recovery-confirmation'),
    recoveryButton: document.getElementById('sync-vault-recovery-save-btn'),
    recoverySetupButton: document.getElementById('sync-vault-recovery-setup-btn'),
    recoverySetupPanel: document.getElementById('sync-vault-recovery-setup-panel'),
    recoverySetupCode: document.getElementById('sync-vault-recovery-setup-code'),
    recoverySetupPassword: document.getElementById('sync-vault-recovery-setup-password'),
    recoverySetupSaved: document.getElementById('sync-vault-recovery-setup-saved'),
    recoverySetupConfirm: document.getElementById('sync-vault-recovery-setup-confirm'),
    changeButton: document.getElementById('sync-vault-change-btn'),
    lockButton: document.getElementById('sync-vault-lock-btn'),
    resetButton: document.getElementById('sync-vault-reset-btn')
  });

  const buildUserSectionMarkup = () => `
      <div class="max-w-3xl">
        <div class="pb-6">
          <h3 class="text-lg font-semibold" data-lang-key="accountLinking">帳號綁定</h3>
          <p class="mt-2 text-sm text-[var(--text-secondary)]" data-lang-key="accountLinkingDesc">綁定 Email、Google 其中一種即可使用雲端功能，也可以兩種都綁定。</p>
        </div>

        <div class="border-t border-[var(--border-color)]">
          <div class="flex items-center justify-between gap-4 py-4 border-b border-[var(--border-color)]">
            <div class="flex items-center gap-3 min-w-0">
              <span class="shrink-0 text-[var(--text-secondary)]" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect>
                  <path d="m4 7 8 6 8-6"></path>
                </svg>
              </span>
              <div class="min-w-0">
                <p class="font-medium">Email</p>
                <p class="text-xs text-[var(--text-secondary)]" data-lang-key="emailLoginProviderDesc">使用 Email 登入與收取驗證信。</p>
              </div>
            </div>
            <span id="account-email-status" class="text-sm text-[var(--text-secondary)] whitespace-nowrap"></span>
          </div>
          <form id="account-email-link-form" class="hidden py-4 border-b border-[var(--border-color)] space-y-3">
            <input id="account-link-email" type="email" autocomplete="email" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="emailAddress" placeholder="Email 地址">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input id="account-link-password" type="password" minlength="8" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="accountPassword" placeholder="登入密碼（至少 8 碼）">
              <input id="account-link-password-confirmation" type="password" minlength="8" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="accountPasswordConfirm" placeholder="再次輸入登入密碼">
            </div>
            <button id="account-email-link-btn" type="submit" class="px-4 py-2 rounded-md btn-primary" data-lang-key="bindEmail">綁定 Email</button>
          </form>

          <div class="flex items-center justify-between gap-4 py-4 border-b border-[var(--border-color)]">
            <div class="flex items-center gap-3 min-w-0">
              <img src="/google-g-logo.png" width="22" height="22" alt="" aria-hidden="true" class="shrink-0 object-contain">
              <div class="min-w-0">
                <p class="font-medium">Google</p>
                <p class="text-xs text-[var(--text-secondary)]" data-lang-key="googleLoginProviderDesc">使用 Google 帳號登入 Noureon。</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span id="account-google-status" class="text-sm text-[var(--text-secondary)] whitespace-nowrap"></span>
              <button id="account-google-link-btn" type="button" class="hidden px-4 py-2 rounded-md border border-[var(--border-color)] bg-transparent hover:bg-[var(--hover-bg)]" data-lang-key="bindGoogle">綁定 Google</button>
            </div>
          </div>
        </div>

        <div class="pt-8 pb-6">
          <h3 class="text-lg font-semibold" data-lang-key="loginPasswordTitle">修改登入密碼</h3>
          <p class="mt-2 text-sm text-[var(--text-secondary)]" data-lang-key="loginPasswordDesc">Email 登入使用者可以用目前密碼更新新密碼；忘記密碼時會寄送重設信。</p>
        </div>
        <div id="login-password-unavailable" class="hidden border-t border-[var(--border-color)] py-4 text-sm text-[var(--text-secondary)]" data-lang-key="loginPasswordUnavailable">目前沒有 Email 登入密碼。綁定 Email 後即可在這裡更新密碼。</div>
        <div id="login-password-panel" class="hidden border-t border-[var(--border-color)] py-4 space-y-3">
          <input id="login-current-password" type="password" minlength="8" autocomplete="current-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="currentLoginPassword" placeholder="目前登入密碼">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input id="login-new-password" type="password" minlength="8" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="newLoginPassword" placeholder="新的登入密碼（至少 8 碼）">
            <input id="login-new-password-confirmation" type="password" minlength="8" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="accountPasswordConfirm" placeholder="再次輸入登入密碼">
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button id="login-password-change-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="updateLoginPassword">更新登入密碼</button>
            <button id="login-password-forgot-btn" type="button" class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline" data-lang-key="forgotLoginPassword">忘記登入密碼</button>
          </div>
        </div>

        <p id="account-link-message" class="hidden mt-4 text-sm text-[var(--text-secondary)]"></p>

        <div class="pt-10 pb-6">
          <h3 class="text-lg font-semibold" data-lang-key="cloudSyncVault">雲端同步保險庫</h3>
          <p class="mt-2 text-sm text-[var(--text-secondary)]" data-lang-key="cloudSyncVaultDesc">同步密碼只在裝置上使用；復原資料由瀏覽器以使用者持有的 Recovery Code 加密。</p>
        </div>

        <div class="border-t border-[var(--border-color)]">
          <div class="py-4 border-b border-[var(--border-color)]">
            <p id="sync-vault-account" class="text-sm font-medium"></p>
            <p id="sync-vault-status" class="text-sm text-[var(--text-secondary)] mt-1"></p>
          </div>
          <div id="sync-vault-cloud-only-panel" class="hidden py-4 border-b border-[var(--border-color)] text-[var(--text-secondary)] text-sm" data-lang-key="cloudSyncRequiresCloudAccount">綁定 Email 或 Google 帳號後，才能設定同步密碼並使用雲端同步。</div>
          <div id="sync-vault-create-panel" class="hidden py-4 border-b border-[var(--border-color)] space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input id="sync-vault-create-password" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordPlaceholder" placeholder="至少 10 碼的同步密碼">
              <input id="sync-vault-create-confirmation" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordConfirm" placeholder="再次輸入同步密碼">
            </div>
            <button id="sync-vault-create-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="createCloudSyncPassword">建立同步密碼</button>
          </div>
          <div id="sync-vault-unlock-panel" class="hidden py-4 border-b border-[var(--border-color)] space-y-3">
            <input id="sync-vault-unlock-password" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="current-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPassword" placeholder="同步密碼">
            <div class="flex flex-wrap items-center gap-3">
              <button id="sync-vault-unlock-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="unlockCloudSync">解鎖雲端同步</button>
              <button id="sync-vault-forgot-btn" type="button" class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline" data-lang-key="forgotCloudSyncPassword">忘記同步密碼</button>
            </div>
          </div>
          <div id="sync-vault-recovery-panel" class="hidden py-4 border-b border-[var(--border-color)] space-y-3">
            <p class="text-sm text-[var(--text-secondary)]">Email 驗證完成後，仍必須輸入你保存的 Recovery Code 才能重設同步密碼。</p>
            <input id="sync-vault-recovery-code" type="password" autocomplete="off" spellcheck="false" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="Recovery Code（NR2-…）">
            <p class="text-sm text-[var(--text-secondary)]" data-lang-key="cloudSyncRecoveryWarning">Email 驗證成功後可建立新同步密碼，既有加密同步資料會保留。</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input id="sync-vault-recovery-password" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="newCloudSyncPassword" placeholder="新的同步密碼（至少 10 碼）">
              <input id="sync-vault-recovery-confirmation" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordConfirm" placeholder="再次輸入同步密碼">
            </div>
            <button id="sync-vault-recovery-save-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="confirmCloudSyncPasswordReset">重設同步密碼</button>
          </div>
          <div id="sync-vault-unlocked-panel" class="hidden py-4 space-y-4">
            <div class="flex flex-wrap gap-2">
              <button id="sync-vault-lock-btn" type="button" class="px-4 py-2 rounded-md bg-[var(--hover-bg)]" data-lang-key="lockCloudSync">鎖定</button>
              <button id="sync-vault-reset-btn" type="button" class="px-4 py-2 rounded-md text-red-600 bg-transparent hover:bg-red-50" data-lang-key="resetCloudSyncPassword">清除同步密碼</button>
            </div>
            <div class="border-t border-[var(--border-color)] pt-4 space-y-3">
              <h4 class="font-medium">Recovery Code</h4>
              <p class="text-sm text-[var(--text-secondary)]">選擇啟用後會產生只有你持有的代碼。Noureon 伺服器無法替你取回此代碼。</p>
              <button id="sync-vault-recovery-setup-btn" type="button" class="px-4 py-2 rounded-md bg-[var(--hover-bg)]">建立新的 Recovery Code</button>
              <div id="sync-vault-recovery-setup-panel" class="hidden space-y-3">
                <input id="sync-vault-recovery-setup-code" type="text" readonly spellcheck="false" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)] font-mono text-sm">
                <input id="sync-vault-recovery-setup-password" type="password" autocomplete="current-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="目前的同步密碼">
                <label class="flex items-start gap-2 text-sm"><input id="sync-vault-recovery-setup-saved" type="checkbox" class="mt-1"><span>我已將 Recovery Code 安全保存；遺失同步密碼與此代碼時，資料將無法復原。</span></label>
                <button id="sync-vault-recovery-setup-confirm" type="button" class="px-4 py-2 rounded-md btn-primary">確認並啟用復原</button>
              </div>
            </div>
            <div class="border-t border-[var(--border-color)] pt-4 space-y-3">
              <h4 class="font-medium" data-lang-key="changeCloudSyncPassword">變更同步密碼</h4>
              <input id="sync-vault-current-password" type="password" autocomplete="current-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="currentCloudSyncPassword" placeholder="目前同步密碼">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input id="sync-vault-next-password" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="newCloudSyncPassword" placeholder="新的同步密碼（至少 10 碼）">
                <input id="sync-vault-next-confirmation" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordConfirm" placeholder="再次輸入同步密碼">
              </div>
              <button id="sync-vault-change-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="saveCloudSyncPassword">儲存新密碼</button>
            </div>
          </div>
        </div>
      </div>
    `;

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
    section.innerHTML = `
      <h3 class="text-lg font-semibold mb-3" data-lang-key="accountLinking">帳號綁定</h3>
      <div class="space-y-3 max-w-2xl mb-8">
        <p class="text-sm text-[var(--text-secondary)]" data-lang-key="accountLinkingDesc">綁定 Email、Google 其中一種即可使用雲端功能，也可以兩種都綁定。</p>
        <div class="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--input-field-bg)] space-y-3">
          <div class="flex items-center justify-between gap-3">
            <span class="font-medium">Email</span>
            <span id="account-email-status" class="text-sm text-[var(--text-secondary)]"></span>
          </div>
          <form id="account-email-link-form" class="hidden space-y-3">
            <input id="account-link-email" type="email" autocomplete="email" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--modal-bg)]" data-lang-key-placeholder="emailAddress" placeholder="Email">
            <input id="account-link-password" type="password" minlength="8" autocomplete="new-password" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--modal-bg)]" data-lang-key-placeholder="accountPassword" placeholder="登入密碼（至少 8 碼）">
            <input id="account-link-password-confirmation" type="password" minlength="8" autocomplete="new-password" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--modal-bg)]" data-lang-key-placeholder="accountPasswordConfirm" placeholder="再次輸入登入密碼">
            <button id="account-email-link-btn" type="submit" class="px-4 py-2 rounded-md btn-primary" data-lang-key="bindEmail">綁定 Email</button>
          </form>
        </div>
        <div class="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--input-field-bg)] space-y-3">
          <div class="flex items-center justify-between gap-3">
            <span class="font-medium">Google</span>
            <span id="account-google-status" class="text-sm text-[var(--text-secondary)]"></span>
          </div>
          <button id="account-google-link-btn" type="button" class="hidden px-4 py-2 rounded-md border border-[var(--border-color)] bg-[var(--modal-bg)]" data-lang-key="bindGoogle">綁定 Google</button>
        </div>
        <p id="account-link-message" class="hidden text-sm text-[var(--text-secondary)]"></p>
      </div>
      <h3 class="text-lg font-semibold mb-3" data-lang-key="cloudSyncVault">雲端同步保險庫</h3>
      <div class="space-y-4 max-w-2xl">
        <div class="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--input-field-bg)]">
          <p id="sync-vault-account" class="text-sm font-medium"></p>
          <p id="sync-vault-status" class="text-sm text-[var(--text-secondary)] mt-1"></p>
        </div>
        <p class="text-sm text-[var(--text-secondary)]" data-lang-key="cloudSyncVaultDesc">同步密碼只在您的裝置上用來加密 API 金鑰；密碼本身不會上傳或保存。</p>
        <div id="sync-vault-cloud-only-panel" class="hidden p-4 rounded-lg border border-[var(--border-color)] bg-[var(--input-field-bg)] text-[var(--text-secondary)] text-sm" data-lang-key="cloudSyncRequiresCloudAccount">綁定 Email 或 Google 帳號後，才能設定同步密碼並使用雲端同步。</div>
        <div id="sync-vault-create-panel" class="hidden space-y-3">
          <input id="sync-vault-create-password" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordPlaceholder" placeholder="至少 10 碼的同步密碼">
          <input id="sync-vault-create-confirmation" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordConfirm" placeholder="再次輸入同步密碼">
          <button id="sync-vault-create-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="createCloudSyncPassword">建立同步密碼</button>
        </div>
        <div id="sync-vault-unlock-panel" class="hidden space-y-3">
          <input id="sync-vault-unlock-password" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="current-password" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPassword" placeholder="同步密碼">
          <button id="sync-vault-unlock-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="unlockCloudSync">解鎖雲端同步</button>
          <button id="sync-vault-forgot-btn" type="button" class="block text-sm text-blue-600 hover:underline" data-lang-key="forgotCloudSyncPassword">忘記同步密碼</button>
        </div>
        <div id="sync-vault-recovery-panel" class="hidden space-y-3">
          <p class="text-sm text-[var(--text-secondary)]" data-lang-key="cloudSyncRecoveryWarning">Email 驗證成功後可建立新同步密碼，既有加密同步資料會保留。</p>
          <input id="sync-vault-recovery-password" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="newCloudSyncPassword" placeholder="新的同步密碼（至少 10 碼）">
          <input id="sync-vault-recovery-confirmation" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordConfirm" placeholder="再次輸入同步密碼">
          <button id="sync-vault-recovery-save-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="confirmCloudSyncPasswordReset">重設同步密碼</button>
        </div>
        <div id="sync-vault-unlocked-panel" class="hidden space-y-3">
          <div class="flex flex-wrap gap-2">
            <button id="sync-vault-lock-btn" type="button" class="px-4 py-2 rounded-md bg-[var(--hover-bg)]" data-lang-key="lockCloudSync">鎖定</button>
            <button id="sync-vault-reset-btn" type="button" class="px-4 py-2 rounded-md text-red-600 bg-red-50" data-lang-key="resetCloudSyncPassword">清除同步密碼</button>
          </div>
          <div class="border-t border-[var(--border-color)] pt-4 space-y-3">
            <h4 class="font-medium" data-lang-key="changeCloudSyncPassword">變更同步密碼</h4>
            <input id="sync-vault-current-password" type="password" autocomplete="current-password" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="currentCloudSyncPassword" placeholder="目前同步密碼">
            <input id="sync-vault-next-password" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="newCloudSyncPassword" placeholder="新的同步密碼（至少 10 碼）">
            <input id="sync-vault-next-confirmation" type="password" minlength="${syncVaultPolicy.minimumPasswordLength}" autocomplete="new-password" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordConfirm" placeholder="再次輸入同步密碼">
            <button id="sync-vault-change-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="saveCloudSyncPassword">儲存新密碼</button>
          </div>
        </div>
      </div>
    `;
    section.innerHTML = buildUserSectionMarkup();
    if (!section.parentNode) personalizationSection.before(section);
    bindEvents();
  };

  const setBusy = (nextBusy) => {
    busy = nextBusy;
    const elements = getElements();
    for (const button of [elements.emailButton, elements.googleButton, elements.loginPasswordButton, elements.forgotLoginPasswordButton, elements.createButton, elements.unlockButton, elements.forgotButton, elements.recoveryButton, elements.recoverySetupButton, elements.recoverySetupConfirm, elements.changeButton, elements.lockButton, elements.resetButton]) {
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
    element.classList.toggle('text-red-600', type === 'error');
    element.classList.toggle('text-[var(--text-secondary)]', type !== 'error');
  };

  const setProviderStatus = (element, bound) => {
    element.textContent = bound ? text('accountBound', '已綁定') : text('accountNotBound', '尚未綁定');
    element.classList.toggle('text-green-600', bound);
    element.classList.toggle('text-[var(--text-secondary)]', !bound);
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
    await accountTurnstile.mount('sync-vault-recovery', getElements().forgotButton);
    recoveryTurnstileMounted = true;
  };

  const getRecoveryStorageKey = (username) => `chatSyncVaultRecovery_v1_${username}`;

  const requestVaultRecovery = async (action, payload = {}) => {
    const supabase = getSupabaseClient();
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

  const storeVaultRecovery = (payload) => requestVaultRecovery('store', { payload });

  const isVerifiedRecoveryMode = async (username) => {
    const recoveryState = new URL(window.location.href).searchParams.get('vault_recovery');
    if (!recoveryState) return false;
    return recoveryState === await storage.getItem(getRecoveryStorageKey(username));
  };

  const refreshAccountLinking = async () => {
    const user = getCurrentUser?.();
    const elements = getElements();
    if (!user?.username || !elements.emailStatus) return;
    const isCloudUser = user.authProvider === 'supabase';
    let providers = [];
    if (isCloudUser && isSupabaseConfigured()) {
      const { data, error } = await getSupabaseClient().auth.getUserIdentities();
      if (!error) providers = (data?.identities || []).map(identity => identity.provider);
    }
    const emailBound = providers.includes('email');
    const googleBound = providers.includes('google');
    const canChangeLoginPassword = isCloudUser && emailBound;
    setProviderStatus(elements.emailStatus, emailBound);
    setProviderStatus(elements.googleStatus, googleBound);
    elements.emailForm.classList.toggle('hidden', emailBound || !isSupabaseConfigured());
    elements.emailInput.classList.toggle('hidden', isCloudUser);
    elements.emailInput.required = !isCloudUser;
    elements.googleButton.classList.toggle('hidden', googleBound || !isSupabaseConfigured());
    elements.loginPasswordPanel?.classList.toggle('hidden', !canChangeLoginPassword);
    elements.loginPasswordUnavailable?.classList.toggle('hidden', !isCloudUser || canChangeLoginPassword);
    elements.emailButton.textContent = isCloudUser
      ? text('enableEmailLogin', '設定 Email 登入密碼')
      : text('bindEmail', '綁定 Email');
    elements.googleButton.textContent = text('bindGoogle', '綁定 Google');
    if (!isSupabaseConfigured()) {
      setAccountMessage(text('cloudAccountUnavailable', '尚未連接 Supabase，無法綁定雲端帳號。'));
      return;
    }
    if (!isCloudUser) {
      await ensureAccountTurnstile();
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
    const accountLabel = isCloudUser
      ? (user.email || user.displayName || user.username)
      : `${user.displayName || user.username} · ${text('localAccount', '本機帳號')}`;
    elements.account.textContent = accountLabel;
    elements.status.textContent = !isCloudUser
      ? text('cloudSyncUnavailableForLocal', '本機帳號尚未綁定，雲端同步不可用')
      : !record
      ? text('cloudSyncPasswordNotSet', '尚未設定同步密碼')
      : unlocked
        ? text('cloudSyncUnlocked', '保險庫已解鎖，可進行加密同步')
        : text('cloudSyncLocked', '保險庫已鎖定，輸入同步密碼後才能同步 API 金鑰');
    elements.cloudOnlyPanel.classList.toggle('hidden', isCloudUser);
    elements.createPanel.classList.toggle('hidden', !isCloudUser || Boolean(record) || recoveryMode);
    elements.unlockPanel.classList.toggle('hidden', !isCloudUser || !record || unlocked || recoveryMode);
    elements.recoveryPanel.classList.toggle('hidden', !recoveryMode);
    elements.unlockedPanel.classList.toggle('hidden', !isCloudUser || !record || !unlocked || recoveryMode);
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

  const bindEvents = () => {
    const elements = getElements();
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
        const supabase = getSupabaseClient();
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
        const supabase = getSupabaseClient();
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
        const supabase = getSupabaseClient();
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
        setAccountMessage(text('loginPasswordChanged', '登入密碼已更新。'));
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
        await createAndUnlockSyncVault({ storage, username: user.username, password: elements.createPassword.value });
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
        const supabase = getSupabaseClient();
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
        const response = await requestVaultRecovery('recover');
        const recovered = await decryptSyncVaultRecovery(response.payload, elements.recoveryCode.value, window.crypto);
        await storage.setItem(getSyncVaultStorageKey(user.username), JSON.stringify(recovered.record));
        await changeSyncVaultPassword({
          storage,
          username: user.username,
          currentPassword: recovered.password,
          nextPassword: elements.recoveryPassword.value
        });
        await requestVaultRecovery('delete');
        await storage.removeItem(getRecoveryStorageKey(user.username));
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('vault_recovery');
        window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        elements.recoveryCode.value = '';
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
    elements.recoverySetupButton.addEventListener('click', () => {
      elements.recoverySetupCode.value = generateSyncVaultRecoveryCode(window.crypto);
      elements.recoverySetupPassword.value = '';
      elements.recoverySetupSaved.checked = false;
      elements.recoverySetupPanel.classList.remove('hidden');
      elements.recoverySetupCode.focus();
      elements.recoverySetupCode.select();
    });
    elements.recoverySetupConfirm.addEventListener('click', async () => {
      if (busy) return;
      const user = getCurrentUser();
      try {
        if (!elements.recoverySetupSaved.checked) {
          throw new Error(text('cloudSyncRecoveryCodeMustBeSaved', '請先確認你已安全保存 Recovery Code。'));
        }
        if (!elements.recoverySetupPassword.value) {
          throw new Error(text('currentCloudSyncPasswordRequired', '請輸入目前的同步密碼。'));
        }
        setBusy(true);
        await unlockSyncVault({ storage, username: user.username, password: elements.recoverySetupPassword.value });
        const record = await readSyncVaultRecord(storage, user.username);
        const payload = await encryptSyncVaultRecovery({
          password: elements.recoverySetupPassword.value,
          record,
          recoveryCode: elements.recoverySetupCode.value,
          cryptoImpl: window.crypto
        });
        await storeVaultRecovery(payload);
        elements.recoverySetupCode.value = '';
        elements.recoverySetupPassword.value = '';
        elements.recoverySetupSaved.checked = false;
        elements.recoverySetupPanel.classList.add('hidden');
        showNotification(text('cloudSyncRecoveryEnabled', 'Recovery Code 復原已啟用。'));
      } catch (error) {
        notifyError(error);
      } finally {
        setBusy(false);
      }
    });
    elements.changeButton.addEventListener('click', async () => {
      if (busy) return;
      try {
        const user = getCurrentUser();
        requireMatchingPasswords(elements.nextPassword.value, elements.nextConfirmation.value);
        setBusy(true);
        await requestVaultRecovery('delete');
        await changeSyncVaultPassword({
          storage,
          username: user.username,
          currentPassword: elements.currentPassword.value,
          nextPassword: elements.nextPassword.value
        });
        elements.currentPassword.value = '';
        elements.nextPassword.value = '';
        elements.nextConfirmation.value = '';
        dispatchUnlocked(user.username);
        showNotification(text('cloudSyncPasswordChangedRecoveryDisabled', '同步密碼已更新；原 Recovery Code 已停用，請視需要重新建立。'));
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
      globalThis.__astraCloudWorkspaceSync?.queueLocalChange('vault');
      globalThis.__astraCloudWorkspaceSync?.queueLocalChange('sensitive');
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
