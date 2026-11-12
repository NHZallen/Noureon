// The messages the account and security pages show for what went wrong, in the person's language: the errors of the sync vault carry a code (`vault-password-incorrect`...), the passkeys
// have theirs (settings-security-passkey.js), and the sign-in service answers in English with a few that a person is likely to meet here.

import { passkeyErrorText } from './settings-security-passkey.js';

export function createSecurityErrors({ text, showNotification }) {
  const vaultErrorText = (error) => {
    if (error?.code === 'vault-password-too-short') return text('cloudSyncPasswordTooShort', '同步密碼至少需要 10 碼。');
    if (error?.code === 'vault-password-incorrect' || error?.message?.includes('Incorrect')) return text('cloudSyncPasswordIncorrect', '同步密碼不正確。');
    if (error?.code === 'vault-not-configured') return text('cloudSyncPasswordNotSet', '尚未設定同步密碼');
    return passkeyErrorText(error, text);
  };

  const authErrorText = (error) => {
    const code = error?.code || '';
    const message = String(error?.message || '');
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return text('loginPasswordCurrentIncorrect', '目前登入密碼不正確。');
    if (code === 'same_password' || /different from the old password/i.test(message)) return text('loginPasswordSameAsOld', '新密碼不能和目前的密碼相同。');
    if (/mfa_required/.test(message)) return text('securityMfaRequired', '請先輸入驗證器上的六位數。');
    if (/rate_limit/.test(code) || error?.status === 429 || /rate limit/i.test(message)) return text('authRateLimited', '嘗試次數過多，請稍後再試。');
    return '';
  };

  const notifyError = (error) => {
    showNotification(vaultErrorText(error) || authErrorText(error) || error?.message || text('cloudSyncPasswordError', '同步密碼操作失敗。'), 'error');
  };

  return { vaultErrorText, authErrorText, notifyError };
}
