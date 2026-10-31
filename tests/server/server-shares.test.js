import assert from 'node:assert/strict';
import test from 'node:test';

import { ShareError, SHARE_LIMITS, createShares, newShareCode, textForShare } from '../../server/shares.js';
import { createShareStore } from '../../server/share-store.js';
import { formatSandboxRunBlock, liftSandboxRunBlock } from '../../src/app/ui/sandbox/sandbox-run-block.js';

const USER = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const marker = (hash, mimeType = 'image/png', userId = USER) => ({ __astraCloudAsset: { path: `${userId}/${hash}`, mimeType, encoding: 'base64' } });

const runBlock = (extra = {}) => formatSandboxRunBlock({ status: 'done', steps: [], elapsedMs: 4000, tools: [{ kind: 'memory', key: 'memorySearching', count: 2, ids: ['n1'] }, { kind: 'skill', name: 'pdf' }], thought: 'private thinking about the plan', ...extra });

const readOf = (overrides = {}) => ({
  conversation: { id: CONVERSATION, title: 'Strawberry cake', model: 'gemini-3.8-flash', provider: 'gemini', created_at: '2026-10-30T00:00:00.000Z' },
  active_shares: 0,
  messages: [
    { role: 'user', created_at: '2026-10-30T00:00:01.000Z', sequence: 0, parts: [{ text: 'How do I bake it?' }, { inlineData: { mimeType: 'image/png', name: 'cake.png', data: marker(HASH_A) } }] },
    { role: 'model', created_at: '2026-10-30T00:00:02.000Z', sequence: 1, parts: [{ text: `${runBlock()}Bake it at 170 degrees.` }, { sandboxFile: { id: 'f1', name: 'recipe.docx', mimeType: 'application/octet-stream', size: 5, data: Buffer.from('hello').toString('base64') } }, { generatedImage: { id: 'g1', storageKey: 'x', blob: marker(HASH_A) } }] }
  ],
  ...overrides
});

function setup({ read = readOf(), copy = async () => ({ size: 1000, mimeType: 'image/png' }), finish = true, existing = [], sharesRow = null } = {}) {
  const calls = [];
  const removed = [];
  const store = {
    copyUserFile: async (args) => { calls.push(['copy', args.hash]); return copy(args); },
    putBytes: async ({ bytes }) => { calls.push(['put', bytes.byteLength]); return { hash: HASH_B, size: bytes.byteLength }; },
    list: async () => existing,
    removeAll: async (names) => { removed.push(...names); return names.length; }
  };
  const db = {
    rpc: async (name, params) => {
      calls.push([name, params]);
      if (name === 'server_read_conversation_for_share') return read;
      if (name === 'server_create_conversation_share') return null;
      if (name === 'server_finish_conversation_share') return finish;
      if (name === 'server_get_conversation_share') return sharesRow;
      if (name === 'server_drop_conversation_share') return true;
      if (name === 'server_drop_stale_building_shares') return 1;
      if (name === 'orphan_shared_assets') return [{ name: `${'3'.repeat(8)}-3333-4333-8333-333333333333/${HASH_A}` }];
      return null;
    }
  };
  return { shares: createShares({ db, store, now: () => Date.parse('2026-10-31T00:00:00Z') }), calls, removed };
}

test('a code is 32 letters and digits, drawn from random numbers, and never the same twice', () => {
  const codes = new Set(Array.from({ length: 200 }, () => newShareCode()));
  assert.equal(codes.size, 200);
  for (const code of codes) assert.match(code, /^[0-9A-Za-z]{32}$/);
  assert.match(newShareCode(() => new Uint8Array(48).fill(255).map((byte, index) => (index < 40 ? 255 : 10))), /^[0-9A-Za-z]{32}$/, 'bytes that would bias the letters are skipped');
});

