// Asks the server to mail the owner of the account that the login password was changed, after a password was chosen on the page that
// follows a forgotten one (password-recovery-page.js). The change in Settings does the same through the page's own connection
// (runtime/settings/settings-security-notice.js); this page has no such connection (it is not the app), so it makes the one call itself with the
// token of the session the verification code just opened, before that session is ended. The mail has the time, the device and the place
// (server/security-notices.js). It never holds anything up and never throws: the password is changed whether or not the mail goes.

// The same place as runtime/server-reply/server-reply.js (not imported from it: that module is the whole reply machinery, and this page needs one call).
const resolveServerApiUrl = (value) => {
  const text = String(value ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+$/.test(text) ? text : 'https://api.noureon.com';
};

/** Resolves true when the server took the request. `supabase`: the client whose session is the one the code opened. */
export async function sendPasswordChangedNotice({ supabase, fetchImpl = (...args) => globalThis.fetch(...args), baseUrl = resolveServerApiUrl(import.meta.env?.VITE_SERVER_API_URL), timeoutMs = 4000 } = {}) {
  try {
    const { data, error } = await supabase.auth.getSession();
    const token = error ? '' : data?.session?.access_token || '';
    if (!token) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/v1/security-notice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'login-password-changed' }),
        signal: controller.signal
      });
      return response.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}
