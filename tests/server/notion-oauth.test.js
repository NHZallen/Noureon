import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { createKeyVault } from '../../server/key-vault.js';
import { createLogger } from '../../server/log.js';
import { NOTION_CONNECTOR_ID, NOTION_VERSION, NotionError, createNotionOAuth } from '../../server/notion/oauth.js';
import { createConnectorService } from '../../server/mcp/connections.js';

const A = '123e4567-e89b-12d3-a456-426614174000';
const B = '223e4567-e89b-12d3-a456-426614174001';
const CLIENT_ID = 'notion-client-id-0000';
const SECRET = 'secret_NOTION_CLIENT_SECRET_value_1234567890';
const REDIRECT = 'https://api.noureon.com/oauth/notion/callback';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeDb() {
  const rows = [];
  const matches = (filters) => (row) => Object.entries(filters || {}).every(([column, condition]) => {
    const [op, ...rest] = String(condition).split('.');
    return op === 'eq' ? String(row[column]) === rest.join('.') : true;
  });
  return {
    rows,
    select: async (table, { filters, limit } = {}) => rows.filter(matches(filters)).slice(0, limit || 1000).map((row) => ({ ...row })),
    upsert: async (table, row, { onConflict }) => {
      const keys = onConflict.split(',');
      const at = rows.findIndex((entry) => keys.every((key) => entry[key] === row[key]));
      if (at >= 0) rows[at] = { ...rows[at], ...row };
      else rows.push({ created_at: new Date().toISOString(), ...row });
    },
    remove: async (table, filters) => {
      for (let index = rows.length - 1; index >= 0; index -= 1) if (matches(filters)(rows[index])) rows.splice(index, 1);
    }
  };
}

/** Notion as a fake network: it gives a token per code, knows who a token is, and records every call. */
function fakeNotion({ failExchange = false, refuseRevoke = false } = {}) {
  const calls = [];
  let issued = 0;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: target, method: options.method || 'GET', headers: options.headers || {}, body });
    if (target === 'https://api.notion.com/v1/oauth/token') {
      if (failExchange || body?.grant_type !== 'authorization_code') return json({ error: 'invalid_grant', message: `the code ${body?.code} is bad` }, 400);
      issued += 1;
      return json({ access_token: `secret_token_${issued}_${body.code}`, token_type: 'bearer', bot_id: `bot-${issued}`, workspace_id: `ws-${issued}`, workspace_name: `Workspace ${issued}`, workspace_icon: 'https://example.com/icon.png', owner: { type: 'user', user: { object: 'user', person: { email: 'private@example.com' } } } });
    }
    if (target === 'https://api.notion.com/v1/oauth/revoke') return refuseRevoke ? json({}, 400) : json({}, 200);
    if (target === 'https://api.notion.com/v1/users/me') {
      const token = String(options.headers.authorization).replace('Bearer ', '');
      if (token === 'secret_dead') return json({ object: 'error' }, 401);
      return json({ object: 'user', type: 'bot', name: 'Noureon', bot: { workspace_name: `for ${token}` } });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetchImpl, calls };
}

function setup(options = {}) {
  const db = fakeDb();
  const vault = createKeyVault([{ version: 1, key: randomBytes(32).toString('base64') }]);
  const network = fakeNotion(options);
  const logs = [];
  const service = createNotionOAuth({ db, vault, fetchImpl: network.fetchImpl, log: (name, fields) => logs.push([name, fields]), config: { clientId: CLIENT_ID, clientSecret: SECRET, redirectUri: REDIRECT } });
  return { db, vault, network, service, logs };
}
const begin = async (service, user) => new URL((await service.startLogin(user)).url);

