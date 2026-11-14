import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { OAuthError, buildAuthorizationUrl, discover, exchangeCode, hashState, pkcePair, refreshTokens, resolveClient, revokeToken } from '../../server/mcp/oauth.js';
import { CONNECTORS, connectorProblems, defaultToolState, getConnector, hasReadonlyLogin, loginScopes, toolKind } from '../../src/data/connector-catalog.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake network: `routes` maps "METHOD url" (or just "url" for GET) to a Response or a function of the request. Everything else is a 404. */
function fakeNetwork(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url: String(url), method, headers: options.headers || {}, body: options.body ? String(options.body) : '' });
    const route = routes[`${method} ${url}`] ?? (method === 'GET' ? routes[String(url)] : undefined);
    if (route === undefined) return new Response('not found', { status: 404 });
    return typeof route === 'function' ? route({ url: String(url), options }) : route.clone();
  };
  return { fetchImpl, calls };
}

const LINEAR = 'https://mcp.linear.app/mcp';
const serverMetadata = (extra = {}) => ({
  issuer: 'https://auth.linear.app',
  authorization_endpoint: 'https://auth.linear.app/authorize',
  token_endpoint: 'https://auth.linear.app/token',
  revocation_endpoint: 'https://auth.linear.app/revoke',
  code_challenge_methods_supported: ['S256'],
  client_id_metadata_document_supported: true,
  ...extra
});
const linearRoutes = (metadata = serverMetadata(), resource = { resource: 'https://mcp.linear.app', authorization_servers: ['https://auth.linear.app'] }) => ({
  'https://mcp.linear.app/.well-known/oauth-protected-resource/mcp': json(resource),
  'https://auth.linear.app/.well-known/oauth-authorization-server': json(metadata)
});

test('the catalog is right: every entry has its five languages, and the tools are told read from write', () => {
  assert.ok(CONNECTORS.length >= 2);
  for (const connector of CONNECTORS) assert.deepEqual(connectorProblems(connector), [], connector.id);
  const notion = getConnector('notion');
  const linear = getConnector('linear');
  assert.equal(toolKind(notion, 'notion-search'), 'read');
  assert.equal(toolKind(notion, 'notion-create-pages'), 'write');
  assert.equal(toolKind(linear, 'list_issues'), 'read');
  assert.equal(toolKind(linear, 'get_issue'), 'read');
  assert.equal(toolKind(linear, 'create_issue'), 'write');
  assert.equal(toolKind(linear, 'delete_comment'), 'write');
  // A name that only has a reading word somewhere is not a read, and what is not known is a write (it asks).
  assert.equal(toolKind(linear, 'update-view'), 'write');
  assert.equal(toolKind(linear, 'get_and_delete_everything'), 'read', 'a name that starts with a reading word is a read: the services of the catalog do not give such tools');
  assert.equal(toolKind(linear, 'archive_issue'), 'write');
  assert.equal(toolKind(linear, ''), 'write');
  assert.equal(toolKind(null, 'list_things'), 'read');
  assert.equal(defaultToolState(linear, 'get_issue'), 'allow');
  assert.equal(defaultToolState(linear, 'create_issue'), 'ask');
  assert.equal(notion.registration, 'dcr');
  assert.equal(linear.registration, undefined);
  assert.equal(hasReadonlyLogin(linear), true);
  assert.equal(hasReadonlyLogin(notion), false);
  assert.deepEqual(loginScopes(linear, 'readonly'), ['read']);
  assert.deepEqual(loginScopes(linear, 'readwrite'), ['read', 'write']);
  assert.deepEqual(loginScopes(notion, 'readonly'), [], 'a service with no read-only login gets the one login it has');
});

