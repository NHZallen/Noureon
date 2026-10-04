import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { CredentialError, createCredentialStore, prepareToolCredentials, scrubResult, scrubSecrets } from '../../server/cli-credentials.js';
import { createKeyVault } from '../../server/key-vault.js';
import { getCliTool } from '../../src/data/cli-catalog.js';

const USER = '123e4567-e89b-12d3-a456-426614174000';
const OTHER = '223e4567-e89b-12d3-a456-426614174001';

/** The database as the store uses it: rows by (user, name), with the few calls of server/supabase-rest.js. */
function fakeDb() {
  const rows = [];
  const filterOf = (filters) => (row) => Object.entries(filters || {}).every(([column, condition]) => {
    const [op, ...rest] = String(condition).split('.');
    const value = rest.join('.');
    if (op === 'eq') return String(row[column]) === value;
    if (op === 'in') return value.replace(/^\(|\)$/g, '').split(',').includes(String(row[column]));
    return true;
  });
  return {
    rows,
    select: async (table, { filters, limit } = {}) => rows.filter(filterOf(filters)).slice(0, limit || 1000).map((row) => ({ ...row })),
    upsert: async (table, row, { onConflict }) => {
      const keys = onConflict.split(',');
      const at = rows.findIndex((entry) => keys.every((key) => entry[key] === row[key]));
      if (at >= 0) rows[at] = { ...rows[at], ...row };
      else rows.push({ ...row });
    },
    remove: async (table, filters) => {
      for (let index = rows.length - 1; index >= 0; index -= 1) if (filterOf(filters)(rows[index])) rows.splice(index, 1);
    }
  };
}
const vaultOf = (version = 1) => createKeyVault([{ version, key: randomBytes(32).toString('base64') }]);

test('a credential is kept sealed, can be read back by its owner and by no one else, replaced and removed', async () => {
  const db = fakeDb();
  const store = createCredentialStore({ db, vault: vaultOf() });
  await store.set(USER, 'TWITTER_AUTH_TOKEN', '  secret-token-value  ');
  assert.equal(db.rows.length, 1);
  assert.equal(JSON.stringify(db.rows).includes('secret-token-value'), false, 'what the database holds is sealed');
  assert.deepEqual((await store.list(USER)).map((entry) => [entry.name, entry.value]), [['TWITTER_AUTH_TOKEN', 'secret-token-value']]);
  assert.deepEqual(await store.list(OTHER), [], 'not someone else\'s');
  await store.set(USER, 'TWITTER_AUTH_TOKEN', 'another');
  assert.equal(db.rows.length, 1);
  assert.equal((await store.list(USER))[0].value, 'another');
  assert.deepEqual(await store.values(USER, ['TWITTER_AUTH_TOKEN', 'MISSING', 'not a name']), { TWITTER_AUTH_TOKEN: 'another' });
  assert.deepEqual(await store.values(OTHER, ['TWITTER_AUTH_TOKEN']), {});
  await store.remove(USER, 'TWITTER_AUTH_TOKEN');
  assert.deepEqual(await store.list(USER), []);
});

test('a sealed value cannot be moved to another name or person, and one whose key is gone is left out instead of failing the rest', async () => {
  const db = fakeDb();
  const vault = vaultOf();
  const store = createCredentialStore({ db, vault });
  await store.set(USER, 'A_ONE', 'value-one');
  await store.set(USER, 'B_TWO', 'value-two');
  // Moved: the row of A_ONE under another name (or person) is not opened.
  const moved = { ...db.rows[0], name: 'C_THREE' };
  db.rows.push(moved);
  db.rows.push({ ...db.rows[0], user_id: OTHER });
  assert.deepEqual((await store.list(USER)).map((entry) => entry.name), ['A_ONE', 'B_TWO']);
  assert.deepEqual(await store.list(OTHER), []);
  // Sealed by a master key that is gone.
  const later = createCredentialStore({ db, vault: vaultOf(2) });
  assert.deepEqual(await later.list(USER), []);
});

test('names and values are checked, and a person has a limited number', async () => {
  const store = createCredentialStore({ db: fakeDb(), vault: vaultOf() });
  for (const name of ['lower', '1START', 'HAS SPACE', 'A'.repeat(65), '']) await assert.rejects(() => store.set(USER, name, 'x'), (error) => error instanceof CredentialError && error.code === 'bad_name', name);
  for (const value of ['', '   ', 'x'.repeat(4001), null, 12]) await assert.rejects(() => store.set(USER, 'OK_NAME', value), (error) => error instanceof CredentialError && error.code === 'bad_value');
  for (let index = 0; index < 40; index += 1) await store.set(USER, `NAME_${index}`, 'v');
  await assert.rejects(() => store.set(USER, 'ONE_MORE', 'v'), (error) => error.code === 'too_many');
  await store.set(USER, 'NAME_3', 'replaced');
  await assert.rejects(() => store.remove(USER, 'bad name'), CredentialError);
});

test('a tool is given only the credentials it declares, and a missing one is named', () => {
  const twitter = getCliTool('twitter-cli');
  const prepared = prepareToolCredentials([twitter], { TWITTER_AUTH_TOKEN: 'aaaaaaaa', UNRELATED: 'bbbbbbbb' });
  assert.deepEqual(prepared.env, { TWITTER_AUTH_TOKEN: 'aaaaaaaa' });
  assert.deepEqual(prepared.missing, { 'twitter-cli': ['TWITTER_CT0'] });
  assert.deepEqual(prepared.secrets, ['aaaaaaaa']);
  assert.deepEqual(prepareToolCredentials([getCliTool('officecli')], {}).env, {});
  const rdt = prepareToolCredentials([getCliTool('rdt-cli')], { REDDIT_SESSION: 'cookie-value-123' }, { nowMs: 1_700_000_000_000 });
  assert.equal(rdt.files.length, 1);
  assert.deepEqual(JSON.parse(rdt.files[0].content), { cookies: { reddit_session: 'cookie-value-123' }, source: 'saved', username: null, modhash: null, saved_at: 1_700_000_000, last_verified_at: null });
  assert.equal(prepareToolCredentials([getCliTool('rdt-cli')], {}).files.length, 0, 'no login file without the credential');
});

test('what is printed is scrubbed of every credential, in text and in a result, and short values are left alone', () => {
  assert.equal(scrubSecrets('a SECRET-VALUE b SECRET-VALUE c other-token', ['SECRET-VALUE', 'other-token', 'abc']), 'a •••• b •••• c ••••');
  assert.equal(scrubSecrets('abc', ['abc']), 'abc', 'under six characters it would hide ordinary words');
  const result = scrubResult({ stdout: { text: 'got SECRET-VALUE', dropped: 0 }, stderr: { text: 'SECRET-VALUE!', dropped: 0 }, error: 'bad SECRET-VALUE', files: [] }, ['SECRET-VALUE']);
  assert.equal(result.stdout.text, 'got ••••');
  assert.equal(result.stderr.text, '••••!');
  assert.equal(result.error, 'bad ••••');
  assert.equal(scrubResult({ stdout: 'plain' }, []).stdout, 'plain');
  assert.equal(scrubResult({ stdout: 'plain SECRET-VALUE' }, ['SECRET-VALUE']).stdout, 'plain ••••', 'a result with plain text too');
});
