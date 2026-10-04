// The secure credentials (安全憑證) of the CLI tools, as the settings page reaches them: through the server, which keeps them encrypted
// (server/cli-credentials.js). A person may look at their own. Every function resolves { ok, ... } and never throws.

import { serverRequest } from './cli-server-bridge.js';

export const CREDENTIAL_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
/** Said on the window whenever a credential is saved or deleted, so a settings tab that is open (or opens later) shows the same list at once. */
export const CREDENTIALS_CHANGED = 'noureon:credentials-changed';
const announce = () => {
  try {
    if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.Event === 'function') globalThis.dispatchEvent(new globalThis.Event(CREDENTIALS_CHANGED));
  } catch {
    // Nothing is listening: the list is read again when the tab opens.
  }
};

/** All of the person's credentials: { ok, credentials: [{ name, value, updatedAt }] }. */
export async function listCredentials() {
  const result = await serverRequest('GET', '/v1/credentials');
  return result.ok ? { ok: true, credentials: Array.isArray(result.data?.credentials) ? result.data.credentials : [] } : { ok: false, code: result.code || `http-${result.status}` };
}

/** Adds or replaces one: { ok } or { ok: false, code } ('bad_name', 'bad_value' and 'too_many' are the server's reasons, in `reason`). */
export async function saveCredential(name, value) {
  if (!CREDENTIAL_NAME.test(String(name || ''))) return { ok: false, code: 'bad_request', reason: 'bad_name' };
  const result = await serverRequest('PUT', `/v1/credentials/${encodeURIComponent(name)}`, { body: JSON.stringify({ value }) });
  if (result.ok) announce();
  return result.ok ? { ok: true } : { ok: false, code: result.code || `http-${result.status}`, reason: result.data?.error?.reason || '' };
}

export async function deleteCredential(name) {
  if (!CREDENTIAL_NAME.test(String(name || ''))) return { ok: false, code: 'bad_request' };
  const result = await serverRequest('DELETE', `/v1/credentials/${encodeURIComponent(name)}`);
  if (result.ok) announce();
  return result.ok ? { ok: true } : { ok: false, code: result.code || `http-${result.status}` };
}
