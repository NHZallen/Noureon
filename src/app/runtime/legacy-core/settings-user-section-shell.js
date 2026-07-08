const DEFAULT_SYNC_PASSWORD_LENGTH = 10;

const resolveText = (getText, key, fallback) => (
  typeof getText === 'function' ? getText(key, fallback) : fallback
);

export function buildUserSettingsSectionMarkup({ minimumPasswordLength = DEFAULT_SYNC_PASSWORD_LENGTH } = {}) {
  return `
      <div class="max-w-3xl">
        <div id="settings-user-profile-panel" class="pb-8">
          <div class="pb-4">
            <h3 class="text-lg font-semibold">使用者資料</h3>
            <p class="mt-2 text-sm text-[var(--text-secondary)]">更新顯示名稱，或上傳一張會同步顯示在側邊欄的使用者頭像。</p>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-5 border-t border-b border-[var(--border-color)] py-5">
            <div id="settings-user-avatar-preview" class="w-20 h-20 rounded-full bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] flex items-center justify-center text-2xl font-semibold overflow-hidden shrink-0"></div>
            <div class="min-w-0 flex-1 space-y-3">
              <label for="settings-user-display-name-input" class="block text-sm font-medium">顯示名稱</label>
              <input id="settings-user-display-name-input" type="text" maxlength="64" autocomplete="name" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="使用者名稱">
              <input id="settings-user-avatar-input" type="file" accept="image/*" class="hidden">
              <div class="flex flex-wrap items-center gap-3">
                <button id="settings-user-avatar-upload-btn" type="button" class="px-4 py-2 rounded-md border border-[var(--border-color)] bg-transparent hover:bg-[var(--hover-bg)]">編輯頭像</button>
                <button id="settings-user-avatar-remove-btn" type="button" class="px-4 py-2 rounded-md bg-transparent text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]">移除頭像</button>
                <button id="settings-user-profile-save-btn" type="button" class="px-4 py-2 rounded-md btn-primary">儲存</button>
              </div>
            </div>
          </div>
        </div>
        <div class="pb-6">
          <h3 class="text-lg font-semibold" data-lang-key="accountLinking">帳號綁定</h3>
          <p class="mt-2 text-sm text-[var(--text-secondary)]" data-lang-key="accountLinkingDesc">綁定 Email、Google 其中一種即可使用雲端功能，也可以兩種都綁定。</p>
        </div>
        <div class="border-t border-[var(--border-color)]">
          <div class="flex items-center justify-between gap-4 py-4 border-b border-[var(--border-color)]">
            <div class="flex items-center gap-3 min-w-0">
              <span class="shrink-0 text-[var(--text-secondary)]" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>
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
          <p class="mt-2 text-sm text-[var(--text-secondary)]" data-lang-key="cloudSyncVaultDesc">同步密碼會以伺服器金鑰加密後保存，用於跨裝置與 Email 復原；資料庫不保存明文。</p>
        </div>
        <div class="border-t border-[var(--border-color)]">
          <div class="py-4 border-b border-[var(--border-color)]">
            <p id="sync-vault-account" class="text-sm font-medium"></p>
            <p id="sync-vault-status" class="text-sm text-[var(--text-secondary)] mt-1"></p>
          </div>
          <div id="sync-vault-cloud-only-panel" class="hidden py-4 border-b border-[var(--border-color)] text-[var(--text-secondary)] text-sm" data-lang-key="cloudSyncRequiresCloudAccount">綁定 Email 或 Google 帳號後，才能設定同步密碼並使用雲端同步。</div>
          <div id="sync-vault-create-panel" class="hidden py-4 border-b border-[var(--border-color)] space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input id="sync-vault-create-password" type="password" minlength="${minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordPlaceholder" placeholder="至少 ${minimumPasswordLength} 碼的同步密碼">
              <input id="sync-vault-create-confirmation" type="password" minlength="${minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordConfirm" placeholder="再次輸入同步密碼">
            </div>
            <button id="sync-vault-create-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="createCloudSyncPassword">建立同步密碼</button>
          </div>
          <div id="sync-vault-unlock-panel" class="hidden py-4 border-b border-[var(--border-color)] space-y-3">
            <input id="sync-vault-unlock-password" type="password" minlength="${minimumPasswordLength}" autocomplete="current-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPassword" placeholder="同步密碼">
            <div class="flex flex-wrap items-center gap-3">
              <button id="sync-vault-unlock-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="unlockCloudSync">解鎖雲端同步</button>
              <button id="sync-vault-forgot-btn" type="button" class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline" data-lang-key="forgotCloudSyncPassword">忘記同步密碼</button>
            </div>
          </div>
          <div id="sync-vault-recovery-panel" class="hidden py-4 border-b border-[var(--border-color)] space-y-3">
            <p class="text-sm text-[var(--text-secondary)]" data-lang-key="cloudSyncRecoveryWarning">Email 驗證成功後可建立新同步密碼，既有加密同步資料會保留。</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input id="sync-vault-recovery-password" type="password" minlength="${minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="newCloudSyncPassword" placeholder="新的同步密碼（至少 ${minimumPasswordLength} 碼）">
              <input id="sync-vault-recovery-confirmation" type="password" minlength="${minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordConfirm" placeholder="再次輸入同步密碼">
            </div>
            <button id="sync-vault-recovery-save-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="confirmCloudSyncPasswordReset">重設同步密碼</button>
          </div>
          <div id="sync-vault-unlocked-panel" class="hidden py-4 space-y-4">
            <div class="flex flex-wrap gap-2">
              <button id="sync-vault-lock-btn" type="button" class="px-4 py-2 rounded-md bg-[var(--hover-bg)]" data-lang-key="lockCloudSync">鎖定</button>
              <button id="sync-vault-reset-btn" type="button" class="px-4 py-2 rounded-md text-red-600 bg-transparent hover:bg-red-50" data-lang-key="resetCloudSyncPassword">清除同步密碼</button>
            </div>
            <div class="border-t border-[var(--border-color)] pt-4 space-y-3">
              <h4 class="font-medium" data-lang-key="changeCloudSyncPassword">變更同步密碼</h4>
              <input id="sync-vault-current-password" type="password" autocomplete="current-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="currentCloudSyncPassword" placeholder="目前同步密碼">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input id="sync-vault-next-password" type="password" minlength="${minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="newCloudSyncPassword" placeholder="新的同步密碼（至少 ${minimumPasswordLength} 碼）">
                <input id="sync-vault-next-confirmation" type="password" minlength="${minimumPasswordLength}" autocomplete="new-password" class="w-full p-3 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" data-lang-key-placeholder="cloudSyncPasswordConfirm" placeholder="再次輸入同步密碼">
              </div>
              <button id="sync-vault-change-btn" type="button" class="px-4 py-2 rounded-md btn-primary" data-lang-key="saveCloudSyncPassword">儲存新密碼</button>
            </div>
          </div>
        </div>
      </div>
    `;
}

export function ensureUserSettingsSection({
  document,
  getText,
  minimumPasswordLength = DEFAULT_SYNC_PASSWORD_LENGTH
} = {}) {
  const settingsNav = document?.getElementById?.('settings-nav');
  const personalizationNav = settingsNav?.querySelector?.('[data-section="personalization"]');
  const personalizationSection = document?.getElementById?.('personalization-section');
  if (!settingsNav || !personalizationNav || !personalizationSection) return {};

  let nav = document.getElementById('user-section-nav');
  const createdNav = !nav;
  if (!nav) {
    nav = document.createElement('li');
    nav.id = 'user-section-nav';
    nav.className = 'settings-nav-item p-3 rounded-md';
    nav.dataset.section = 'user';
    nav.dataset.langKey = 'userSettings';
    personalizationNav.before(nav);
  }
  nav.textContent = resolveText(getText, 'userSettings', '使用者');

  let section = document.getElementById('user-section');
  const createdSection = !section;
  if (!section) {
    section = document.createElement('div');
    section.id = 'user-section';
    section.className = 'settings-section';
    section.innerHTML = buildUserSettingsSectionMarkup({ minimumPasswordLength });
    personalizationSection.before(section);
  }

  return { nav, section, createdNav, createdSection };
}