test('Supabase, Hugging Face, Miro and Canva: their own endpoints, a registration first, and the tools told read from write', () => {
  const [supabase, huggingface, miro, canva] = ['supabase', 'huggingface', 'miro', 'canva'].map(getConnector);
  assert.deepEqual([supabase.endpoint, huggingface.endpoint, miro.endpoint, canva.endpoint], ['https://mcp.supabase.com/mcp', 'https://huggingface.co/mcp', 'https://mcp.miro.com/', 'https://api.canva.com/connect/v1/mcp']);
  for (const connector of [supabase, huggingface, miro, canva]) {
    assert.deepEqual(connectorProblems(connector), [], connector.id);
    assert.equal(connector.registration, 'dcr', connector.id);
    assert.equal(hasReadonlyLogin(connector), connector.id === 'canva', `${connector.id}: one login (what a reply may do is the person's setting for each tool), except where the service names scopes for reading`);
    assert.ok(!connector.pending, connector.id);
  }
  // Canva answers "Internal Server Error" to a login that names no scope: the scopes it announces are asked for, and the read-only login has none that writes.
  assert.ok(loginScopes(canva, 'readwrite').includes('design:content:write'));
  assert.ok(loginScopes(canva, 'readonly').length > 0 && loginScopes(canva, 'readonly').every((scope) => !/:write$/.test(scope)));
  assert.equal(supabase.category, 'dev');
  assert.equal(miro.category, 'design');
  assert.equal(canva.category, 'design');
  // Supabase: looking is allowed; what runs SQL, changes a migration, deploys or creates asks, and so does a tool that is not known.
  for (const name of ['list_projects', 'list_tables', 'get_project', 'search_docs', 'get_logs', 'query_logs', 'generate_typescript_types']) assert.equal(defaultToolState(supabase, name), 'allow', name);
  for (const name of ['execute_sql', 'apply_migration', 'create_project', 'deploy_edge_function', 'delete_branch', 'something_new']) assert.equal(defaultToolState(supabase, name), 'ask', name);
  // Hugging Face: searching the hub is allowed; calling a Space sends the input to someone else's app, so it asks.
  for (const name of ['model_search', 'paper_search', 'hf_doc_fetch', 'hf_whoami']) assert.equal(defaultToolState(huggingface, name), 'allow', name);
  for (const name of ['dynamic_space', 'gr1_flux1_schnell_infer']) assert.equal(defaultToolState(huggingface, name), 'ask', name);
  assert.equal(defaultToolState(miro, 'board_list_items'), 'allow');
  assert.equal(defaultToolState(miro, 'diagram_create'), 'ask');
  assert.equal(defaultToolState(canva, 'search-designs'), 'allow');
  for (const name of ['generate-design', 'export-design', 'commit-editing-transaction']) assert.equal(defaultToolState(canva, name), 'ask', name);
});

test('Context7, Upstash and Vercel: their own endpoints, one login each (no read-only is forced), and the tools told read from write', () => {
  const context7 = getConnector('context7');
  const upstash = getConnector('upstash');
  const vercel = getConnector('vercel');
  assert.deepEqual([context7.endpoint, upstash.endpoint, vercel.endpoint], ['https://mcp.context7.com/mcp/oauth', 'https://mcp.upstash.com/mcp', 'https://mcp.vercel.com']);
  for (const connector of [context7, upstash, vercel]) {
    assert.equal(hasReadonlyLogin(connector), false, `${connector.id}: the person is not forced to a read-only login`);
    assert.ok(loginScopes(connector, 'readwrite').includes('offline_access'), `${connector.id}: asks for a refresh token`);
    assert.equal(connector.registration, undefined);
    assert.equal(connector.category, 'dev');
  }
  // Context7 only looks documentation up.
  for (const name of ['resolve-library-id', 'get-library-docs', 'query-docs']) assert.equal(defaultToolState(context7, name), 'allow', name);
  // Upstash: what only reads is allowed; what runs commands, creates, deletes or restores asks, and so does a tool that is not known.
  assert.equal(defaultToolState(upstash, 'redis_database_list_databases'), 'allow');
  assert.equal(defaultToolState(upstash, 'redis_database_get_details'), 'allow');
  for (const name of ['redis_database_run_redis_commands', 'redis_database_delete', 'redis_database_create_new', 'something_new']) assert.equal(defaultToolState(upstash, name), 'ask', name);
  // Vercel: listing and getting are reads; deploying and buying a domain ask, and so does the link that opens a protected deployment.
  for (const name of ['list_projects', 'get_deployment', 'get_runtime_logs', 'search_vercel_documentation', 'check_domain_availability_and_price']) assert.equal(defaultToolState(vercel, name), 'allow', name);
  for (const name of ['deploy_to_vercel', 'buy_domain', 'get_access_to_vercel_url', 'create_project', 'update_project']) assert.equal(defaultToolState(vercel, name), 'ask', name);
});