test('a login begins at Notion\'s own page with our client id, the callback address and a state that is not guessable; the secret is not in the address', async () => {
  const { service, db } = setup();
  const url = await begin(service, A);
  assert.equal(url.origin + url.pathname, 'https://api.notion.com/v1/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(url.searchParams.get('redirect_uri'), REDIRECT);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('owner'), 'user');
  assert.match(url.searchParams.get('state'), /^[A-Za-z0-9_-]{40,}$/);
  assert.ok(!url.toString().includes(SECRET));
  assert.notEqual(url.searchParams.get('state'), (await begin(service, A)).searchParams.get('state'));
  const row = db.rows.find((entry) => entry.user_id === A);
  assert.equal(row.connector_id, NOTION_CONNECTOR_ID);
  assert.ok(!JSON.stringify(row).includes(url.searchParams.get('state')), 'only a hash of the state is kept');
  assert.deepEqual(await service.status(A), { connected: false }, 'a login that has begun is not a connection');
});

test('the code is traded for a token with the secret in the Authorization header (and nowhere else); the token is kept sealed, and the person sees only the workspace', async () => {
  const { service, db, network } = setup();
  const state = (await begin(service, A)).searchParams.get('state');
  assert.deepEqual(await service.completeLogin({ state, code: 'the-code' }), { ok: true, returnTo: 'test' });
  const exchange = network.calls.find((call) => call.url.endsWith('/oauth/token'));
  assert.equal(exchange.method, 'POST');
  assert.equal(exchange.headers.authorization, `Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64')}`);
  assert.deepEqual(exchange.body, { grant_type: 'authorization_code', code: 'the-code', redirect_uri: REDIRECT });
  assert.equal(exchange.headers['notion-version'], NOTION_VERSION);
  assert.ok(!JSON.stringify(exchange.body).includes(SECRET), 'the secret is not in the body');
  const row = db.rows.find((entry) => entry.user_id === A);
  assert.equal(row.status, 'connected');
  assert.equal(row.state_hash, null, 'a state is used once');
  assert.equal(row.pending_envelope, null);
  assert.ok(!JSON.stringify(row).includes('secret_token_1') && !JSON.stringify(row).includes(SECRET), 'nothing in the clear');
  assert.ok(!JSON.stringify(row).includes('private@example.com'), 'the email of the owner is not kept');
  const status = await service.status(A);
  assert.deepEqual({ ...status, connectedAt: undefined }, { connected: true, needsLogin: false, workspaceName: 'Workspace 1', workspaceIcon: 'https://example.com/icon.png', connectedAt: undefined });
  assert.ok(!JSON.stringify(status).includes('secret_token'));
  assert.equal(await service.accessToken(A), 'secret_token_1_the-code');
});

test('a state that is wrong, used, old or of another kind connects nothing; a denial and a failed exchange say what kind and keep nothing', async () => {
  let time = 1_000_000;
  const db = fakeDb();
  const vault = createKeyVault([{ version: 1, key: randomBytes(32).toString('base64') }]);
  const network = fakeNotion();
  const service = createNotionOAuth({ db, vault, fetchImpl: network.fetchImpl, now: () => time, config: { clientId: CLIENT_ID, clientSecret: SECRET, redirectUri: REDIRECT } });
  for (const state of ['', 'short', undefined, 'x'.repeat(40), `${'a'.repeat(30)}!!`]) assert.deepEqual(await service.completeLogin({ state, code: 'c' }), { ok: false, error: 'bad_state' }, String(state));
  assert.equal(network.calls.length, 0, 'Notion is not asked for a state that is not ours');

  const first = (await begin(service, A)).searchParams.get('state');
  assert.deepEqual(await service.completeLogin({ state: first, error: 'access_denied' }), { ok: false, error: 'denied', returnTo: 'test' });
  assert.deepEqual(await service.completeLogin({ state: first, code: 'c' }), { ok: false, error: 'bad_state' }, 'used once, even for a denial');

  const second = (await begin(service, A)).searchParams.get('state');
  time += 11 * 60 * 1000;
  assert.deepEqual(await service.completeLogin({ state: second, code: 'c' }), { ok: false, error: 'expired', returnTo: 'test' });

  const third = (await begin(service, A)).searchParams.get('state');
  assert.deepEqual(await service.completeLogin({ state: third }), { ok: false, error: 'failed', returnTo: 'test' }, 'no code');
  assert.deepEqual((await service.status(A)).connected, false);

  const failing = fakeNotion({ failExchange: true });
  const logs = [];
  const broken = createNotionOAuth({ db, vault, fetchImpl: failing.fetchImpl, log: (name, fields) => logs.push(JSON.stringify([name, fields])), config: { clientId: CLIENT_ID, clientSecret: SECRET, redirectUri: REDIRECT } });
  const fourth = (await begin(broken, A)).searchParams.get('state');
  assert.deepEqual(await broken.completeLogin({ state: fourth, code: 'the-secret-code' }), { ok: false, error: 'failed', returnTo: 'test' });
  assert.equal((await broken.status(A)).connected, false);
  assert.ok(!logs.join('').includes(SECRET) && !logs.join('').includes('the-secret-code'), 'the log has neither the secret nor the code');
});

test('a state of the hosted MCP connector is not a state of this login, and the other way round', async () => {
  const { service, db, vault } = setup();
  const connectors = createConnectorService({ db, vault, fetchImpl: async () => new Response('', { status: 404 }), config: { redirectUri: 'https://api.noureon.com/mcp/callback', cimdUrl: 'https://noureon.com/.well-known/oauth-client.json' } });
  // A row of the hosted connector with a pending login of its own.
  const { hashState } = await import('../../server/mcp/oauth.js');
  const mcpState = 'm'.repeat(43);
  await db.upsert('user_mcp_connections', { user_id: A, connector_id: 'notion', status: 'pending', state_hash: hashState(mcpState), pending_envelope: 'x', pending_key_version: 1, pending_at: new Date().toISOString() }, { onConflict: 'user_id,connector_id' });
  assert.deepEqual(await service.completeLogin({ state: mcpState, code: 'c' }), { ok: false, error: 'bad_state' });
  assert.ok(db.rows.find((row) => row.connector_id === 'notion').state_hash, 'it is left alone');
  // And a state of ours at the callback of the hosted connector.
  const ours = (await begin(service, B)).searchParams.get('state');
  const outcome = await connectors.completeLogin({ state: ours, code: 'c' });
  assert.equal(outcome.ok, false);
  assert.equal((await service.status(B)).connected, false);
  assert.deepEqual((await connectors.list(A)).find((entry) => entry.id === 'notion').status, 'none', 'the hosted connector does not list this connection');
});

test('two people have two tokens that never meet: each call is for the person it is made for, and a sealed token cannot be moved to the other', async () => {
  const { service, db, vault } = setup();
  const a = (await begin(service, A)).searchParams.get('state');
  const b = (await begin(service, B)).searchParams.get('state');
  // The callbacks come in the other order: each state belongs to the person who began it.
  assert.deepEqual(await service.completeLogin({ state: b, code: 'code-b' }), { ok: true, returnTo: 'test' });
  assert.deepEqual(await service.completeLogin({ state: a, code: 'code-a' }), { ok: true, returnTo: 'test' });
  assert.equal(await service.accessToken(A), 'secret_token_2_code-a');
  assert.equal(await service.accessToken(B), 'secret_token_1_code-b');
  assert.equal((await service.status(A)).workspaceName, 'Workspace 2');
  assert.equal((await service.status(B)).workspaceName, 'Workspace 1');
  assert.equal((await service.whoami(A)).workspaceName, 'for secret_token_2_code-a');
  assert.equal((await service.whoami(B)).workspaceName, 'for secret_token_1_code-b');
  // The sealed token of A put in the row of B cannot be opened.
  const rowA = db.rows.find((row) => row.user_id === A);
  const rowB = db.rows.find((row) => row.user_id === B);
  const keep = { envelope: rowB.envelope, key_version: rowB.key_version };
  rowB.envelope = rowA.envelope;
  rowB.key_version = rowA.key_version;
  await assert.rejects(service.accessToken(B), (error) => error instanceof NotionError && error.code === 'not_connected');
  assert.deepEqual((await service.status(B)).connected, false);
  Object.assign(rowB, keep);
  // A's disconnection leaves B's token.
  await service.disconnect(A);
  assert.deepEqual(await service.status(A), { connected: false });
  assert.equal(await service.accessToken(B), 'secret_token_1_code-b');
  // The master key of another server opens nothing.
  const other = createNotionOAuth({ db, vault: createKeyVault([{ version: 1, key: randomBytes(32).toString('base64') }]), fetchImpl: fakeNotion().fetchImpl, config: { clientId: CLIENT_ID, clientSecret: SECRET, redirectUri: REDIRECT } });
  await assert.rejects(other.accessToken(B), (error) => error.code === 'not_connected');
  void vault;
});

test('disconnecting revokes the token at Notion when Notion accepts that, and deletes what is kept in any case; with nothing connected it is no error', async () => {
  const { service, db, network } = setup();
  await service.completeLogin({ state: (await begin(service, A)).searchParams.get('state'), code: 'c1' });
  assert.deepEqual(await service.disconnect(A), { revoked: true });
  const revoke = network.calls.find((call) => call.url.endsWith('/oauth/revoke'));
  assert.deepEqual(revoke.body, { token: 'secret_token_1_c1' });
  assert.equal(revoke.headers.authorization, `Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64')}`);
  assert.equal(db.rows.length, 0);
  assert.deepEqual(await service.disconnect(A), { revoked: false });
  const refusing = setup({ refuseRevoke: true });
  await refusing.service.completeLogin({ state: (await begin(refusing.service, A)).searchParams.get('state'), code: 'c2' });
  assert.deepEqual(await refusing.service.disconnect(A), { revoked: false });
  assert.equal(refusing.db.rows.length, 0, 'deleted all the same');
});

test('a token Notion no longer accepts turns the connection into one that needs a login; a person with no connection has no token', async () => {
  const { service, db } = setup();
  await assert.rejects(service.accessToken(A), (error) => error.code === 'not_connected');
  await assert.rejects(service.whoami(A), (error) => error.code === 'not_connected');
  await service.completeLogin({ state: (await begin(service, A)).searchParams.get('state'), code: 'c' });
  // Make the token a dead one.
  const dead = setup();
  await dead.service.completeLogin({ state: (await begin(dead.service, A)).searchParams.get('state'), code: 'x' });
  const row = dead.db.rows[0];
  const sealed = dead.vault.seal({ accessToken: 'secret_dead', workspaceName: 'W' }, { userId: A, messageId: 'notion-oauth' });
  row.envelope = sealed.envelope;
  row.key_version = sealed.keyVersion;
  assert.deepEqual(await dead.service.whoami(A), { ok: false, reason: 'unauthorized' });
  assert.equal(dead.db.rows[0].status, 'needs_login');
  assert.deepEqual({ ...(await dead.service.status(A)) }.connected, false);
  assert.equal((await dead.service.status(A)).needsLogin, true);
  void db;
});

test('the settings: the id and the secret go together, the callback address is https, and the secret is not in anything the server says', () => {
  const base = { SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon' };
  const none = loadConfig(base);
  assert.equal(none.notion.configured, false);
  assert.equal(none.notion.redirectUri, REDIRECT, 'the callback address of the owner is the default');
  assert.throws(() => loadConfig({ ...base, NOTION_CLIENT_ID: CLIENT_ID }), /NOTION_CLIENT_ID and NOTION_CLIENT_SECRET go together/);
  assert.throws(() => loadConfig({ ...base, NOTION_CLIENT_SECRET: SECRET }), /go together/);
  assert.throws(() => loadConfig({ ...base, NOTION_CLIENT_ID: CLIENT_ID, NOTION_CLIENT_SECRET: SECRET, NOTION_REDIRECT_URI: 'http://api.noureon.com/oauth/notion/callback' }), /NOTION_REDIRECT_URI must be an https/);
  const set = loadConfig({ ...base, NOTION_CLIENT_ID: CLIENT_ID, NOTION_CLIENT_SECRET: SECRET });
  assert.equal(set.notion.configured, true);
  // The logger hides a field named like a secret, and the settings are never logged whole.
  const lines = [];
  createLogger((line) => lines.push(line))('config', { clientSecret: SECRET, notionToken: 'secret_token_1' });
  assert.ok(!lines.join('').includes(SECRET));
});

// ----- the endpoints

async function withServer(run, { notion = null } = {}) {
  const config = loadConfig({ SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon' });
  const tokens = { 'token-a-token-a-token-a-token-a': A, 'token-b-token-b-token-b-token-b': B };
  const fetchImpl = async (url, options) => {
    const id = tokens[String(options.headers.Authorization).replace('Bearer ', '')];
    return id ? new Response(JSON.stringify({ id }), { status: 200 }) : new Response('{}', { status: 401 });
  };
  const server = createServer(createApp({ config, fetchImpl, notion, log: createLogger(() => {}) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run({ base: `http://127.0.0.1:${server.address().port}` });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const asA = { Authorization: 'Bearer token-a-token-a-token-a-token-a' };
const asB = { Authorization: 'Bearer token-b-token-b-token-b-token-b' };

test('the endpoints: each person connects, looks at, tests and cuts only their own connection, and the secret and the token are in no answer', async () => {
  const { service, network } = setup();
  await withServer(async ({ base }) => {
    assert.equal((await fetch(`${base}/v1/notion/status`)).status, 401);
    assert.deepEqual(await (await fetch(`${base}/v1/notion/status`, { headers: asA })).json(), { connected: false });
    const begun = await (await fetch(`${base}/v1/notion/connect`, { method: 'POST', headers: asA })).json();
    const state = new URL(begun.url).searchParams.get('state');
    assert.equal(new URL(begun.url).origin, 'https://api.notion.com');
    // Notion sends the person back: no sign-in header, and the answer is a redirect to the test page with only the result.
    const back = await fetch(`${base}/oauth/notion/callback?code=SECRET-CODE&state=${state}`, { redirect: 'manual' });
    assert.equal(back.status, 302);
    const target = new URL(back.headers.get('location'));
    assert.equal(target.origin + target.pathname, 'https://noureon.com/notion-test');
    assert.equal(target.searchParams.get('notion'), 'connected');
    assert.ok(!back.headers.get('location').includes('SECRET-CODE') && !back.headers.get('location').includes(state));
    assert.equal(back.headers.get('referrer-policy'), 'no-referrer');
    // A reused state, a denial and a stranger.
    const again = await fetch(`${base}/oauth/notion/callback?code=x&state=${state}`, { redirect: 'manual' });
    assert.equal(new URL(again.headers.get('location')).searchParams.get('notion_error'), 'bad_state');
    const denied = await fetch(`${base}/oauth/notion/callback?error=access_denied&state=${'z'.repeat(43)}`, { redirect: 'manual' });
    assert.equal(new URL(denied.headers.get('location')).searchParams.get('notion_error'), 'bad_state');

    const statusA = await (await fetch(`${base}/v1/notion/status`, { headers: asA })).json();
    assert.equal(statusA.connected, true);
    assert.equal(statusA.workspaceName, 'Workspace 1');
    assert.deepEqual(await (await fetch(`${base}/v1/notion/status`, { headers: asB })).json(), { connected: false }, 'B has no connection');
    assert.equal((await fetch(`${base}/v1/notion/whoami`, { headers: asB })).status, 409, 'B has no token to test');
    const who = await (await fetch(`${base}/v1/notion/whoami`, { headers: asA })).json();
    assert.deepEqual(who, { ok: true, botName: 'Noureon', workspaceName: 'for secret_token_1_SECRET-CODE' });
    // B cuts their own: A's stays.
    assert.equal((await fetch(`${base}/v1/notion/disconnect`, { method: 'POST', headers: asB })).status, 200);
    assert.equal((await (await fetch(`${base}/v1/notion/status`, { headers: asA })).json()).connected, true);
    const cut = await (await fetch(`${base}/v1/notion/disconnect`, { method: 'POST', headers: asA })).json();
    assert.deepEqual(cut, { ok: true, revoked: true });
    assert.equal((await (await fetch(`${base}/v1/notion/status`, { headers: asA })).json()).connected, false);
    assert.equal((await fetch(`${base}/v1/notion/other`, { headers: asA })).status, 404);
    assert.equal((await fetch(`${base}/v1/notion/connect`, { headers: asA })).status, 404, 'connect is a POST');
  }, { notion: service });
  void network;
});

test('when the login started from the Extensions page, the callback sends the person back there, with only the result', async () => {
  const { service } = setup();
  await withServer(async ({ base }) => {
    const json = { ...asA, 'Content-Type': 'application/json' };
    const begun = await (await fetch(`${base}/v1/notion/connect`, { method: 'POST', headers: json, body: JSON.stringify({ returnTo: 'connectors' }) })).json();
    const state = new URL(begun.url).searchParams.get('state');
    const back = await fetch(`${base}/oauth/notion/callback?code=SECRET-CODE&state=${state}`, { redirect: 'manual' });
    const target = new URL(back.headers.get('location'));
    assert.equal(target.origin + target.pathname, 'https://noureon.com/connectors');
    assert.equal(target.searchParams.get('connector'), 'notion');
    assert.equal(target.searchParams.get('connected'), '1');
    assert.ok(!back.headers.get('location').includes('SECRET-CODE') && !back.headers.get('location').includes(state));
    // A denial of a login that started there goes back there too.
    const second = await (await fetch(`${base}/v1/notion/connect`, { method: 'POST', headers: json, body: JSON.stringify({ returnTo: 'connectors' }) })).json();
    const state2 = new URL(second.url).searchParams.get('state');
    const denied = await fetch(`${base}/oauth/notion/callback?error=access_denied&state=${state2}`, { redirect: 'manual' });
    const deniedTarget = new URL(denied.headers.get('location'));
    assert.equal(deniedTarget.pathname, '/connectors');
    assert.ok(deniedTarget.searchParams.get('connector_error'));
    // An unknown place is the test page.
    const odd = await (await fetch(`${base}/v1/notion/connect`, { method: 'POST', headers: json, body: JSON.stringify({ returnTo: 'https://evil.example' }) })).json();
    const oddBack = await fetch(`${base}/oauth/notion/callback?code=c&state=${new URL(odd.url).searchParams.get('state')}`, { redirect: 'manual' });
    assert.equal(new URL(oddBack.headers.get('location')).pathname, '/notion-test');
  }, { notion: service });
});

test('without Notion set up the endpoints say so, and the hosted connector is not touched by any of this', async () => {
  await withServer(async ({ base }) => {
    assert.equal((await fetch(`${base}/v1/notion/status`, { headers: asA })).status, 503);
    assert.equal((await fetch(`${base}/oauth/notion/callback?state=x`, { redirect: 'manual' })).status, 503);
    assert.equal((await fetch(`${base}/mcp/callback?state=x`, { redirect: 'manual' })).status, 503, 'the hosted connector has its own address (and its own set-up)');
  });
});

test('the test page is a static page that keeps no secret, loads only its own script, and is not indexed', () => {
  const html = readFileSync(new URL('../../public/notion-test.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../../public/notion-test.js', import.meta.url), 'utf8');
  assert.match(html, /name="robots" content="noindex/);
  assert.match(html, /<script src="\/notion-test\.js"><\/script>/);
  assert.equal((html.match(/<script/g) || []).length, 1, 'no script written in the page (the content security policy)');
  assert.ok(!/secret_[A-Za-z0-9]|client_secret\s*[:=]|Basic [A-Za-z0-9+/=]{10,}/i.test(html + script), 'no secret and no way to make one');
  assert.ok(!/innerHTML|document\.write|eval\(/.test(script), 'everything is put in as text');
  assert.match(script, /api\.noureon\.com/);
  assert.match(script, /\^https:\\\/\\\/api\\\.notion\\\.com\\\//, 'it goes only to an address of Notion');
  const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.ok(vercel.rewrites.some((rule) => rule.source === '/notion-test' && rule.destination === '/notion-test.html'));
});
