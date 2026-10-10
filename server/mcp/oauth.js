// The login of a connector (docs/superpowers/specs/2026-10-10-mcp-connectors-design.md, §5.2): OAuth 2.1 with PKCE, with this server as the client. It finds out how the
// service logs people in (RFC 9728 protected resource metadata, then RFC 8414 / OpenID Connect discovery for the authorization server), says who the client
// is in the way the service takes (a client we registered by hand, a Client ID Metadata Document, or dynamic registration, RFC 7591), builds the address the
// person is sent to, and exchanges, refreshes and revokes tokens. Nothing here keeps anything: `fetchImpl` is given, and tokens are returned to the caller,
// which seals them (server/mcp/connections.js). Errors carry a code and never a token, a code or a secret.

import { createHash, randomBytes } from 'node:crypto';

export class OAuthError extends Error {
  constructor(code, message, { status = 0 } = {}) {
    super(message);
    this.name = 'OAuthError';
    this.code = code;
    this.status = status;
  }
}

const MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;

const base64url = (bytes) => Buffer.from(bytes).toString('base64url');

/** A PKCE pair: the verifier (kept by us until the code is exchanged) and its S256 challenge (sent to the service). */
export function pkcePair() {
  const verifier = base64url(randomBytes(48));
  return { verifier, challenge: base64url(createHash('sha256').update(verifier).digest()) };
}

/** A value that cannot be guessed: for `state`. */
export const randomState = () => base64url(randomBytes(32));
export const hashState = (state) => createHash('sha256').update(String(state)).digest('hex');

// An address the service names (its authorization, token, registration and revocation endpoints) must be on the public internet over HTTPS: a service
// that points us at an address inside a network is not followed there.
function assertPublicHttps(value, what) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new OAuthError('bad_metadata', `The ${what} is not an address.`);
  }
  const host = url.hostname.toLowerCase();
  const literal = /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[');
  const inside = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.');
  if (url.protocol !== 'https:' || literal || inside || url.username || url.password) throw new OAuthError('bad_metadata', `The ${what} is not a public https address.`);
  return url.toString();
}

async function withTimeout(fetchImpl, url, options, timeoutMs) {
  try {
    return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new OAuthError('unreachable', 'The service could not be reached.');
  }
}