test('a registration that is refused as not right is asked again with only what a registration needs, and what the service says about a refusal is kept as plain short text', async () => {
  const redirectUri = 'https://api.noureon.com/mcp/callback';
  const cimdUrl = 'https://noureon.com/.well-known/oauth-client.json';
  const dcr = { cimd: false, registrationEndpoint: 'https://auth.example.com/register', issuer: 'https://auth.example.com' };
  const bodies = [];
  const picky = async (url, options = {}) => {
    if (options.method !== 'POST') return new Response('no', { status: 404 });
    const body = JSON.parse(options.body);
    bodies.push(body);
    return 'logo_uri' in body ? json({ error: 'invalid_client_metadata' }, 400) : json({ client_id: 'issued-id' }, 201);
  };
  const client = await resolveClient({ connectorId: 'v', metadata: dcr, redirectUri, cimdUrl, identity: { clientUri: 'https://noureon.com', logoUri: 'https://noureon.com/logo.png', tosUri: 'https://noureon.com/terms', policyUri: 'https://noureon.com/privacy' }, fetchImpl: picky });
  assert.deepEqual(client, { clientId: 'issued-id', how: 'dcr' });
  assert.equal(bodies.length, 2);
  assert.deepEqual(Object.keys(bodies[1]).sort(), ['client_name', 'grant_types', 'redirect_uris', 'response_types', 'token_endpoint_auth_method']);
  // A refusal of the plain request is the end; its words are kept, cut and with only plain characters.
  const never = async () => json({ error: 'invalid_redirect_uri', error_description: `This redirect\nis not allowed \u0007${'x'.repeat(300)}` }, 400);
  await assert.rejects(resolveClient({ connectorId: 'v', metadata: dcr, redirectUri, cimdUrl, identity: { logoUri: 'https://noureon.com/logo.png' }, fetchImpl: never }), (error) => error.code === 'registration_refused' && error.status === 400 && /^invalid_redirect_uri: This redirect is not allowed x+$/.test(error.info) && error.info.length <= 60 + 2 + 120);
});

test('a registration that gives a client secret (Supabase makes the client a confidential one) is kept with the client, and the way the service wants it sent too', async () => {
  const metadata = { issuer: 'https://api.supabase.example', registrationEndpoint: 'https://api.supabase.example/register', cimd: false };
  const kept = new Map();
  const clientStore = { get: async (key) => kept.get(key) || null, set: async (key, value) => { kept.set(key, value); } };
  let registrations = 0;
  const fetchImpl = async () => { registrations += 1; return json({ client_id: 'uuid-1', client_secret: 'sbs_secret', token_endpoint_auth_method: 'client_secret_post' }, 201); };
  const args = { connectorId: 'supabase', metadata, redirectUri: 'https://api.noureon.com/mcp/callback', cimdUrl: '', clientStore, prefer: 'dcr', fetchImpl };
  const first = await resolveClient(args);
  assert.deepEqual([first.clientId, first.clientSecret, first.auth, first.how], ['uuid-1', 'sbs_secret', 'post', 'dcr']);
  // The second login does not register again and has the same secret.
  const second = await resolveClient(args);
  assert.deepEqual([second.clientId, second.clientSecret, second.auth], ['uuid-1', 'sbs_secret', 'post']);
  assert.equal(registrations, 1);
  // A registration that does not say how, and a service that only takes the secret in the body, is sent it in the body; one that takes both, in the header.
  const bodyOnly = await resolveClient({ ...args, connectorId: 'body-only', metadata: { ...metadata, authMethods: ['client_secret_post'] }, fetchImpl: async () => json({ client_id: 'uuid-3', client_secret: 's3' }, 201) });
  assert.equal(bodyOnly.auth, 'post');
  const both = await resolveClient({ ...args, connectorId: 'both', metadata: { ...metadata, authMethods: ['client_secret_basic', 'client_secret_post'] }, fetchImpl: async () => json({ client_id: 'uuid-4', client_secret: 's4' }, 201) });
  assert.equal(both.auth, undefined);
  // A public client has no secret to keep.
  const plain = await resolveClient({ ...args, connectorId: 'other', fetchImpl: async () => json({ client_id: 'uuid-2' }, 201) });
  assert.deepEqual([plain.clientId, plain.clientSecret, plain.auth], ['uuid-2', undefined, undefined]);
});

