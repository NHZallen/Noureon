// Who is asking. The browser's sign-in token is checked by asking the sign-in service itself (it knows when a token was revoked), and the
// answer is kept for a minute so a burst of requests does not become a burst of questions. Only the person's id is kept, under a
// hash of the token, never the token.

import { createHash } from 'node:crypto';

const CACHE_MS = 60_000;
const MAX_CACHE = 2000;

export const bearerToken = (header) => {
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(String(header || '').trim());
  return match ? match[1] : '';
};

export function createTokenVerifier({ supabaseUrl, anonKey, fetchImpl = fetch, now = Date.now }) {
  const known = new Map();
  return async function verify(token) {
    if (!token) return null;
    const key = createHash('sha256').update(token).digest('hex');
    const hit = known.get(key);
    if (hit && hit.until > now()) return hit.user;
    let response;
    try {
      response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      // The sign-in service could not be reached: nobody is let in on a guess.
      const error = new Error('auth service unreachable');
      error.code = 'auth_unreachable';
      throw error;
    }
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) {
      const error = new Error(`auth service answered ${response.status}`);
      error.code = 'auth_unreachable';
      throw error;
    }
    const body = await response.json().catch(() => null);
    const id = typeof body?.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : '';
    if (!id) return null;
    // The address of the account (the connectors that are open to some accounts only, and the waitlist, need it): lower case, or empty when the sign-in service gives none that can be used.
    const email = typeof body?.email === 'string' && /^[^\s<>,;"]{1,64}@[^\s<>,;"]{1,255}$/.test(body.email) ? body.email.toLowerCase() : '';
    const user = Object.freeze({ id, email });
    if (known.size >= MAX_CACHE) known.delete(known.keys().next().value);
    known.set(key, { user, until: now() + CACHE_MS });
    return user;
  };
}