test('the record of what the model did goes with the reply, without the steps of the memory', () => {
  const text = textForShare(`${runBlock()}The answer.`, 'model');
  const { run, text: rest } = liftSandboxRunBlock(text);
  assert.equal(rest, 'The answer.');
  assert.deepEqual(run.tools, [{ kind: 'skill', name: 'pdf' }], 'the memory row is gone, the skill stays');
  assert.equal(run.thought, 'private thinking about the plan', 'the thinking is shared (the owner decided)');
  assert.equal(textForShare('plain words', 'model'), 'plain words');
  assert.equal(textForShare(`${runBlock()}x`, 'user'), `${runBlock()}x`, 'only replies carry a record');
});

test('a share is made: the snapshot has no memory, the files are copied once into the share\'s folder, and the row becomes active', async () => {
  const { shares, calls } = setup();
  const result = await shares.create({ userId: USER, conversationId: CONVERSATION, mode: 'continue', showName: true, ownerName: '  Allen   Niu ' });
  assert.deepEqual([result.mode, result.showName, result.title], ['continue', true, 'Strawberry cake']);
  assert.match(result.code, /^[0-9A-Za-z]{32}$/);
  const create = calls.find((call) => call[0] === 'server_create_conversation_share')[1];
  assert.deepEqual([create.p_user_id, create.p_mode, create.p_show_name, create.p_owner_name, create.p_limit], [USER, 'continue', true, 'Allen Niu', 30]);
  assert.equal(calls.filter((call) => call[0] === 'copy').length, 1, 'the same file is copied once');
  const finish = calls.find((call) => call[0] === 'server_finish_conversation_share')[1];
  const snapshot = finish.p_snapshot;
  assert.deepEqual([snapshot.v, snapshot.title, snapshot.modelName], [1, 'Strawberry cake', 'Gemini 3.8 Flash']);
  assert.equal(snapshot.messages.length, 2);
  const attachment = snapshot.messages[0].parts[1].inlineData.data.__astraSharedAsset;
  assert.deepEqual([attachment.path, attachment.mimeType, attachment.size], [`${create.p_share_id}/${HASH_A}`, 'image/png', 1000]);
  const kept = snapshot.messages[1].parts[1].sandboxFile.data.__astraSharedAsset;
  assert.equal(kept.path, `${create.p_share_id}/${HASH_B}`, 'bytes that were never moved to the person\'s folder are kept in the share\'s');
  assert.equal(JSON.stringify(snapshot).includes(USER), false, 'nothing of the person\'s own folder is left in the snapshot');
  assert.equal(JSON.stringify(snapshot).includes('memorySearching'), false);
  assert.equal(finish.p_snapshot_bytes, Buffer.byteLength(JSON.stringify(snapshot)));
});

test('a share is refused at the limit, for a conversation that is not the person\'s, and for a mode that does not exist', async () => {
  const full = setup({ read: readOf({ active_shares: SHARE_LIMITS.shares }) });
  await assert.rejects(() => full.shares.create({ userId: USER, conversationId: CONVERSATION, mode: 'view' }), (error) => error instanceof ShareError && error.code === 'limit');
  assert.equal(full.calls.some((call) => call[0] === 'server_create_conversation_share'), false, 'nothing was made');
  await assert.rejects(() => setup({ read: null }).shares.create({ userId: USER, conversationId: CONVERSATION, mode: 'view' }), (error) => error.code === 'not_found');
  await assert.rejects(() => setup().shares.create({ userId: USER, conversationId: CONVERSATION, mode: 'edit' }), (error) => error.code === 'bad_request');
});