test('a service that refuses the field `resource` of a token request (422) is asked again without it, and a refusal says what the service said', async () => {
  const metadata = { tokenEndpoint: 'https://api.supabase.example/oauth/token', resource: 'https://mcp.supabase.example/mcp' };
  const forms = [];
  const strict = async (url, options) => {
    const form = Object.fromEntries(new URLSearchParams(String(options.body)));
    forms.push(form);
    return form.resource ? json({ message: 'property resource should not exist' }, 422) : json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, token_type: 'bearer' });
  };
  const args = { metadata, client: { clientId: 'c1' }, redirectUri: 'https://api.noureon.com/mcp/callback', code: 'c', verifier: 'v'.repeat(43) };
  const tokens = await exchangeCode({ ...args, fetchImpl: strict });
  assert.equal(tokens.accessToken, 'AT');
  assert.deepEqual(forms.map((form) => Boolean(form.resource)), [true, false], 'once with it, once without');
  // A refusal that has another reason stays a refusal, with the service's words.
  const refusing = async () => json({ message: 'code_verifier is not valid' }, 422);
  await assert.rejects(exchangeCode({ ...args, fetchImpl: refusing }), (error) => error.code === 'token_refused' && error.status === 422 && error.info === 'code_verifier is not valid');
  // No second try for a refusal that is not about the shape of the request.
  let calls = 0;
  await assert.rejects(exchangeCode({ ...args, fetchImpl: async () => { calls += 1; return json({ error: 'invalid_grant' }, 400); } }), (error) => error.code === 'invalid_grant');
  assert.equal(calls, 1);
});

test('a service that wants the secret in the body (GitHub) gets it there and not in the header, and its refusal that comes with a 200 is a refusal', async () => {
  const metadata = { tokenEndpoint: 'https://github.com/login/oauth/access_token', resource: 'https://api.githubcopilot.com/mcp/' };
  const seen = [];
  const answer = (body, status = 200) => async (url, options) => { seen.push({ headers: options.headers, form: Object.fromEntries(new URLSearchParams(String(options.body))) }); return json(body, status); };
  const client = { clientId: 'Ov23liabc', clientSecret: 'the-secret', auth: 'post' };
  const tokens = await exchangeCode({ metadata, client, redirectUri: 'https://api.noureon.com/mcp/callback', code: 'c', verifier: 'v'.repeat(43), fetchImpl: answer({ access_token: 'ghu_1', refresh_token: 'ghr_1', expires_in: 28800, token_type: 'bearer' }) });
  assert.deepEqual([tokens.accessToken, tokens.refreshToken, tokens.expiresInSeconds], ['ghu_1', 'ghr_1', 28800]);
  assert.equal(seen[0].form.client_secret, 'the-secret');
  assert.equal(seen[0].headers.authorization, undefined, 'the secret is in one place only');
  // The default is the header.
  await exchangeCode({ metadata, client: { clientId: 'x', clientSecret: 'other' }, redirectUri: 'https://api.noureon.com/mcp/callback', code: 'c', verifier: 'v'.repeat(43), fetchImpl: answer({ access_token: 'AT', token_type: 'bearer' }) });
  assert.match(seen[1].headers.authorization, /^Basic /);
  assert.equal(seen[1].form.client_secret, undefined);
  // GitHub answers a refused code with 200 and an error in the body.
  await assert.rejects(exchangeCode({ metadata, client, redirectUri: 'https://api.noureon.com/mcp/callback', code: 'bad', verifier: 'v'.repeat(43), fetchImpl: answer({ error: 'bad_verification_code', error_description: 'x' }) }), (error) => error.code === 'bad_verification_code');
  await assert.rejects(refreshTokens({ metadata, client, refreshToken: 'old', fetchImpl: answer({ error: 'invalid_grant' }) }), (error) => error.code === 'invalid_grant');
  await refreshTokens({ metadata, client, refreshToken: 'ghr_1', fetchImpl: answer({ access_token: 'ghu_2', refresh_token: 'ghr_2', expires_in: 28800, token_type: 'bearer' }) });
  assert.deepEqual([seen.at(-1).form.grant_type, seen.at(-1).form.refresh_token, seen.at(-1).form.client_secret], ['refresh_token', 'ghr_1', 'the-secret']);
});

