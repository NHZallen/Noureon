import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createAssetSweeper } from '../../server/asset-sweeper.js';
import { finishAdvancedReply } from '../../server/advanced-reply.js';
import { createFileStore, FileStoreError, USER_ASSET_QUOTA_BYTES } from '../../server/file-store.js';

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