async function readText(response) {
  const reader = response.body?.getReader?.();
  if (!reader) return (await response.text()).slice(0, MAX_BODY_BYTES);
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw new OAuthError('bad_response', 'The service answered with too much.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function getJson(fetchImpl, url, timeoutMs) {
  try {
    const response = await withTimeout(fetchImpl, url, { headers: { accept: 'application/json' }, redirect: 'follow' }, timeoutMs);
    if (!response.ok) return null;
    return JSON.parse(await readText(response));
  } catch (error) {
    if (error instanceof OAuthError && error.code === 'bad_response') throw error;
    return null;
  }
}

const withoutTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

/** Where the protected resource metadata may be (RFC 9728), then the one of the host. */
export function resourceMetadataCandidates(endpoint) {
  const url = new URL(endpoint);
  const path = url.pathname.replace(/\/+$/, '');
  return [...new Set([`${url.origin}/.well-known/oauth-protected-resource${path}`, `${url.origin}/.well-known/oauth-protected-resource`])];
}

/** Where the authorization server metadata may be (RFC 8414, then OpenID Connect discovery). */
export function authorizationMetadataCandidates(issuer) {
  const url = new URL(issuer);
  const path = url.pathname.replace(/\/+$/, '');
  return path
    ? [`${url.origin}/.well-known/oauth-authorization-server${path}`, `${url.origin}/.well-known/openid-configuration${path}`, `${url.origin}${path}/.well-known/openid-configuration`]
    : [`${url.origin}/.well-known/oauth-authorization-server`, `${url.origin}/.well-known/openid-configuration`];
}

/**
 * How the service logs people in: { resource, issuer, authorizationEndpoint, tokenEndpoint, registrationEndpoint, revocationEndpoint, cimd, issuerInResponse,
 * scopes }. Throws an OAuthError when the service cannot be logged in to in a way that is safe (no PKCE with S256, an address that is not public https).
 */
export async function discover(endpoint, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  assertPublicHttps(endpoint, 'service address');
  const origin = new URL(endpoint).origin;
  let resource = null;
  for (const candidate of resourceMetadataCandidates(endpoint)) {
    const found = await getJson(fetchImpl, candidate, timeoutMs);
    if (found && typeof found === 'object') {
      resource = found;
      break;
    }
  }
  // The resource must be this service's (a metadata file of another host is not believed).
  if (resource?.resource) {
    let same = false;
    try {
      same = new URL(resource.resource).origin === origin;
    } catch {
      same = false;
    }
    if (!same) throw new OAuthError('bad_metadata', 'The service names another resource than its own.');
  }
  const issuer = Array.isArray(resource?.authorization_servers) && typeof resource.authorization_servers[0] === 'string' ? resource.authorization_servers[0] : origin;
  assertPublicHttps(issuer, 'authorization server');
  let metadata = null;
  for (const candidate of authorizationMetadataCandidates(issuer)) {
    const found = await getJson(fetchImpl, candidate, timeoutMs);
    if (found && (found.authorization_endpoint || found.token_endpoint)) {
      metadata = found;
      break;
    }
  }
  if (!metadata) throw new OAuthError('no_metadata', 'The service does not say how to log in.');
  if (metadata.issuer && withoutTrailingSlash(metadata.issuer) !== withoutTrailingSlash(issuer)) throw new OAuthError('bad_metadata', 'The login server names another issuer than the one asked.');
  const methods = Array.isArray(metadata.code_challenge_methods_supported) ? metadata.code_challenge_methods_supported : [];
  if (!methods.includes('S256')) throw new OAuthError('no_pkce', 'The service does not take PKCE with S256.');
  if (!metadata.authorization_endpoint || !metadata.token_endpoint) throw new OAuthError('bad_metadata', 'The login server has no authorization or token address.');
  return {
    resource: typeof resource?.resource === 'string' && resource.resource ? resource.resource : endpoint,
    issuer: withoutTrailingSlash(issuer),
    authorizationEndpoint: assertPublicHttps(metadata.authorization_endpoint, 'authorization address'),
    tokenEndpoint: assertPublicHttps(metadata.token_endpoint, 'token address'),
    registrationEndpoint: metadata.registration_endpoint ? assertPublicHttps(metadata.registration_endpoint, 'registration address') : '',
    revocationEndpoint: metadata.revocation_endpoint ? assertPublicHttps(metadata.revocation_endpoint, 'revocation address') : '',
    cimd: metadata.client_id_metadata_document_supported === true,
    issuerInResponse: metadata.authorization_response_iss_parameter_supported === true,
    scopes: Array.isArray(metadata.scopes_supported) ? metadata.scopes_supported.filter((scope) => typeof scope === 'string') : []
  };
}

/**
 * Who this client is to the service, in the order the specification prefers: a client registered by hand (`preregistered[connectorId] = { clientId, clientSecret? }`
 * from the environment), our Client ID Metadata Document (when the service says it takes one), a client registered dynamically. `clientStore` keeps
 * what a dynamic registration gave ({ get(key), set(key, value) }: one registration serves every person). `prefer: 'dcr'`: register first when the service
 * has a registration address, because a service that shows the client on its consent screen shows the name and the picture it was registered with and,
 * for a client known only by a metadata document, may show just the address of the redirect (Notion does). `identity`: { clientUri, logoUri, tosUri,
 * policyUri } told to the service in a registration. Returns { clientId, clientSecret?, how }.
 */
export async function resolveClient({ connectorId, metadata, redirectUri, cimdUrl, preregistered = {}, clientStore = null, clientName = 'Noureon', identity = {}, prefer = '', fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const hand = preregistered[connectorId];
  if (hand?.clientId) return { clientId: hand.clientId, ...(hand.clientSecret ? { clientSecret: hand.clientSecret } : {}), how: 'preregistered' };
  const useCimd = Boolean(metadata.cimd && cimdUrl);
  const register = async () => {
    const key = `${connectorId}|${metadata.issuer}|${redirectUri}`;
    const kept = clientStore ? await clientStore.get(key) : null;
    if (kept?.clientId) return { clientId: kept.clientId, how: 'dcr' };
    const response = await withTimeout(fetchImpl, metadata.registrationEndpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_name: clientName,
        ...(identity.clientUri ? { client_uri: identity.clientUri } : {}),
        ...(identity.logoUri ? { logo_uri: identity.logoUri } : {}),
        ...(identity.tosUri ? { tos_uri: identity.tosUri } : {}),
        ...(identity.policyUri ? { policy_uri: identity.policyUri } : {}),
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none'
      })
    }, timeoutMs);
    let body = null;
    try {
      body = JSON.parse(await readText(response));
    } catch {
      body = null;
    }
    if (!response.ok || typeof body?.client_id !== 'string' || !body.client_id) throw new OAuthError('registration_refused', 'The service did not accept the registration.', { status: response.status });
    if (clientStore) await clientStore.set(key, { clientId: body.client_id });
    return { clientId: body.client_id, how: 'dcr' };
  };
  if (prefer === 'dcr' && metadata.registrationEndpoint) {
    try {
      return await register();
    } catch (error) {
      // Refused or not reachable: the metadata document is the other way, when the service takes one.
      if (!useCimd) throw error;
    }
  }
  if (useCimd) return { clientId: cimdUrl, how: 'cimd' };
  if (!metadata.registrationEndpoint) throw new OAuthError('no_client', 'The service takes no client that we can be.');
  return register();
}

