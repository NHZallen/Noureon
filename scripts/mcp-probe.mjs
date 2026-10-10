#!/usr/bin/env node
// Phase 0 of the connectors (docs/superpowers/specs/2026-10-10-mcp-connectors-design.md, §7): which way does each MCP server let a new client such as
// Noureon introduce itself? It only READS: it sends the one request every MCP client sends first (an `initialize` without a token, which an OAuth server
// answers with 401) and reads the public files of the login (RFC 9728 protected resource metadata, RFC 8414 / OpenID authorization server metadata).
// It registers nothing, logs in to nothing and keeps nothing.
//
//   node scripts/mcp-probe.mjs            a table
//   node scripts/mcp-probe.mjs --json     everything it found, as JSON
//
// On a machine with no Node:  docker run --rm -v ~/Noureon:/app -w /app --entrypoint node noureon-sandbox-runner:1 scripts/mcp-probe.mjs

export const TARGETS = Object.freeze([
  { id: 'notion', name: 'Notion', url: 'https://mcp.notion.com/mcp' },
  { id: 'linear', name: 'Linear', url: 'https://mcp.linear.app/mcp' },
  { id: 'context7', name: 'Context7', url: 'https://mcp.context7.com/mcp/oauth' },
  { id: 'upstash', name: 'Upstash', url: 'https://mcp.upstash.com/mcp' },
  { id: 'vercel', name: 'Vercel', url: 'https://mcp.vercel.com' },
  { id: 'github', name: 'GitHub', url: 'https://api.githubcopilot.com/mcp/' }
]);

const INITIALIZE = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'noureon-probe', version: '0' } } });

const withTimeout = async (fetchImpl, url, options, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
};

const getJson = async (fetchImpl, url, timeoutMs) => {
  try {
    const response = await withTimeout(fetchImpl, url, { headers: { accept: 'application/json' } }, timeoutMs);
    if (!response.ok) return { url, status: response.status, body: null };
    const text = await response.text();
    try {
      return { url, status: response.status, body: JSON.parse(text) };
    } catch {
      return { url, status: response.status, body: null, note: 'not JSON' };
    }
  } catch (error) {
    return { url, status: 0, body: null, note: String(error?.message || error).slice(0, 120) };
  }
};

/** The URL given in the `WWW-Authenticate: Bearer resource_metadata="..."` header of a 401, or ''. */
export function resourceMetadataFromHeader(header) {
  const match = /resource_metadata="([^"]+)"/i.exec(String(header || ''));
  return match ? match[1] : '';
}

/** Where the protected resource metadata may be, in the order of RFC 9728. */
export function resourceMetadataCandidates(endpoint, headerUrl = '') {
  const url = new URL(endpoint);
  const path = url.pathname.replace(/\/+$/, '');
  const candidates = [headerUrl, `${url.origin}/.well-known/oauth-protected-resource${path}`, `${url.origin}/.well-known/oauth-protected-resource`];
  return [...new Set(candidates.filter(Boolean))];
}

/** Where the authorization server metadata may be, in the order the MCP specification gives (RFC 8414, then OpenID Connect discovery). */
export function authorizationMetadataCandidates(issuer) {
  const url = new URL(issuer);
  const path = url.pathname.replace(/\/+$/, '');
  const list = path
    ? [`${url.origin}/.well-known/oauth-authorization-server${path}`, `${url.origin}/.well-known/openid-configuration${path}`, `${url.origin}${path}/.well-known/openid-configuration`]
    : [`${url.origin}/.well-known/oauth-authorization-server`, `${url.origin}/.well-known/openid-configuration`];
  return list;
}

/** How a new client may introduce itself, from the metadata of the authorization server. */
export function classify(metadata) {
  if (!metadata) return { how: 'unknown', note: 'no authorization server metadata was found' };
  if (metadata.client_id_metadata_document_supported === true) return { how: 'CIMD', note: 'a client id that is the address of a metadata document' };
  if (metadata.registration_endpoint) return { how: 'DCR', note: 'dynamic client registration' };
  return { how: 'pre-registered', note: 'no registration endpoint: an app has to be made by hand (or the client is not allowed)' };
}

