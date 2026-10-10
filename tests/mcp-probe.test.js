import assert from 'node:assert/strict';
import test from 'node:test';

import { TARGETS, authorizationMetadataCandidates, classify, formatTable, probeServer, resourceMetadataCandidates, resourceMetadataFromHeader } from '../scripts/mcp-probe.mjs';

const response = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
});

// A network of a few servers: `routes` maps "METHOD url" to an answer; anything else is a 404.
const network = (routes, calls = []) => async (url, options = {}) => {
  const key = `${options.method || 'GET'} ${url}`;
  calls.push(key);
  if (routes[key] instanceof Error) throw routes[key];
  return routes[key] || response(404, 'not found');
};

test('the six connectors of the first design are the ones that are probed, each at its official address', () => {
  assert.deepEqual(TARGETS.map((target) => target.id), ['notion', 'linear', 'context7', 'upstash', 'vercel', 'github']);
  for (const target of TARGETS) assert.match(target.url, /^https:\/\//);
});

test('the address of the resource metadata comes from the challenge of a 401, or from the well-known places in the order of RFC 9728', () => {
  assert.equal(resourceMetadataFromHeader('Bearer realm="x", resource_metadata="https://a.example/.well-known/oauth-protected-resource/mcp"'), 'https://a.example/.well-known/oauth-protected-resource/mcp');
  assert.equal(resourceMetadataFromHeader('Basic'), '');
  assert.deepEqual(resourceMetadataCandidates('https://a.example/mcp/'), ['https://a.example/.well-known/oauth-protected-resource/mcp', 'https://a.example/.well-known/oauth-protected-resource']);
  assert.deepEqual(resourceMetadataCandidates('https://a.example', 'https://a.example/x'), ['https://a.example/x', 'https://a.example/.well-known/oauth-protected-resource']);
  assert.deepEqual(authorizationMetadataCandidates('https://auth.example'), ['https://auth.example/.well-known/oauth-authorization-server', 'https://auth.example/.well-known/openid-configuration']);
  assert.deepEqual(authorizationMetadataCandidates('https://auth.example/tenant'), [
    'https://auth.example/.well-known/oauth-authorization-server/tenant',
    'https://auth.example/.well-known/openid-configuration/tenant',
    'https://auth.example/tenant/.well-known/openid-configuration'
  ]);
});

test('a client may introduce itself by CIMD, by DCR, or only by an app made by hand', () => {
  assert.equal(classify({ client_id_metadata_document_supported: true, registration_endpoint: 'https://x/r' }).how, 'CIMD', 'CIMD is preferred when both are there');
  assert.equal(classify({ registration_endpoint: 'https://x/r' }).how, 'DCR');
  assert.equal(classify({ authorization_endpoint: 'https://x/a' }).how, 'pre-registered');
  assert.equal(classify(null).how, 'unknown');
});

test('a server that registers clients by itself is found through the 401, the resource metadata and the authorization server', async () => {
  const calls = [];
  const fetchImpl = network({
    'POST https://mcp.a.example/mcp': response(401, '', { 'www-authenticate': 'Bearer resource_metadata="https://mcp.a.example/.well-known/oauth-protected-resource"' }),
    'GET https://mcp.a.example/.well-known/oauth-protected-resource': response(200, { resource: 'https://mcp.a.example/mcp', authorization_servers: ['https://auth.a.example'], scopes_supported: ['read'] }),
    'GET https://auth.a.example/.well-known/oauth-authorization-server': response(200, {
      issuer: 'https://auth.a.example', authorization_endpoint: 'https://auth.a.example/authorize', token_endpoint: 'https://auth.a.example/token', registration_endpoint: 'https://auth.a.example/register',
      code_challenge_methods_supported: ['S256'], grant_types_supported: ['authorization_code', 'refresh_token'], scopes_supported: ['read', 'write'], revocation_endpoint: 'https://auth.a.example/revoke'
    })
  }, calls);
  const result = await probeServer({ id: 'a', name: 'A', url: 'https://mcp.a.example/mcp' }, { fetchImpl });
  assert.equal(result.how, 'DCR');
  assert.equal(result.initialize.status, 401);
  assert.equal(result.authorizationServer.registrationEndpoint, 'https://auth.a.example/register');
  assert.deepEqual(result.authorizationServer.pkce, ['S256']);
  assert.equal(result.authorizationServer.revocationEndpoint, 'https://auth.a.example/revoke');
  assert.deepEqual(result.notes, []);
  assert.deepEqual(calls.filter((call) => call.startsWith('POST')), ['POST https://mcp.a.example/mcp'], 'the only request that is not a read is the first request every client sends');
  assert.equal(calls.some((call) => /register$/.test(call) && call.startsWith('POST https://auth')), false, 'nothing is registered');
});

test('a server that announces CIMD, and one that offers nothing at all, are told apart; what is missing is said', async () => {
  const fetchImpl = network({
    'POST https://cimd.example/mcp': response(401, '', {}),
    'GET https://cimd.example/.well-known/oauth-protected-resource/mcp': response(200, { authorization_servers: ['https://cimd.example'] }),
    'GET https://cimd.example/.well-known/oauth-authorization-server': response(200, { authorization_endpoint: 'https://cimd.example/a', token_endpoint: 'https://cimd.example/t', client_id_metadata_document_supported: true, code_challenge_methods_supported: ['plain'], grant_types_supported: ['authorization_code'] }),
    'POST https://closed.example/mcp': response(401, '', {}),
    'GET https://closed.example/.well-known/oauth-protected-resource': response(200, { authorization_servers: ['https://closed.example'] }),
    'GET https://closed.example/.well-known/openid-configuration': response(200, { authorization_endpoint: 'https://closed.example/a', token_endpoint: 'https://closed.example/t', grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'] })
  });
  const cimd = await probeServer({ id: 'c', name: 'C', url: 'https://cimd.example/mcp' }, { fetchImpl });
  assert.equal(cimd.how, 'CIMD');
  assert.ok(cimd.notes.includes('PKCE S256 is not announced'));
  assert.ok(cimd.notes.includes('refresh_token is not announced'));
  const closed = await probeServer({ id: 'x', name: 'X', url: 'https://closed.example/mcp' }, { fetchImpl });
  assert.equal(closed.how, 'pre-registered');
  assert.equal(closed.authorizationServer.registrationEndpoint, null);
});

test('a server that cannot be reached, or has no metadata, is reported and never throws', async () => {
  const down = await probeServer({ id: 'd', name: 'D', url: 'https://down.example/mcp' }, { fetchImpl: network({ 'POST https://down.example/mcp': new Error('connect ECONNREFUSED') }) });
  assert.equal(down.how, 'unknown');
  assert.equal(down.initialize.status, 0);
  assert.ok(down.notes.includes('the server could not be reached'));
  const bare = await probeServer({ id: 'b', name: 'B', url: 'https://bare.example/mcp' }, { fetchImpl: network({ 'POST https://bare.example/mcp': response(200, '{}') }) });
  assert.equal(bare.how, 'unknown');
  assert.ok(bare.notes.some((note) => /not 401/.test(note)));
  assert.ok(bare.notes.includes('no protected resource metadata was found'));
  assert.ok(bare.notes.includes('no authorization server metadata was found'));
});

test('the table says for each server how it was reached and how a new client may introduce itself', () => {
  const table = formatTable([
    { name: 'Alpha', initialize: { status: 401 }, how: 'DCR', notes: [], authorizationServer: { pkce: ['S256'], grantTypes: ['refresh_token'], revocationEndpoint: 'https://r', scopes: ['read'] } },
    { name: 'Beta', initialize: { status: 0 }, how: 'unknown', notes: ['the server could not be reached'], authorizationServer: null }
  ]);
  assert.match(table, /Alpha +HTTP 401 +DCR +yes +yes +yes +read/);
  assert.match(table, /Beta +no +unknown/);
  assert.match(table, /Notes:\n {2}Beta: the server could not be reached/);
});
