import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAssetSweeper } from '../../server/asset-sweeper.js';
import { finishAdvancedReply } from '../../server/advanced-reply.js';
import { createFileStore, FileStoreError, USER_ASSET_QUOTA_BYTES } from '../../server/file-store.js';
import { createSkillBundleStore } from '../../server/skill-bundles.js';

const USER = '123e4567-e89b-12d3-a456-426614174000';
const MB = 1024 * 1024;

function fakeStorage({ existing = [], used = 0 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url.includes('/object/info/')) return new Response('{}', { status: existing.some((path) => url.endsWith(path)) ? 200 : 404 });
    return new Response('{}', { status: 200 });
  };
  const db = { rpc: async (name, args) => { calls.push({ rpc: name, args }); return used; } };
  return { calls, fetchImpl, db };
}

test('file store: the person has 500 MB, counted over the whole folder', () => {
  assert.equal(USER_ASSET_QUOTA_BYTES, 500 * MB);
});

test('file store: a file that would take the person over their space is not saved (code quota)', async () => {
  const { calls, fetchImpl, db } = fakeStorage({ used: 495 * MB });
  const store = createFileStore({ url: 'https://p.example', serviceKey: 'k', db, fetchImpl });
  await assert.rejects(store.save({ userId: USER, bytes: new Uint8Array(6 * MB) }), (error) => error instanceof FileStoreError && error.code === 'quota');
  assert.equal(calls.some((call) => call.method === 'POST'), false, 'nothing is uploaded');
  const fits = await store.save({ userId: USER, bytes: new Uint8Array(4 * MB) });
  assert.match(fits.__astraCloudAsset.path, new RegExp(`^${USER}/[0-9a-f]{64}$`));
});

test('file store: bytes that are already kept cost nothing and are not uploaded again, even when the space is full', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const path = `${USER}/${createHash('sha256').update(bytes).digest('hex')}`;
  const { calls, fetchImpl, db } = fakeStorage({ existing: [path], used: 500 * MB });
  const store = createFileStore({ url: 'https://p.example', serviceKey: 'k', db, fetchImpl });
  const marker = await store.save({ userId: USER, bytes });
  assert.equal(marker.__astraCloudAsset.path, path);
  assert.equal(calls.some((call) => call.method === 'POST'), false);
});

test('file store: when the usage cannot be known a file is still saved (the limit is not a reason to lose work)', async () => {
  const { fetchImpl } = fakeStorage();
  const db = { rpc: async () => { throw new Error('down'); } };
  const store = createFileStore({ url: 'https://p.example', serviceKey: 'k', db, fetchImpl });
  assert.equal(await store.usage(USER), null);
  await store.save({ userId: USER, bytes: new Uint8Array(10) });
});

test('file store: removing goes through the storage API and only for paths of the shape it keeps', async () => {
  const { calls, fetchImpl, db } = fakeStorage();
  const store = createFileStore({ url: 'https://p.example', serviceKey: 'k', db, fetchImpl });
  const good = `${USER}/${'a'.repeat(64)}`;
  assert.equal(await store.removeAll([good, '../etc/passwd', `${USER}/short`, 'x']), 1);
  const call = calls.find((entry) => entry.method === 'DELETE');
  assert.equal(call.url, 'https://p.example/storage/v1/object/user-assets');
  assert.deepEqual(JSON.parse(call.body), { prefixes: [good] });
  assert.equal(await store.removeAll([]), 0);
});

test('a reply whose file does not fit the space says so (quota) and does not keep it inside the message either', async () => {
  const run = { steps: [{ n: 1, files: [{ name: 'a.mp4' }], outputs: [{ name: 'a.mp4', bytes: new Uint8Array(3) }] }] };
  const files = { save: async () => { throw new FileStoreError('full', 507, 'quota'); } };
  const done = await finishAdvancedReply({ result: { text: 'ok' }, run, userId: USER, files, embedFonts: async () => {} });
  assert.deepEqual(run.steps[0].skipped, [{ name: 'a.mp4', reason: 'quota' }]);
  assert.equal(done.parts.length, 0);
});

