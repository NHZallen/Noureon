// The browser agent as the settings page and the admin page reach it: through the server's routes (server/browser-account-routes.js, server/browser-login-routes.js). Nothing here ever holds
// a password; the list of logins has names and sites only. Every function resolves { ok, ... } and never throws.

import { serverRequest } from '../cli/cli-server-bridge.js';

const failure = (result) => ({ ok: false, code: result.data?.error?.code || result.code || `http-${result.status}`, message: String(result.data?.error?.message || '').slice(0, 240) });
const json = (body) => ({ body: JSON.stringify(body) });

/** Where this person stands: { ok, allowed, admin, codes: [{ code, used }] }. */
export async function getAccess() {
  const result = await serverRequest('GET', '/v1/browser/access');
  return result.ok ? { ok: true, allowed: result.data?.allowed === true, admin: result.data?.admin === true, codes: Array.isArray(result.data?.codes) ? result.data.codes : [] } : failure(result);
}

/** Uses an invite code: { ok } or { ok: false, message } (the server says in plain words why the code cannot be used). */
export async function redeemCode(code) {
  const result = await serverRequest('POST', '/v1/browser/redeem', json({ code: String(code || '').trim() }));
  return result.ok ? { ok: true } : failure(result);
}

/** The logins kept in the password vault: { ok, logins: [{ id, name, origins, lastUsedAt }] }. */
export async function listLogins() {
  const result = await serverRequest('GET', '/v1/browser/logins');
  return result.ok ? { ok: true, logins: Array.isArray(result.data?.logins) ? result.data.logins : [] } : failure(result);
}

export async function deleteLogin(id) {
  const result = await serverRequest('DELETE', `/v1/browser/logins/${encodeURIComponent(id)}`);
  return result.ok ? { ok: true } : failure(result);
}

/** The facts of the login state kept for the browser: { ok, exists, sizeBytes, lastUsedAt }. */
export async function getProfile() {
  const result = await serverRequest('GET', '/v1/browser/profile');
  return result.ok ? { ok: true, exists: result.data?.exists === true, sizeBytes: Number(result.data?.sizeBytes) || 0, lastUsedAt: result.data?.lastUsedAt || '' } : failure(result);
}

/** Logs the browser out of one site (an https address). */
export async function logoutSite(origin) {
  const result = await serverRequest('POST', '/v1/browser/profile/logout', json({ origin }));
  return result.ok ? { ok: true } : failure(result);
}

export async function deleteProfile() {
  const result = await serverRequest('DELETE', '/v1/browser/profile');
  return result.ok ? { ok: true } : failure(result);
}

/** For the people in charge only (the page of the admin): stops every browser, or makes codes that belong to nobody. */
export async function stopAllBrowsers() {
  const result = await serverRequest('POST', '/v1/browser/admin/stop-all');
  return result.ok ? { ok: true, stopped: Number(result.data?.stopped) || 0 } : failure(result);
}

export async function mintCodes(count) {
  const result = await serverRequest('POST', '/v1/browser/admin/codes', json({ count }));
  return result.ok ? { ok: true, codes: Array.isArray(result.data?.codes) ? result.data.codes : [] } : failure(result);
}
