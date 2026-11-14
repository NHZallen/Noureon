// The connectors (連接器) as the Extensions page reaches them: through the server, which keeps the logins sealed (server/mcp/connections.js) and never gives a
// token to the page. Every function resolves { ok, ... } and never throws.

import { serverRequest } from '../cli/cli-server-bridge.js';

const failure = (result) => ({ ok: false, code: result.code || `http-${result.status}`, reason: result.data?.error?.reason || '', detail: String(result.data?.error?.detail || '').slice(0, 240) });

/** The state of every connector of the catalog for this person: { ok, connectors: [{ id, status: 'none' | 'connected' | 'needs_login', mode, tools: [{ name, description, kind, state, changed }], error }] }. */
export async function listConnectors() {
  const result = await serverRequest('GET', '/v1/connectors');
  return result.ok ? { ok: true, connectors: Array.isArray(result.data?.connectors) ? result.data.connectors : [] } : failure(result);
}

/** Begins a login: { ok, url } (the page goes to `url`, the service's login). `mode`: 'readonly' or 'readwrite'. */
export async function startConnector(id, mode) {
  const result = await serverRequest('POST', `/v1/connectors/${encodeURIComponent(id)}/connect`, { body: JSON.stringify({ mode: mode === 'readonly' ? 'readonly' : 'readwrite' }) });
  return result.ok && typeof result.data?.url === 'string' ? { ok: true, url: result.data.url } : failure(result);
}

export async function disconnectConnector(id) {
  const result = await serverRequest('POST', `/v1/connectors/${encodeURIComponent(id)}/disconnect`);
  return result.ok ? { ok: true, revoked: result.data?.revoked === true } : failure(result);
}

/** `states`: { toolName: 'allow' | 'ask' | 'deny' }. */
export async function saveToolStates(id, states) {
  const result = await serverRequest('PUT', `/v1/connectors/${encodeURIComponent(id)}/permissions`, { body: JSON.stringify({ tools: states }) });
  return result.ok ? { ok: true } : failure(result);
}

/** Asks the service for its tools again: { ok, connectors: [the one connector's state] }. */
export async function refreshConnector(id) {
  const result = await serverRequest('POST', `/v1/connectors/${encodeURIComponent(id)}/refresh`);
  return result.ok ? { ok: true, connector: Array.isArray(result.data?.connectors) ? result.data.connectors[0] || null : null } : failure(result);
}

/** Asks to be let in to a connector that is not open to this account yet (a mail goes to us): { ok } (`already` when it was asked a short time ago). `email`: the account of the service the person will log in with. */
export async function requestWaitlist(id, email = '') {
  const result = await serverRequest('POST', `/v1/connectors/${encodeURIComponent(id)}/waitlist`, { body: JSON.stringify({ email: String(email || '').trim() }) });
  return result.ok ? { ok: true, already: result.data?.already === true, open: result.data?.open === true } : failure(result);
}