test('a share that cannot be finished is taken away again with its files', async () => {
  const failing = setup({ copy: async () => { const error = new Error('storage down'); error.status = 500; throw error; }, existing: [`s/${HASH_A}`] });
  await assert.rejects(() => failing.shares.create({ userId: USER, conversationId: CONVERSATION, mode: 'view' }), (error) => error.code === 'storage');
  assert.ok(failing.calls.some((call) => call[0] === 'server_drop_conversation_share'), 'the row is dropped, so it does not count toward the limit');
  const big = setup({ copy: async () => ({ size: SHARE_LIMITS.assetBytes + 1, mimeType: 'image/png' }) });
  await assert.rejects(() => big.shares.create({ userId: USER, conversationId: CONVERSATION, mode: 'view' }), (error) => error.code === 'too_large' && error.extra.what === 'files');
  const text = readOf();
  text.messages[0].parts.push({ text: 'x'.repeat(SHARE_LIMITS.snapshotBytes + 10) });
  await assert.rejects(() => setup({ read: text }).shares.create({ userId: USER, conversationId: CONVERSATION, mode: 'view' }), (error) => error.code === 'too_large' && error.extra.what === 'text');
  const unfinished = setup({ finish: false });
  await assert.rejects(() => unfinished.shares.create({ userId: USER, conversationId: CONVERSATION, mode: 'view' }), (error) => error.code === 'database');
});

test('a refresh makes the snapshot again, keeps the code, and removes the files the conversation no longer holds', async () => {
  const shareId = '44444444-4444-4444-8444-444444444444';
  const row = { id: shareId, conversation_id: CONVERSATION, code: 'K'.repeat(32), mode: 'view', show_name: false, owner_name: '', title: 'old', status: 'active', created_at: '2026-10-29T00:00:00Z' };
  const stale = `${shareId}/${HASH_B.replace(/b/g, 'c')}`;
  const { shares, removed } = setup({ sharesRow: row, existing: [`${shareId}/${HASH_A}`, stale] });
  const result = await shares.refresh({ userId: USER, shareId });
  assert.deepEqual([result.code, result.mode, result.title], ['K'.repeat(32), 'view', 'Strawberry cake']);
  assert.deepEqual(removed, [stale], 'only the file that is not in the new snapshot goes');
  await assert.rejects(() => setup({ sharesRow: null }).shares.refresh({ userId: USER, shareId }), (error) => error.code === 'not_found');
  await assert.rejects(() => setup({ sharesRow: { ...row, status: 'conversation_deleted' } }).shares.refresh({ userId: USER, shareId }), (error) => error.code === 'not_active');
});

test('the sweep removes the files no share points to and drops the shares that stayed half made, and never throws', async () => {
  const { shares, removed } = setup();
  const result = await shares.sweepOnce();
  assert.deepEqual([result.dropped, result.removed], [1, 1]);
  assert.equal(removed.length, 1);
  const broken = createShares({ db: { rpc: async () => { throw new Error('database down'); } }, store: { removeAll: async () => 0 } });
  assert.deepEqual(await broken.sweepOnce(), { removed: 0, dropped: 0 });
});

test('the store copies a file of the person into the share\'s folder through the storage API, and refuses a path that is not a person\'s file', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET', body: options.body });
    if (String(url).includes('/object/info/')) return new Response(JSON.stringify({ size: 321, content_type: 'image/png' }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  const store = createShareStore({ url: 'https://x.supabase.test', serviceKey: 'service', fetchImpl });
  const shareId = '55555555-5555-4555-8555-555555555555';
  assert.deepEqual(await store.copyUserFile({ userId: USER, shareId, hash: HASH_A }), { size: 321, mimeType: 'image/png' });
  const copy = requests.find((request) => request.url.endsWith('/object/copy'));
  assert.deepEqual(JSON.parse(copy.body), { bucketId: 'user-assets', sourceKey: `${USER}/${HASH_A}`, destinationBucket: 'shared-assets', destinationKey: `${shareId}/${HASH_A}` });
  await assert.rejects(() => store.copyUserFile({ userId: 'not-an-id', shareId, hash: HASH_A }));
  await assert.rejects(() => store.copyUserFile({ userId: USER, shareId, hash: '../etc' }));
  assert.equal(await store.removeAll(['../x', `${shareId}/${HASH_A}`]), 1, 'only a name of the right form is removed');
  const missing = createShareStore({ url: 'https://x.supabase.test', serviceKey: 'service', fetchImpl: async () => new Response('{}', { status: 404 }) });
  assert.equal(await missing.copyUserFile({ userId: USER, shareId, hash: HASH_A }), null, 'a file that is not there any more is not an error');
});
