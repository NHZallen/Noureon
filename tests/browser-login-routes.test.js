// The routes of the password vault (server/browser-login-routes.js): only the owner, never a value in a list, a bad input is a plain error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createKeyVault } from '../server/key-vault.js';
import { createBrowserLogins } from '../server/browser-logins.js';
import { createBrowserLoginRoutes } from '../server/browser-login-routes.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function setup({ allowed = true } = {}) {
  const vault = createKeyVault([{ version: 1, key: randomBytes(32).toString('base64') }]);
  const table = [];
  const match = (row, filters = {}) => Object.entries(filters).every(([c, s]) => String(row[c]) === String(s).replace(/^eq\./, ''));
  const db = { select: async (n, { filters } = {}) => table.filter((r) => match(r, filters)).map((r) => ({ ...r })), insert: async (n, row) => { table.push({ created_at: 'x', last_used_at: null, ...row }); return [{}]; }, update: async () => [], remove: async (n, f) => { for (const r of table.filter((x) => match(x, f))) table.splice(table.indexOf(r), 1); } };
  const browser = { logins: createBrowserLogins({ db, vault }), mayUse: async (id) => allowed && id === A };
  const handle = createBrowserLoginRoutes({ browser });
  const run = async (method, path, body, user = { id: A }) => {
    const out = {};
    const ctx = { url: new URL(path, 'http://l'), authenticate: async () => user, readJson: async () => body ?? {}, send: (status, payload) => { out.sent = { status, payload }; }, fail: (code, message, extra) => { const e = new Error(message); e.code = code; e.extra = extra; throw e; } };
    try { out.handled = await handle({ method }, ctx); } catch (error) { out.failed = error; }
    return out;
  };
  return { run, table };
}
const login = { name: 'GitHub', origins: ['https://github.com'], username: 'who@example.com', password: 'S3cret-pw-1' };

test('add, list (no values), reveal and delete, for the owner', async () => {
  const t = setup();
  const added = await t.run('POST', '/v1/browser/logins', login);
  assert.equal(added.sent.status, 201);
  const id = added.sent.payload.login.id;
  assert.ok(!JSON.stringify(added.sent.payload).includes('S3cret'));
  const list = await t.run('GET', '/v1/browser/logins');
  assert.equal(list.sent.payload.logins.length, 1);
  assert.ok(!JSON.stringify(list.sent.payload).includes('S3cret') && !JSON.stringify(list.sent.payload).includes('who@'));
  assert.deepEqual((await t.run('GET', `/v1/browser/logins/${id}/username`)).sent.payload, { username: 'who@example.com' }, 'the user name needs no new confirmation and carries no password');
  assert.deepEqual((await t.run('POST', `/v1/browser/logins/${id}/reveal`)).sent.payload, { username: 'who@example.com', password: 'S3cret-pw-1' });
  assert.equal((await t.run('DELETE', `/v1/browser/logins/${id}`)).sent.payload.ok, true);
  assert.equal((await t.run('GET', '/v1/browser/logins')).sent.payload.logins.length, 0);
});

test('refused: bad input, somebody else, somebody who may not use the browser agent', async () => {
  const t = setup();
  assert.equal((await t.run('POST', '/v1/browser/logins', { ...login, origins: ['http://x.example'] })).failed.code, 'bad_request');
  const added = await t.run('POST', '/v1/browser/logins', login);
  const id = added.sent.payload.login.id;
  assert.equal((await t.run('POST', `/v1/browser/logins/${id}/reveal`, null, { id: B })).failed.code, 'not_found'); // B may not use the agent
  assert.equal((await t.run('GET', `/v1/browser/logins/${id}/username`, null, { id: B })).failed.code, 'not_found');
  const closed = setup({ allowed: false });
  assert.equal((await closed.run('GET', '/v1/browser/logins')).failed.code, 'not_found');
  assert.equal((await t.run('GET', '/v1/browser/other')).handled, false);
  assert.equal((await t.run('POST', '/v1/browser/logins/not-a-uuid/reveal')).handled, false);
});
