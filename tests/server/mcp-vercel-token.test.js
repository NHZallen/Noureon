import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { createConnectorService } from '../../server/mcp/connections.js';
import { createKeyVault } from '../../server/key-vault.js';
import { ToolFailure } from '../../server/mcp/native/api.js';
import { PROVIDERS, createNativeClient, nativeToolNames } from '../../server/mcp/native/index.js';
import { explain, verifyToken } from '../../server/mcp/native/vercel/index.js';
import { connectorProblems, defaultToolState, getConnector, hasTokenLogin, isNativeConnector, toolKind } from '../../src/data/connector-catalog.js';

const USER = '123e4567-e89b-12d3-a456-426614174000';
const OTHER = '223e4567-e89b-12d3-a456-426614174001';
const TOKEN = 'vcp_abcdefghijklmnopqrstuvwxyz0123456789';
const vercel = getConnector('vercel-token');
const tool = (name) => PROVIDERS.vercel.tools.find((item) => item.name === name);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function recorder(answer = {}) {
  const calls = [];
  const call = async (method, url, options = {}) => {
    calls.push({ method, url, ...options });
    return typeof answer === 'function' ? answer(method, url, options) : answer;
  };
  return { call, calls };
}

test('the catalog entry is a native connector with a token login, and every tool is known to read or to write', () => {
  assert.deepEqual(connectorProblems(vercel), []);
  assert.equal(isNativeConnector(vercel), true);
  assert.equal(hasTokenLogin(vercel), true);
  assert.equal(hasTokenLogin(getConnector('linear')), false);
  assert.equal(vercel.pending, undefined, 'it no longer waits for Vercel\'s approval');
  assert.equal(vercel.oauth, undefined);
  const names = nativeToolNames('vercel');
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every((name) => /^vercel_[a-z0-9_]{2,60}$/.test(name)));
  for (const name of names) assert.ok(vercel.reads.includes(name) !== vercel.writes.includes(name), `${name} is in exactly one list`);
  assert.deepEqual([...vercel.reads, ...vercel.writes].filter((name) => !names.includes(name)), []);
  assert.equal(toolKind(vercel, 'vercel_redeploy'), 'write');
  assert.equal(defaultToolState(vercel, 'vercel_redeploy'), 'ask', 'a tool that starts a build asks first');
  assert.equal(defaultToolState(vercel, 'vercel_cancel_deployment'), 'ask');
  assert.equal(defaultToolState(vercel, 'vercel_get_build_logs'), 'allow');
  // The token goes only to Vercel's API.
  assert.deepEqual([...PROVIDERS.vercel.hosts], ['api.vercel.com']);
  // Nothing to buy, delete or change in the environment is offered.
  assert.ok(names.every((name) => !/buy|delete|remove|create_env|set_env/.test(name)));
});

