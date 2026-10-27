import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAssetSweeper } from '../../server/asset-sweeper.js';
import { AVATAR_BUCKET, createAvatarFileStore } from '../../server/avatar-files.js';

const USER = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

test('only the one name of a picture is removed, through the storage API of its bucket', async () => {
  const calls = [];
  const store = createAvatarFileStore({ url: 'https://p.example', serviceKey: 'service-key', fetchImpl: async (url, init) => { calls.push([url, init]); return { ok: true, status: 200 }; } });
  const removed = await store.removeAll([`${USER}/avatar.webp`, `${USER}/other.webp`, '../x/avatar.webp', `${USER}/../${USER}/avatar.webp`, 'not-a-person/avatar.webp', 42]);
  assert.equal(removed, 1);
  assert.equal(calls[0][0], `https://p.example/storage/v1/object/${AVATAR_BUCKET}`);
  assert.equal(calls[0][1].method, 'DELETE');
  assert.deepEqual(JSON.parse(calls[0][1].body), { prefixes: [`${USER}/avatar.webp`] });
  assert.equal(await store.removeAll([]), 0);
  assert.equal(calls.length, 1);
});

test('a refusal of the storage API is an error', async () => {
  const store = createAvatarFileStore({ url: 'https://p.example', serviceKey: 'k', fetchImpl: async () => ({ ok: false, status: 502 }) });
  await assert.rejects(() => store.removeAll([`${USER}/avatar.webp`]), (error) => error.status === 502);
});

test('the sweeper looks after the pictures too: reports at first, removes in delete mode', async () => {
  const asked = [];
  const rows = { orphan_user_assets: [], orphan_user_avatars: [{ name: `${USER}/avatar.webp`, size: 2000 }] };
  const db = { rpc: async (name) => { asked.push(name); return rows[name] || []; } };
  const removed = [];
  const avatars = { removeAll: async (paths) => { removed.push(...paths); return paths.length; } };
  const reporter = createAssetSweeper({ db, files: {}, avatars, log: () => {} });
  const report = await reporter.sweepOnce();
  assert.deepEqual(report.avatars, { found: 1, bytes: 2000, removed: 0 });
  assert.deepEqual(removed, []);
  assert.ok(asked.includes('orphan_user_avatars'));
  const deleter = createAssetSweeper({ db, files: {}, avatars, log: () => {}, mode: 'delete' });
  assert.deepEqual((await deleter.sweepOnce()).avatars, { found: 1, bytes: 2000, removed: 1 });
  assert.deepEqual(removed, [`${USER}/avatar.webp`]);
});

test('a failing pass of the pictures does not stop the others', async () => {
  const lines = [];
  const db = { rpc: async (name) => { if (name === 'orphan_user_avatars') throw Object.assign(new Error('bad'), { status: 502 }); return []; } };
  const sweeper = createAssetSweeper({ db, files: {}, avatars: {}, log: (event, data) => lines.push([event, data.status]) });
  assert.deepEqual((await sweeper.sweepOnce()).avatars, { found: 0, bytes: 0, removed: 0 });
  assert.deepEqual(lines, [['avatar_sweep_failed', 502]]);
});

test('the migration: a private small bucket, rules for the one name, the person reads only their own row, the orphan function is the server\'s', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261027010000_add_user_avatars.sql', import.meta.url), 'utf8');
  assert.match(sql, /values \('user-avatars', 'user-avatars', false, 524288, array\['image\/webp', 'image\/png', 'image\/jpeg'\]\)/);
  for (const action of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`on storage\\.objects for ${action} to authenticated`));
  assert.equal((sql.match(/name = \(select auth\.uid\(\)\)::text \|\| '\/avatar\.webp'/g) || []).length >= 5, true);
  assert.match(sql, /alter table public\.user_profiles enable row level security/);
  assert.match(sql, /avatar_path = user_id::text \|\| '\/avatar\.webp'/);
  assert.match(sql, /revoke all on function public\.orphan_user_avatars\(interval, integer\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.orphan_user_avatars\(interval, integer\) to service_role;/);
  assert.doesNotMatch(sql, /to anon/);
});