test('sweeper: reports by default and removes nothing; removes only in delete mode', async () => {
  const names = [`${USER}/${'a'.repeat(64)}`, `${USER}/${'b'.repeat(64)}`];
  const rpcCalls = [];
  const db = { rpc: async (name, args) => { rpcCalls.push([name, args]); return rpcCalls.length === 1 ? names.map((name) => ({ name, size: 5, touched_at: 'x' })) : []; } };
  const removed = [];
  const files = { removeAll: async (paths) => { removed.push(...paths); return paths.length; } };
  const lines = [];
  const log = (event, data) => lines.push([event, data]);

  const reporter = createAssetSweeper({ db, files, log });
  assert.deepEqual(await reporter.sweepOnce(), { found: 2, bytes: 10, removed: 0 });
  assert.deepEqual(removed, []);
  assert.equal(lines[0][0], 'asset_orphans_found');
  assert.deepEqual(rpcCalls[0], ['orphan_user_assets', { p_older_than: '1 day', p_limit: 500 }]);

  rpcCalls.length = 0;
  const deleter = createAssetSweeper({ db, files, log, mode: 'delete' });
  assert.deepEqual(await deleter.sweepOnce(), { found: 2, bytes: 10, removed: 2 });
  assert.deepEqual(removed, names);
});

test('sweeper: a failed pass is logged, never thrown', async () => {
  const lines = [];
  const sweeper = createAssetSweeper({ db: { rpc: async () => { throw Object.assign(new Error('boom'), { code: 'x' }); } }, files: {}, log: (event) => lines.push(event) });
  assert.deepEqual(await sweeper.sweepOnce(), { found: 0, bytes: 0, removed: 0 });
  assert.deepEqual(lines, ['asset_sweep_failed']);
});

test('sweeper: starts two minutes after the server and then every day', () => {
  const timers = [];
  const sweeper = createAssetSweeper({
    db: { rpc: async () => [] }, files: {},
    setTimer: (fn, ms) => { timers.push(['once', ms, fn]); return { unref() {} }; },
    setRepeat: (fn, ms) => { timers.push(['every', ms, fn]); return { unref() {} }; }
  });
  sweeper.start();
  sweeper.start();
  assert.equal(timers.length, 1);
  assert.deepEqual(timers[0].slice(0, 2), ['once', 120_000]);
  timers[0][2]();
  assert.deepEqual(timers[1].slice(0, 2), ['every', 86_400_000]);
});

// ----- the zips of the skills with files (docs/superpowers/specs/2026-10-09-skills-design.md, §14): cleared when nothing points to them any more
test('skill zips: the store removes paths of a person\'s folder through the storage API and nothing that goes up or starts elsewhere', async () => {
  const calls = [];
  const store = createSkillBundleStore({ url: 'https://p.example', serviceKey: 'k', fetchImpl: async (url, options) => { calls.push({ url, method: options.method, body: options.body, headers: options.headers }); return new Response('{}', { status: 200 }); } });
  const good = [`${USER}/sales-report.zip`, `${USER}/stray.bin`, `${USER}/sub/other.zip`];
  assert.equal(await store.removeAll([...good, '../etc/passwd', `${USER}/../x.zip`, 'no-folder.zip', `${USER}\\x.zip`, `${USER}/`, '']), 3);
  assert.equal(calls[0].url, 'https://p.example/storage/v1/object/user-skill-bundles');
  assert.equal(calls[0].method, 'DELETE');
  assert.deepEqual(JSON.parse(calls[0].body), { prefixes: good });
  assert.equal(calls[0].headers.Authorization, 'Bearer k');
  assert.equal(await store.removeAll([]), 0);
  assert.equal(await store.removeAll(['x']), 0);
  assert.equal(calls.length, 1, 'nothing is asked for when nothing is left to remove');
  const refusing = createSkillBundleStore({ url: 'https://p.example', serviceKey: 'k', fetchImpl: async () => new Response('no', { status: 500 }) });
  await assert.rejects(() => refusing.removeAll([`${USER}/a.zip`]), (error) => error.status === 500);
});