test('GitHub: its login is one for reading and writing with the secret in the body, and its tools are told read from write', () => {
  const github = getConnector('github');
  assert.equal(github.endpoint, 'https://api.githubcopilot.com/mcp/');
  assert.equal(github.clientAuth, 'post');
  assert.equal(hasReadonlyLogin(github), false);
  assert.deepEqual(loginScopes(github, 'readwrite'), ['repo', 'read:org', 'read:user']);
  for (const name of ['get_me', 'get_file_contents', 'list_issues', 'search_code', 'issue_read', 'pull_request_read', 'actions_get', 'actions_list']) assert.equal(defaultToolState(github, name), 'allow', name);
  for (const name of ['create_issue', 'issue_write', 'merge_pull_request', 'push_files', 'delete_file', 'create_or_update_file', 'actions_run_trigger', 'something_new']) assert.equal(defaultToolState(github, name), 'ask', name);
});

test('a PKCE pair has a verifier of 43 or more characters and its S256 challenge; the states hash the same way and are never equal', () => {
  const { verifier, challenge } = pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  assert.notEqual(pkcePair().verifier, verifier);
  assert.match(hashState('abc'), /^[0-9a-f]{64}$/);
});

test('discovery reads the resource metadata, then the metadata of the login server, and says how the client can be known', async () => {
  const { fetchImpl } = fakeNetwork(linearRoutes());
  const metadata = await discover(LINEAR, { fetchImpl });
  assert.equal(metadata.authorizationEndpoint, 'https://auth.linear.app/authorize');
  assert.equal(metadata.tokenEndpoint, 'https://auth.linear.app/token');
  assert.equal(metadata.revocationEndpoint, 'https://auth.linear.app/revoke');
  assert.equal(metadata.cimd, true);
  assert.equal(metadata.issuer, 'https://auth.linear.app');
  assert.equal(metadata.resource, 'https://mcp.linear.app');
});

test('discovery falls back to the host itself, to OpenID Connect discovery, and refuses what is not safe', async () => {
  // No resource metadata at all: the login server is the service's own host, found by OpenID Connect discovery.
  const bare = fakeNetwork({ 'https://mcp.linear.app/.well-known/openid-configuration': json(serverMetadata({ issuer: 'https://mcp.linear.app' })) });
  assert.equal((await discover(LINEAR, { fetchImpl: bare.fetchImpl })).issuer, 'https://mcp.linear.app');
  // Nothing found.
  await assert.rejects(discover(LINEAR, { fetchImpl: fakeNetwork({}).fetchImpl }), (error) => error.code === 'no_metadata');
  // No S256.
  await assert.rejects(discover(LINEAR, { fetchImpl: fakeNetwork(linearRoutes(serverMetadata({ code_challenge_methods_supported: ['plain'] }))).fetchImpl }), (error) => error.code === 'no_pkce');
  // A resource of another host, an issuer that is not the one asked, and addresses that are not public https.
  await assert.rejects(discover(LINEAR, { fetchImpl: fakeNetwork(linearRoutes(serverMetadata(), { resource: 'https://evil.example', authorization_servers: ['https://auth.linear.app'] })).fetchImpl }), (error) => error.code === 'bad_metadata');
  await assert.rejects(discover(LINEAR, { fetchImpl: fakeNetwork(linearRoutes(serverMetadata({ issuer: 'https://other.example' }))).fetchImpl }), (error) => error.code === 'bad_metadata');
  for (const bad of ['http://auth.linear.app/token', 'https://127.0.0.1/token', 'https://localhost/token', 'https://intranet/token', 'https://user:pw@auth.linear.app/token', 'https://10.0.0.5/token']) {
    await assert.rejects(discover(LINEAR, { fetchImpl: fakeNetwork(linearRoutes(serverMetadata({ token_endpoint: bad }))).fetchImpl }), (error) => error instanceof OAuthError && error.code === 'bad_metadata', bad);
  }
  await assert.rejects(discover('http://mcp.linear.app/mcp', { fetchImpl: fakeNetwork({}).fetchImpl }), (error) => error.code === 'bad_metadata');
});