test('the tools ask Vercel for the right things and give back only what they need; the team is passed along when it is given', async () => {
  const projects = recorder({ projects: [{ id: 'prj_1', name: 'web', framework: 'vite', link: { type: 'github', org: 'NHZallen', repo: 'Noureon', productionBranch: 'main' }, updatedAt: 1794662070061, latestDeployments: [{ url: 'web-abc.vercel.app', readyState: 'READY' }], secretStuff: 'x' }] });
  const listed = await tool('vercel_list_projects').run({ team_id: 'team_1', search: 'we', max_results: 5 }, projects.call);
  assert.equal(projects.calls[0].url, 'https://api.vercel.com/v10/projects');
  assert.deepEqual(projects.calls[0].query, { limit: 5, search: 'we', teamId: 'team_1' });
  assert.deepEqual(listed, [{ id: 'prj_1', name: 'web', framework: 'vite', repo: 'NHZallen/Noureon', git: 'github', production_branch: 'main', updated: '2026-11-14T13:14:30.061Z', latest_url: 'web-abc.vercel.app', latest_state: 'READY' }]);

  const deployments = recorder({ deployments: [{ uid: 'dpl_1', name: 'web', url: 'web-abc.vercel.app', state: 'ERROR', target: 'production', created: 1794662070061, creator: { username: 'allen' }, meta: { githubCommitRef: 'main', githubCommitMessage: 'fix it\n\nlong body' } }] });
  const list = await tool('vercel_list_deployments').run({ project: 'web', target: 'production', state: 'error' }, deployments.call);
  assert.equal(deployments.calls[0].url, 'https://api.vercel.com/v7/deployments');
  assert.equal(deployments.calls[0].query.projectId, 'web');
  assert.equal(deployments.calls[0].query.state, 'ERROR');
  assert.equal(deployments.calls[0].query.limit, 20);
  assert.deepEqual(list[0], { id: 'dpl_1', name: 'web', url: 'web-abc.vercel.app', state: 'ERROR', target: 'production', created: '2026-11-14T13:14:30.061Z', creator: 'allen', branch: 'main', commit_message: 'fix it' });

  const logs = recorder([{ created: 1794662070061, type: 'stdout', text: 'second' }, { created: 1794662069061, type: 'stdout', payload: { text: 'first' } }, { type: 'command' }]);
  const text = await tool('vercel_get_build_logs').run({ deployment: 'dpl_1', max_lines: 50 }, logs.call);
  assert.equal(logs.calls[0].url, 'https://api.vercel.com/v3/deployments/dpl_1/events');
  assert.deepEqual(logs.calls[0].query, { builds: 1, direction: 'backward', limit: 50, teamId: '' });
  assert.equal(text.split('\n').length, 2, 'lines with no text are left out');
  assert.ok(text.indexOf('first') < text.indexOf('second'), 'oldest first');

  const env = recorder({ envs: [{ key: 'API_KEY', value: 'SECRET-VALUE', type: 'encrypted', target: ['production'], id: 'e1' }] });
  const variables = await tool('vercel_list_env_vars').run({ project: 'web' }, env.call);
  assert.deepEqual(variables, [{ key: 'API_KEY', type: 'encrypted', target: ['production'] }]);
  assert.ok(!JSON.stringify(variables).includes('SECRET-VALUE'), 'a value is never read out');

  const domains = recorder({ domains: [{ name: 'noureon.com', verified: true }, { name: 'www.noureon.com', verified: true, redirect: 'noureon.com' }] });
  assert.equal((await tool('vercel_list_project_domains').run({ project: 'web' }, domains.call))[1].redirect_to, 'noureon.com');
  assert.equal((await tool('vercel_list_teams').run({}, recorder({ teams: [{ id: 't', slug: 's', name: 'N', extra: 1 }] }).call))[0].slug, 's');
  const one = recorder({ id: 'dpl_1', name: 'web', url: 'u', readyState: 'ERROR', errorMessage: 'Build failed', alias: ['noureon.com'] });
  assert.equal((await tool('vercel_get_deployment').run({ deployment: 'dpl_1' }, one.call)).error, 'Build failed');
});

test('a redeploy reads the deployment it repeats and starts one new build; a stop is a patch; ids go into addresses encoded', async () => {
  const { call, calls } = recorder((method) => (method === 'GET' ? { id: 'dpl_1', name: 'web', target: 'production', readyState: 'ERROR' } : { id: 'dpl_2', name: 'web', url: 'web-2.vercel.app', readyState: 'QUEUED', target: 'production' }));
  const result = await tool('vercel_redeploy').run({ deployment: 'dpl_1', team_id: 'team_1' }, call);
  assert.deepEqual(calls.map((entry) => `${entry.method} ${entry.url}`), ['GET https://api.vercel.com/v13/deployments/dpl_1', 'POST https://api.vercel.com/v13/deployments']);
  assert.deepEqual(calls[1].query, { forceNew: 1, teamId: 'team_1' });
  assert.deepEqual(calls[1].json, { name: 'web', deploymentId: 'dpl_1', target: 'production' });
  assert.equal(result.id, 'dpl_2');
  const stop = recorder({ id: 'dpl_3', readyState: 'CANCELED', name: 'web' });
  await tool('vercel_cancel_deployment').run({ deployment: 'dpl_3' }, stop.call);
  assert.equal(`${stop.calls[0].method} ${stop.calls[0].url}`, 'PATCH https://api.vercel.com/v12/deployments/dpl_3/cancel');
  const odd = recorder({ id: 'x' });
  await tool('vercel_get_deployment').run({ deployment: 'a/b c?d' }, odd.call);
  assert.equal(odd.calls[0].url, 'https://api.vercel.com/v13/deployments/a%2Fb%20c%3Fd');
});

