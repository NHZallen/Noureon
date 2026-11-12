// The page's side of the recovery of the sync password (api/sync-vault-recovery.js): asking the function, and telling whether this page was opened from the
// verification Email of a recovery (the state kept here is what the link carries back).

export const getRecoveryStorageKey = (username) => `chatSyncVaultRecovery_v1_${username}`;

/** deps: window, storage, getSupabase(), text(key, fallback). Returns { request(action, payload), store(password, record, currentPassword), isVerifiedMode(username) }. */
export function createVaultRecoveryClient({ window, storage, getSupabase, text }) {
  const request = async (action, payload = {}) => {
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
      if (result.code === 'current_password_required') throw Object.assign(new Error(text('cloudSyncCurrentPasswordRequired', '請在「目前同步密碼」輸入現在的同步密碼。忘記的話，請用「忘記同步密碼」。')), { code: result.code });
      if (result.code === 'mfa_required') throw Object.assign(new Error(text('securityMfaRequired', '請先輸入驗證器上的六位數。')), { code: result.code });
      throw Object.assign(new Error(result.error || text('cloudSyncRecoveryFailed', '同步密碼復原服務失敗。')), { code: result.code });
    }
    return result;
  };

  return {
    request,
    // Replacing what is kept takes the sync password kept now (or the Email sign-in of the recovery): a session alone is not enough.
    store: (password, record, currentPassword = '') => request('store', { password, record, currentPassword }),
    isVerifiedMode: async (username) => {
      const recoveryState = new URL(window.location.href).searchParams.get('vault_recovery');
      if (!recoveryState) return false;
      return recoveryState === await storage.getItem(getRecoveryStorageKey(username));
    }
  };
}