test('a redirect in discovery is followed only to public https addresses, one at a time', async () => {
  const moved = (location) => new Response('', { status: 302, headers: { location } });
  const followed = fakeNetwork({
    'https://mcp.linear.app/.well-known/oauth-protected-resource/mcp': moved('https://mcp.linear.app/meta'),
    'https://mcp.linear.app/meta': json({ resource: 'https://mcp.linear.app', authorization_servers: ['https://auth.linear.app'] }),
    'https://auth.linear.app/.well-known/oauth-authorization-server': json(serverMetadata())
  });
  assert.equal((await discover(LINEAR, { fetchImpl: followed.fetchImpl })).issuer, 'https://auth.linear.app');
  const inward = fakeNetwork({
    ...linearRoutes(),
    'https://mcp.linear.app/.well-known/oauth-protected-resource/mcp': moved('http://169.254.169.254/latest/meta-data'),
    'https://auth.linear.app/.well-known/oauth-authorization-server': moved('https://localhost/metadata')
  });
  await discover(LINEAR, { fetchImpl: inward.fetchImpl }).catch(() => null);
  assert.ok(inward.calls.every((call) => call.url.startsWith('https://') && !call.url.includes('169.254') && !call.url.includes('localhost')), 'nothing inside was asked');
  const loop = fakeNetwork({ 'https://mcp.linear.app/.well-known/oauth-protected-resource/mcp': moved('https://mcp.linear.app/.well-known/oauth-protected-resource/mcp') });
  await discover(LINEAR, { fetchImpl: loop.fetchImpl }).catch(() => null);
  assert.ok(loop.calls.filter((call) => call.url.endsWith('oauth-protected-resource/mcp')).length <= 4, 'a loop of redirects ends');
});