test('an input that is not right is told so in plain words and nothing is sent', async () => {
  const { call, calls } = recorder({});
  await assert.rejects(() => tool('vercel_get_project').run({}, call), ToolFailure);
  await assert.rejects(() => tool('vercel_list_projects').run({ max_results: 500 }, call), /whole number/);
  await assert.rejects(() => tool('vercel_list_deployments').run({ state: 'x; drop' }, call), /state name/);
  await assert.rejects(() => tool('vercel_list_deployments').run({ target: 'staging' }, call), /one of/);
  await assert.rejects(() => tool('vercel_get_deployment').run({ deployment: 'dpl\n1' }, call), /not an id/);
  assert.equal(calls.length, 0);
});

test('Vercel\'s refusals are put in a few plain words', () => {
  assert.match(explain(403, JSON.stringify({ error: { code: 'forbidden', message: 'Not authorized' } })), /new token/);
  assert.match(explain(404, '{}'), /team_id/);
  assert.match(explain(429, ''), /too many/);
  assert.match(explain(500, JSON.stringify({ error: { code: 'internal', message: 'Oops' } })), /500 \(internal\): Oops/);
  assert.match(explain(400, 'not json'), /Vercel answered 400/);
});

test('a token is tried at Vercel once, before it is kept: a good one gives the account, a refused one and an unreachable service are told apart', async () => {
  let seen = null;
  const good = await verifyToken(TOKEN, async (url, options) => { seen = { url, authorization: options.headers.authorization }; return json({ user: { username: 'allen', email: 'a@b.c' } }); });
  assert.deepEqual(good, { account: 'allen' });
  assert.deepEqual(seen, { url: 'https://api.vercel.com/v2/user', authorization: `Bearer ${TOKEN}` });
  await assert.rejects(() => verifyToken(TOKEN, async () => json({ error: {} }, 403)), (error) => error.code === 'unauthorized');
  await assert.rejects(() => verifyToken(TOKEN, async () => json({}, 500)), (error) => error.code === 'unreachable');
  await assert.rejects(() => verifyToken(TOKEN, async () => { throw new Error('down'); }), (error) => error.code === 'unreachable');
});

function setup(fetchImpl, extra = {}) {
  const rows = [];
  const matches = (filters) => (row) => Object.entries(filters || {}).every(([column, condition]) => {
    const [op, ...rest] = String(condition).split('.');
    return op === 'eq' ? String(row[column]) === rest.join('.') : true;
  });
  const db = {
    rows,
    select: async (table, { filters, limit } = {}) => rows.filter((row) => row.__table === table).filter(matches(filters)).slice(0, limit || 1000).map(({ __table, ...row }) => ({ ...row })),
    upsert: async (table, row, { onConflict }) => {
      const keys = onConflict.split(',');
      const at = rows.findIndex((entry) => entry.__table === table && keys.every((key) => entry[key] === row[key]));
      if (at >= 0) rows[at] = { ...rows[at], ...row };
      else rows.push({ __table: table, created_at: new Date().toISOString(), ...row });
    },
    remove: async (table, filters) => {
      for (let index = rows.length - 1; index >= 0; index -= 1) if (rows[index].__table === table && matches(filters)(rows[index])) rows.splice(index, 1);
    }
  };
  const vault = createKeyVault([{ version: 1, key: randomBytes(32).toString('base64') }]);
  const logs = [];
  const service = createConnectorService({ db, vault, fetchImpl, log: (event, data) => logs.push([event, data]), config: { redirectUri: 'https://api.noureon.com/mcp/callback', cimdUrl: '', ...extra } });
  return { db, service, vault, logs };
}

function fakeVercel() {
  const state = { requests: [], accepts: new Set([TOKEN]), down: false };
  const fetchImpl = async (url, options = {}) => {
    state.requests.push({ method: options.method || 'GET', url: String(url), authorization: options.headers?.authorization });
    if (state.down) throw new Error('down');
    const token = String(options.headers?.authorization || '').replace('Bearer ', '');
    if (!state.accepts.has(token)) return json({ error: { code: 'forbidden', message: 'Invalid token' } }, 403);
    if (String(url) === 'https://api.vercel.com/v2/user') return json({ user: { username: 'allen' } });
    return json({});
  };
  return { fetchImpl, state };
}