test('sweeper: the skill zips are looked after in a second pass, reported first and removed in delete mode, and the first pass is the same as before', async () => {
  const assetNames = [`${USER}/${'a'.repeat(64)}`];
  const zipNames = [`${USER}/gone-skill.zip`, `${USER}/stray.bin`];
  const asked = [];
  const db = { rpc: async (name, args) => { asked.push([name, args]); const once = asked.filter(([entry]) => entry === name).length === 1; return once ? (name === 'orphan_user_assets' ? assetNames : zipNames).map((entry) => ({ name: entry, size: 5, touched_at: 'x' })) : []; } };
  const removedAssets = [];
  const removedZips = [];
  const files = { removeAll: async (paths) => { removedAssets.push(...paths); return paths.length; } };
  const bundles = { removeAll: async (paths) => { removedZips.push(...paths); return paths.length; } };
  const lines = [];
  const log = (event, data) => lines.push([event, data]);

  const reporter = createAssetSweeper({ db, files, bundles, log });
  assert.deepEqual(await reporter.sweepOnce(), { found: 1, bytes: 5, removed: 0, bundles: { found: 2, bytes: 10, removed: 0 } });
  assert.deepEqual(removedAssets.concat(removedZips), [], 'nothing is removed while only reporting');
  assert.deepEqual(lines.map(([event]) => event), ['asset_orphans_found', 'skill_bundle_orphans_found']);
  assert.deepEqual(lines[1][1].names, zipNames);
  assert.deepEqual(asked.map(([name]) => name), ['orphan_user_assets', 'orphan_skill_bundles']);
  assert.deepEqual(asked[1][1], { p_older_than: '1 day', p_limit: 500 });

  asked.length = 0;
  lines.length = 0;
  const deleter = createAssetSweeper({ db, files, bundles, log, mode: 'delete' });
  assert.deepEqual(await deleter.sweepOnce(), { found: 1, bytes: 5, removed: 1, bundles: { found: 2, bytes: 10, removed: 2 } });
  assert.deepEqual(removedAssets, assetNames);
  assert.deepEqual(removedZips, zipNames);
  assert.deepEqual(lines.map(([event]) => event), ['asset_orphans_removed', 'skill_bundle_orphans_removed']);
});

test('sweeper: a failure of one pass does not stop the other, and is logged under its own name', async () => {
  const lines = [];
  const db = { rpc: async (name) => { if (name === 'orphan_user_assets') throw Object.assign(new Error('boom'), { code: 'x' }); return [{ name: `${USER}/a.zip`, size: 3 }]; } };
  const removed = [];
  const sweeper = createAssetSweeper({ db, files: {}, bundles: { removeAll: async (paths) => { removed.push(...paths); return paths.length; } }, mode: 'delete', log: (event) => lines.push(event) });
  assert.deepEqual(await sweeper.sweepOnce(), { found: 0, bytes: 0, removed: 0, bundles: { found: 1, bytes: 3, removed: 1 } });
  assert.deepEqual(lines, ['asset_sweep_failed', 'skill_bundle_orphans_removed']);
  const other = [];
  const failing = createAssetSweeper({ db: { rpc: async (name) => { if (name === 'orphan_skill_bundles') throw Object.assign(new Error('bad'), { status: 502 }); return []; } }, files: {}, bundles: {}, log: (event, data) => other.push([event, data.status]) });
  assert.deepEqual((await failing.sweepOnce()).bundles, { found: 0, bytes: 0, removed: 0 });
  assert.deepEqual(other, [['skill_bundle_sweep_failed', 502]]);
});

test('the function that lists the zips nothing points to is for the server only, and looks at the table of skills by the path of the zip', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261009030000_orphan_skill_bundles.sql', import.meta.url), 'utf8');
  assert.match(sql, /bucket_id = 'user-skill-bundles'/);
  assert.match(sql, /not exists \(select 1 from public\.user_skills s where \(s\.user_id::text \|\| '\/' \|\| s\.name \|\| '\.zip'\) = o\.name\)/);
  assert.match(sql, /now\(\) - p_older_than/, 'a young file is never taken for an orphan');
  assert.match(sql, /revoke all on function public\.orphan_skill_bundles\(interval, integer\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.orphan_skill_bundles\(interval, integer\) to service_role;/);
  assert.match(sql, /security definer/);
});
