// The buttons of the sign-in part of the user page (settings-sync-vault-controls.js): binding an email or a Google sign-in to the
// account, changing the login password and the link to reset it. Moved as they were; `ctx` holds the page's shared helpers.

import { clearPendingCloudAccountLink, completePendingCloudAccountLink, markPendingCloudAccountLink } from '../../auth/account-linking.js';
import { createCloudUserRecord } from '../../auth/supabase-auth-bridge.js';
import { openPasswordRecovery } from '../../auth/password-recovery-route.js';

export function bindAccountLinkingActions(elements, {
  window, document, storage, getCurrentUser, text, getSupabase, reloadPage, scheduleTimeout, isBusy, setBusy, getAccountTurnstile,
  setAccountMessage, authErrorText, requireMatchingLoginPasswords, refreshAccountLinking, setLoginPasswordOpen
}) {
  elements.emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isBusy()) return;
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
      const captchaToken = getAccountTurnstile()?.getToken('account-email-link');
      if (getAccountTurnstile()?.enabled && !captchaToken) throw new Error(text('turnstileRequired', '請先完成人機驗證。'));
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
      getAccountTurnstile()?.reset('account-email-link');
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
      setAccountMessage(authErrorText(error) || error?.message || text('accountLinkFailed', '帳號綁定失敗。'), 'error');
    } finally {
      setBusy(false);
    }
  });
  elements.googleButton.addEventListener('click', async () => {
    if (isBusy()) return;
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
      setAccountMessage(authErrorText(error) || error?.message || text('accountLinkFailed', '帳號綁定失敗。'), 'error');
    }
  });
  elements.loginPasswordButton?.addEventListener('click', async () => {
    if (isBusy()) return;
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
      setAccountMessage(authErrorText(error) || error?.message || text('loginPasswordChangeFailed', '登入密碼更新失敗。'), 'error');
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
}