test('a pasted token is tried, kept sealed (never in the clear), shown as connected with its tools, and used for the calls', async () => {
  const world = fakeVercel();
  const { service, db, logs } = setup(world.fetchImpl);
  const result = await service.connectWithToken(USER, 'vercel-token', `  ${TOKEN}\n`);
  assert.deepEqual(result, { ok: true });
  const row = db.rows.find((entry) => entry.connector_id === 'vercel-token');
  assert.equal(row.status, 'connected');
  assert.equal(row.mode, 'readwrite');
  assert.ok(!JSON.stringify(row).includes(TOKEN), 'the token is only in the sealed envelope');
  assert.ok(!JSON.stringify(logs).includes(TOKEN), 'and never in the log');
  assert.equal(await service.accessToken(USER, 'vercel-token'), TOKEN);
  const entry = (await service.list(USER)).find((item) => item.id === 'vercel-token');
  assert.equal(entry.status, 'connected');
  assert.equal(entry.tools.length, nativeToolNames('vercel').length);
  assert.equal(entry.tools.find((item) => item.name === 'vercel_redeploy').state, 'ask');
  assert.equal(entry.tools.find((item) => item.name === 'vercel_list_projects').state, 'allow');
  assert.ok(!JSON.stringify(entry).includes(TOKEN));
  // The token is bound to this person: another person's account cannot open it.
  assert.equal((await service.list(OTHER)).find((item) => item.id === 'vercel-token').status, 'none');
  const client = createNativeClient('vercel', { getToken: () => service.accessToken(USER, 'vercel-token'), fetchImpl: world.fetchImpl });
  const called = await client.callTool('vercel_list_teams', {});
  assert.equal(called.isError, false);
  assert.equal(world.state.requests.at(-1).authorization, `Bearer ${TOKEN}`);
});

test('a token that is not the shape of one, one Vercel refuses, and a service that cannot be asked connect nothing', async () => {
  const world = fakeVercel();
  const { service, db } = setup(world.fetchImpl);
  for (const bad of ['', 'short', 'has spaces in it and is long enough', `${TOKEN}\nextra`, 'x'.repeat(600), 42, null]) {
    await assert.rejects(() => service.connectWithToken(USER, 'vercel-token', bad), (error) => error.code === 'bad_request' && error.detail === 'invalid_token');
  }
  assert.equal(world.state.requests.length, 0, 'nothing that is not a token is sent anywhere');
  await assert.rejects(() => service.connectWithToken(USER, 'vercel-token', 'vcp_this_one_is_not_accepted_by_vercel'), (error) => error.code === 'bad_request' && error.detail === 'invalid_token');
  world.state.down = true;
  await assert.rejects(() => service.connectWithToken(USER, 'vercel-token', TOKEN), (error) => error.code === 'failed' && error.detail === 'unreachable');
  assert.equal(db.rows.length, 0, 'no connection was made');
  await assert.rejects(() => service.connectWithToken(USER, 'linear', TOKEN), (error) => error.code === 'bad_request');
  await assert.rejects(() => service.connectWithToken(USER, 'nothing', TOKEN), (error) => error.code === 'unknown_connector');
  await assert.rejects(() => service.startLogin(USER, 'vercel-token', 'readwrite'), (error) => error.code === 'bad_request', 'there is no login page for it');
});

test('a token Vercel stops taking needs a new token; pasting a new one connects again; disconnecting deletes what is kept and says it could not revoke it', async () => {
  const world = fakeVercel();
  const { service, db } = setup(world.fetchImpl);
  await service.connectWithToken(USER, 'vercel-token', TOKEN);
  world.state.accepts.delete(TOKEN);
  const client = createNativeClient('vercel', { getToken: () => service.accessToken(USER, 'vercel-token'), onUnauthorized: () => service.accessToken(USER, 'vercel-token', { force: true }).catch(() => null), fetchImpl: async () => new Response('', { status: 401 }) });
  await assert.rejects(() => client.callTool('vercel_list_teams', {}), (error) => error.code === 'unauthorized');
  assert.equal(db.rows.find((entry) => entry.connector_id === 'vercel-token').status, 'needs_login');
  const NEW = 'vcp_a_new_token_0123456789abcdefghijkl';
  world.state.accepts.add(NEW);
  await service.connectWithToken(USER, 'vercel-token', NEW);
  assert.equal(await service.accessToken(USER, 'vercel-token'), NEW);
  assert.equal(db.rows.filter((entry) => entry.connector_id === 'vercel-token').length, 1, 'one row, replaced');
  const before = world.state.requests.length;
  assert.deepEqual(await service.disconnect(USER, 'vercel-token'), { revoked: false });
  assert.equal(db.rows.length, 0);
  assert.equal(world.state.requests.length, before, 'nothing is sent to anyone when it is disconnected');
});