/** Probes one MCP server. `fetchImpl` is given so that it can be tried without a network. Never throws. */
export async function probeServer(target, { fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  const result = { id: target.id, name: target.name, url: target.url, initialize: null, resourceMetadata: null, authorizationServer: null, how: 'unknown', notes: [] };
  let headerUrl = '';
  try {
    const response = await withTimeout(fetchImpl, target.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: INITIALIZE }, timeoutMs);
    const challenge = response.headers?.get?.('www-authenticate') || '';
    headerUrl = resourceMetadataFromHeader(challenge);
    result.initialize = { status: response.status, wwwAuthenticate: challenge.slice(0, 300) };
    if (response.status !== 401) result.notes.push(`the first request was answered with ${response.status}, not 401`);
  } catch (error) {
    result.initialize = { status: 0, error: String(error?.message || error).slice(0, 120) };
    result.notes.push('the server could not be reached');
    return result;
  }

  let resource = null;
  for (const candidate of resourceMetadataCandidates(target.url, headerUrl)) {
    const found = await getJson(fetchImpl, candidate, timeoutMs);
    if (found.body) {
      resource = found;
      break;
    }
  }
  if (resource) {
    result.resourceMetadata = { url: resource.url, resource: resource.body.resource, authorizationServers: resource.body.authorization_servers || [], scopes: resource.body.scopes_supported || [] };
  } else {
    result.notes.push('no protected resource metadata was found');
  }

  const issuer = resource?.body?.authorization_servers?.[0] || new URL(target.url).origin;
  let server = null;
  for (const candidate of authorizationMetadataCandidates(issuer)) {
    const found = await getJson(fetchImpl, candidate, timeoutMs);
    if (found.body && (found.body.authorization_endpoint || found.body.token_endpoint)) {
      server = found;
      break;
    }
  }
  if (server) {
    const body = server.body;
    result.authorizationServer = {
      url: server.url,
      issuer: body.issuer,
      authorizationEndpoint: body.authorization_endpoint,
      tokenEndpoint: body.token_endpoint,
      registrationEndpoint: body.registration_endpoint || null,
      cimd: body.client_id_metadata_document_supported === true,
      pkce: body.code_challenge_methods_supported || [],
      scopes: body.scopes_supported || [],
      grantTypes: body.grant_types_supported || [],
      tokenAuthMethods: body.token_endpoint_auth_methods_supported || [],
      revocationEndpoint: body.revocation_endpoint || null
    };
  } else {
    result.notes.push('no authorization server metadata was found');
  }
  Object.assign(result, { how: classify(server?.body).how });
  if (result.authorizationServer && !result.authorizationServer.pkce.includes('S256')) result.notes.push('PKCE S256 is not announced');
  if (result.authorizationServer && !result.authorizationServer.grantTypes.includes('refresh_token') && result.authorizationServer.grantTypes.length) result.notes.push('refresh_token is not announced');
  return result;
}

const cell = (value, width) => String(value ?? '').slice(0, width).padEnd(width);

/** A table of the results, for a person to read. */
export function formatTable(results) {
  const rows = [['Server', 'Reached', 'Registration', 'PKCE S256', 'Refresh', 'Revocation', 'Scopes announced']];
  for (const item of results) {
    const server = item.authorizationServer;
    rows.push([
      item.name,
      item.initialize?.status ? `HTTP ${item.initialize.status}` : 'no',
      item.how,
      server ? (server.pkce.includes('S256') ? 'yes' : 'no') : '-',
      server ? (server.grantTypes.includes('refresh_token') ? 'yes' : server.grantTypes.length ? 'no' : '?') : '-',
      server ? (server.revocationEndpoint ? 'yes' : 'no') : '-',
      server ? (server.scopes.length ? server.scopes.slice(0, 6).join(' ') : 'none') : '-'
    ]);
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => String(row[column]).length)));
  const lines = rows.map((row) => row.map((value, column) => cell(value, widths[column])).join('  ').trimEnd());
  lines.splice(1, 0, widths.map((width) => '-'.repeat(width)).join('  '));
  const notes = results.filter((item) => item.notes.length).map((item) => `${item.name}: ${item.notes.join('; ')}`);
  return [...lines, '', ...(notes.length ? ['Notes:', ...notes.map((line) => `  ${line}`)] : [])].join('\n');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const results = [];
  for (const target of TARGETS) results.push(await probeServer(target));
  console.log(process.argv.includes('--json') ? JSON.stringify(results, null, 2) : formatTable(results));
}