test('the client is known the way the specification prefers: by hand, then by our metadata document, then by registering', async () => {
  const redirectUri = 'https://api.noureon.com/mcp/callback';
  const cimdUrl = 'https://noureon.com/.well-known/oauth-client.json';
  const cimd = { cimd: true, registrationEndpoint: 'https://auth.example.com/register', issuer: 'https://auth.example.com' };
  assert.deepEqual(await resolveClient({ connectorId: 'github', metadata: cimd, redirectUri, cimdUrl, preregistered: { github: { clientId: 'gh-id', clientSecret: 'gh-secret' } } }), { clientId: 'gh-id', clientSecret: 'gh-secret', how: 'preregistered' });
  assert.deepEqual(await resolveClient({ connectorId: 'linear', metadata: cimd, redirectUri, cimdUrl }), { clientId: cimdUrl, how: 'cimd' });

  const registered = [];
  const network = fakeNetwork({ 'POST https://auth.example.com/register': ({ options }) => { registered.push(JSON.parse(options.body)); return json({ client_id: 'dyn-1' }, 201); } });
  const store = new Map();
  const clientStore = { get: async (key) => store.get(key) || null, set: async (key, value) => { store.set(key, value); } };
  const dcr = { cimd: false, registrationEndpoint: 'https://auth.example.com/register', issuer: 'https://auth.example.com' };
  const first = await resolveClient({ connectorId: 'upstash', metadata: dcr, redirectUri, cimdUrl, clientStore, fetchImpl: network.fetchImpl });
  assert.deepEqual(first, { clientId: 'dyn-1', how: 'dcr' });
  assert.deepEqual(registered[0].redirect_uris, [redirectUri]);
  assert.equal(registered[0].token_endpoint_auth_method, 'none');
  // A registration is kept: the second person is not another registration.
  await resolveClient({ connectorId: 'upstash', metadata: dcr, redirectUri, cimdUrl, clientStore, fetchImpl: network.fetchImpl });
  assert.equal(registered.length, 1);
  // A service that shows the client on its consent screen: registered first (with the name and the picture), the document when the registration is refused.
  const identity = { clientUri: 'https://noureon.com', logoUri: 'https://noureon.com/logo.png', tosUri: 'https://noureon.com/terms', policyUri: 'https://noureon.com/privacy' };
  const sent = [];
  const both = { cimd: true, registrationEndpoint: 'https://auth.example.com/register', issuer: 'https://auth.example.com' };
  const registering = fakeNetwork({ 'POST https://auth.example.com/register': ({ options }) => { sent.push(JSON.parse(options.body)); return json({ client_id: 'dyn-notion' }, 201); } });
  assert.deepEqual(await resolveClient({ connectorId: 'notion', metadata: both, redirectUri, cimdUrl, identity, prefer: 'dcr', clientStore: { get: async () => null, set: async () => {} }, fetchImpl: registering.fetchImpl }), { clientId: 'dyn-notion', how: 'dcr' });
  assert.equal(sent[0].client_name, 'Noureon');
  assert.equal(sent[0].logo_uri, 'https://noureon.com/logo.png');
  assert.equal(sent[0].client_uri, 'https://noureon.com');
  assert.deepEqual(await resolveClient({ connectorId: 'notion', metadata: both, redirectUri, cimdUrl, prefer: 'dcr', fetchImpl: fakeNetwork({ 'POST https://auth.example.com/register': json({ error: 'nope' }, 400) }).fetchImpl }), { clientId: cimdUrl, how: 'cimd' }, 'refused: the document');
  assert.deepEqual(await resolveClient({ connectorId: 'notion', metadata: { ...both, registrationEndpoint: '' }, redirectUri, cimdUrl, prefer: 'dcr' }), { clientId: cimdUrl, how: 'cimd' }, 'no registration address: the document');
  await assert.rejects(resolveClient({ connectorId: 'x', metadata: { cimd: false, registrationEndpoint: 'https://auth.example.com/register', issuer: 'https://auth.example.com' }, redirectUri, cimdUrl, prefer: 'dcr', fetchImpl: fakeNetwork({ 'POST https://auth.example.com/register': json({}, 400) }).fetchImpl }), (error) => error.code === 'registration_refused', 'no document to fall back to');
  // A service that takes nothing, and one that refuses.
  await assert.rejects(resolveClient({ connectorId: 'x', metadata: { cimd: false, registrationEndpoint: '', issuer: 'https://a.example.com' }, redirectUri, cimdUrl }), (error) => error.code === 'no_client');
  await assert.rejects(resolveClient({ connectorId: 'y', metadata: dcr, redirectUri, cimdUrl, fetchImpl: fakeNetwork({ 'POST https://auth.example.com/register': json({ error: 'invalid_redirect_uri' }, 400) }).fetchImpl }), (error) => error.code === 'registration_refused');
});

test('the address to log in at has the PKCE challenge, the state, the resource and the scopes', () => {
  const metadata = { authorizationEndpoint: 'https://auth.linear.app/authorize', resource: 'https://mcp.linear.app' };
  const url = new URL(buildAuthorizationUrl({ metadata, clientId: 'https://noureon.com/.well-known/oauth-client.json', redirectUri: 'https://api.noureon.com/mcp/callback', scopes: ['read'], state: 'st', challenge: 'ch' }));
  assert.equal(url.origin + url.pathname, 'https://auth.linear.app/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge'), 'ch');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'st');
  assert.equal(url.searchParams.get('resource'), 'https://mcp.linear.app');
  assert.equal(url.searchParams.get('scope'), 'read');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://api.noureon.com/mcp/callback');
  const noScope = new URL(buildAuthorizationUrl({ metadata, clientId: 'c', redirectUri: 'https://x.example/cb', scopes: [], state: 's', challenge: 'c' }));
  assert.equal(noScope.searchParams.has('scope'), false);
});

