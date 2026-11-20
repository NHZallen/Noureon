import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';

import { createKeyVault } from '../../server/key-vault.js';
import { createBrowserLogins, LoginError, originOf } from '../../server/browser-logins.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function world() {
  const vault = createKeyVault([{ version: 1, key: randomBytes(32).toString('base64') }]);
  const table = [];
  const match = (row, filters = {}) => Object.entries(filters).every(([column, spec]) => { const [op, ...rest] = String(spec).split('.'); return op === 'eq' && String(row[column]) === rest.join('.'); });
  const db = {
    select: async (name, { filters } = {}) => table.filter((row) => match(row, filters)).map((row) => ({ ...row })),
    insert: async (name, row) => { table.push({ created_at: 'now', last_used_at: null, ...row }); return [{ id: row.id }]; },
    update: async (name, filters, values) => { for (const row of table.filter((r) => match(r, filters))) Object.assign(row, values); return []; },
    remove: async (name, filters) => { for (const row of table.filter((r) => match(r, filters))) table.splice(table.indexOf(row), 1); }
  };
  let n = 0;
  const logins = createBrowserLogins({ db, vault, makeId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` });
  return { logins, table, vault };
}
const github = { name: 'GitHub', origins: ['https://github.com/login', 'https://GITHUB.com'], username: 'who@example.com', password: 'S3cret-pw-1' };

test('origins are https only, with no path, user name or password', () => {
  assert.equal(originOf('https://Example.com/a/b?c=1'), 'https://example.com');
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'https://user:pw@example.com', 'example.com', '', null]) assert.equal(originOf(bad), null, String(bad));
});

test('a login is kept sealed: the table holds neither the user name nor the password; the list holds names and sites only', async () => {
  const w = world();
  const made = await w.logins.add(A, github);
  assert.deepEqual(made.origins, ['https://github.com']);
  const stored = JSON.stringify(w.table);
  assert.ok(!stored.includes('S3cret') && !stored.includes('who@example'));
  const list = await w.logins.list(A);
  assert.deepEqual(Object.keys(list[0]).sort(), ['createdAt', 'id', 'lastUsedAt', 'name', 'origins']);
  assert.deepEqual(await w.logins.list(B), []);
  assert.deepEqual(await w.logins.reveal(A, made.id), { username: 'who@example.com', password: 'S3cret-pw-1' });
  assert.deepEqual(await w.logins.username(A, made.id), { username: 'who@example.com' }, 'the user name alone, with no password in the answer');
  await assert.rejects(w.logins.username(B, made.id), (e) => e.code === 'not_found', 'only the owner');
  await assert.rejects(w.logins.reveal(B, made.id), (e) => e.code === 'not_found');
});

test('a sealed login cannot be moved to another login or person', async () => {
  const w = world();
  const one = await w.logins.add(A, github);
  const two = await w.logins.add(A, { ...github, name: 'Other', origins: ['https://other.example'] });
  w.table.find((r) => r.id === two.id).envelope = w.table.find((r) => r.id === one.id).envelope;
  await assert.rejects(w.logins.reveal(A, two.id), (e) => e.code === 'unreadable');
  const w2 = world();
  const mine = await w2.logins.add(A, github);
  w2.table.find((r) => r.id === mine.id).user_id = B;
  await assert.rejects(w2.logins.reveal(B, mine.id), (e) => e.code === 'unreadable');
});

test('filling: only on a site of the login; the only login of a site is found by itself; several need a name', async () => {
  const w = world();
  await w.logins.add(A, github);
  const filled = await w.logins.forFill(A, { pageOrigin: 'https://github.com/login' });
  assert.equal(filled.username, 'who@example.com');
  assert.ok(w.table[0].last_used_at);
  await assert.rejects(w.logins.forFill(A, { pageOrigin: 'https://evil-github.com' }), (e) => e.code === 'none');
  await assert.rejects(w.logins.forFill(A, { pageOrigin: 'https://evil.example', name: 'GitHub' }), (e) => e.code === 'wrong_site');
  await assert.rejects(w.logins.forFill(A, { pageOrigin: 'http://github.com' }), (e) => e.code === 'wrong_site');
  await assert.rejects(w.logins.forFill(B, { pageOrigin: 'https://github.com' }), (e) => e.code === 'none');
  await w.logins.add(A, { ...github, name: 'GitHub work', username: 'work@example.com' });
  const several = await w.logins.forFill(A, { pageOrigin: 'https://github.com' }).catch((e) => e);
  assert.equal(several.code, 'several'); assert.deepEqual(several.names.sort(), ['GitHub', 'GitHub work']);
  assert.equal((await w.logins.forFill(A, { pageOrigin: 'https://github.com', name: 'github WORK' })).username, 'work@example.com');
  assert.deepEqual((await w.logins.forOrigin(A, 'https://github.com')).map((e) => e.name).sort(), ['GitHub', 'GitHub work']);
});

test('the same name replaces the login; bad input is refused; too many are refused; removing works', async () => {
  const w = world();
  const first = await w.logins.add(A, github);
  const again = await w.logins.add(A, { ...github, password: 'New-pw-2' });
  assert.equal(again.id, first.id); assert.equal(w.table.length, 1);
  assert.equal((await w.logins.reveal(A, first.id)).password, 'New-pw-2');
  for (const bad of [{ ...github, name: '' }, { ...github, origins: [] }, { ...github, origins: ['http://x.example'] }, { ...github, username: '' }, { ...github, password: 'x'.repeat(1025) }]) {
    await assert.rejects(w.logins.add(A, bad), (e) => e instanceof LoginError);
  }
  await w.logins.remove(A, first.id);
  assert.equal(w.table.length, 0);
  await assert.rejects(w.logins.remove('x', first.id), (e) => e.code === 'bad_user');
});

test('the logins of a site go when the person deletes the password of the site', async () => {
  const w = world();
  await w.logins.add(A, github);
  await w.logins.add(A, { ...github, name: 'Other', origins: ['https://other.example'] });
  assert.equal(await w.logins.removeForOrigin(A, 'https://github.com'), 1);
  assert.deepEqual((await w.logins.list(A)).map((e) => e.name), ['Other']);
});