/** The address the person is sent to, to log in. */
export function buildAuthorizationUrl({ metadata, clientId, redirectUri, scopes = [], state, challenge }) {
  const url = new URL(metadata.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // RFC 8707: the token is asked for this service and no other.
  url.searchParams.set('resource', metadata.resource);
  if (scopes.length) url.searchParams.set('scope', scopes.join(' '));
  return url.toString();
}

async function tokenRequest(url, form, { clientSecret = '', fetchImpl, timeoutMs }) {
  const body = new URLSearchParams(form);
  const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
  if (clientSecret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(form.client_id)}:${encodeURIComponent(clientSecret)}`).toString('base64')}`;
  const response = await withTimeout(fetchImpl, url, { method: 'POST', redirect: 'error', headers, body }, timeoutMs);
  let data = null;
  try {
    data = JSON.parse(await readText(response));
  } catch {
    data = null;
  }
  if (!response.ok) {
    // `invalid_grant`: the code or the refresh token is no longer good (the person must log in again).
    const code = typeof data?.error === 'string' && /^[a-z_]{1,40}$/.test(data.error) ? data.error : 'token_refused';
    throw new OAuthError(code, 'The service refused the token request.', { status: response.status });
  }
  if (typeof data?.access_token !== 'string' || !data.access_token || (data.token_type && String(data.token_type).toLowerCase() !== 'bearer')) throw new OAuthError('bad_response', 'The service did not give a usable token.', { status: response.status });
  const seconds = Number(data.expires_in);
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : '',
    expiresInSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 365 * 24 * 3600) : 0,
    scope: typeof data.scope === 'string' ? data.scope.slice(0, 500) : ''
  };
}

/** Trades the code the service sent back for tokens. Returns { accessToken, refreshToken, expiresInSeconds, scope }. */
export function exchangeCode({ metadata, client, redirectUri, code, verifier, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return tokenRequest(metadata.tokenEndpoint, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: client.clientId, code_verifier: verifier, resource: metadata.resource }, { clientSecret: client.clientSecret, fetchImpl, timeoutMs });
}

/** Trades a refresh token for new tokens (a service that rotates gives a new refresh token: it must be kept, the old one is dead). */
export function refreshTokens({ metadata, client, refreshToken, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return tokenRequest(metadata.tokenEndpoint, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: client.clientId, resource: metadata.resource }, { clientSecret: client.clientSecret, fetchImpl, timeoutMs });
}

/** Tells the service the token is no longer wanted (RFC 7009), when it has an address for that. Returns whether the service accepted; it never throws. */
export async function revokeToken({ metadata, client, token, hint = 'refresh_token', fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!metadata?.revocationEndpoint || !token) return false;
  try {
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (client.clientSecret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`).toString('base64')}`;
    const response = await withTimeout(fetchImpl, metadata.revocationEndpoint, { method: 'POST', redirect: 'error', headers, body: new URLSearchParams({ token, token_type_hint: hint, client_id: client.clientId }) }, timeoutMs);
    return response.ok;
  } catch {
    return false;
  }
}