test('a code is traded for tokens with the verifier and the resource; a refresh token is traded for new ones; a refusal says only what kind', async () => {
  const metadata = { tokenEndpoint: 'https://auth.linear.app/token', resource: 'https://mcp.linear.app' };
  const client = { clientId: 'cid' };
  const network = fakeNetwork({
    'POST https://auth.linear.app/token': ({ options }) => {
      const form = new URLSearchParams(String(options.body));
      if (form.get('grant_type') === 'authorization_code') return json({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, token_type: 'Bearer', scope: 'read write' });
      if (form.get('refresh_token') === 'RT1') return json({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, token_type: 'bearer' });
      return json({ error: 'invalid_grant', error_description: 'the token RT-secret is revoked' }, 400);
    }
  });
  const first = await exchangeCode({ metadata, client, redirectUri: 'https://api.noureon.com/mcp/callback', code: 'the-code', verifier: 'the-verifier', fetchImpl: network.fetchImpl });
  assert.deepEqual(first, { accessToken: 'AT1', refreshToken: 'RT1', expiresInSeconds: 3600, scope: 'read write' });
  const sent = new URLSearchParams(network.calls[0].body);
  assert.equal(sent.get('code_verifier'), 'the-verifier');
  assert.equal(sent.get('resource'), 'https://mcp.linear.app');
  assert.equal(sent.get('client_id'), 'cid');
  const second = await refreshTokens({ metadata, client, refreshToken: 'RT1', fetchImpl: network.fetchImpl });
  assert.equal(second.accessToken, 'AT2');
  assert.equal(second.refreshToken, 'RT2');
  await assert.rejects(refreshTokens({ metadata, client, refreshToken: 'dead', fetchImpl: network.fetchImpl }), (error) => error.code === 'invalid_grant' && !String(error.message).includes('RT-secret'));
  // A token of another kind, or none, is not a login.
  await assert.rejects(exchangeCode({ metadata, client, redirectUri: 'r', code: 'c', verifier: 'v', fetchImpl: fakeNetwork({ 'POST https://auth.linear.app/token': json({ access_token: 'x', token_type: 'mac' }) }).fetchImpl }), (error) => error.code === 'bad_response');
  await assert.rejects(exchangeCode({ metadata, client, redirectUri: 'r', code: 'c', verifier: 'v', fetchImpl: fakeNetwork({ 'POST https://auth.linear.app/token': json({}) }).fetchImpl }), (error) => error.code === 'bad_response');
  // A client with a secret is given to the service in the header.
  const secret = fakeNetwork({ 'POST https://auth.linear.app/token': json({ access_token: 'A', token_type: 'Bearer' }) });
  await exchangeCode({ metadata, client: { clientId: 'cid', clientSecret: 'sec' }, redirectUri: 'r', code: 'c', verifier: 'v', fetchImpl: secret.fetchImpl });
  assert.match(secret.calls[0].headers.authorization, /^Basic /);
  assert.equal(new URLSearchParams(secret.calls[0].body).has('client_secret'), false);
});

test('a token is revoked when the service has an address for it, and never throws', async () => {
  const metadata = { revocationEndpoint: 'https://auth.linear.app/revoke' };
  const network = fakeNetwork({ 'POST https://auth.linear.app/revoke': new Response('', { status: 200 }) });
  assert.equal(await revokeToken({ metadata, client: { clientId: 'cid' }, token: 'RT', fetchImpl: network.fetchImpl }), true);
  assert.equal(new URLSearchParams(network.calls[0].body).get('token'), 'RT');
  assert.equal(await revokeToken({ metadata: {}, client: { clientId: 'cid' }, token: 'RT', fetchImpl: network.fetchImpl }), false, 'no address: nothing is sent');
  assert.equal(await revokeToken({ metadata, client: { clientId: 'cid' }, token: 'RT', fetchImpl: async () => { throw new Error('down'); } }), false);
});
