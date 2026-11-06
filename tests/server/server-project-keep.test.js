import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { createFileStore } from '../../server/file-store.js';
import { createLogger } from '../../server/log.js';
import { createProjectReader } from '../../server/project-reader.js';

// A member leaves, or the owner takes a member out, and the project keeps what the member made in it (server/project-reader.js `keepConversations`, supabase/migrations/20261106070000_add_project_conversation_rules.sql):
// the conversations are copied to the owner, with the files they hold; a file that does not fit, or is gone, is replaced by a line that says so; the member who leaves is never held back by it.

const OWNER = '123e4567-e89b-12d3-a456-426614174000';
const MEMBER = '323e4567-e89b-12d3-a456-426614174002';
const PROJECT = '223e4567-e89b-12d3-a456-426614174001';
const TOKEN = 'good-token-good-token-good-token';
const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const H3 = 'c'.repeat(64);

const collected = () => ({
  owner_id: OWNER, author_name: 'Bob',
  conversations: [{ id: 'c1', title: 'By Bob', summary: '', model: 'm', provider: 'p', metadata: {}, created_at: '2026-11-01T00:00:00Z' }],
  messages: [
    { id: 'm1', conversation_id: 'c1', role: 'user', parts: [{ text: 'see this' }, { inlineData: { name: 'a.png', data: { __astraCloudAsset: { path: `${MEMBER}/${H1}`, mimeType: 'image/png', encoding: 'base64' } } } }], sequence: 0, created_at: '2026-11-01T00:00:01Z' },
    { id: 'm2', conversation_id: 'c1', role: 'user', parts: [{ inlineData: { name: 'big.pdf', data: { __astraCloudAsset: { path: `${MEMBER}/${H2}`, mimeType: 'application/pdf', encoding: 'base64' } } } }, { inlineData: { name: 'gone.txt', data: { __astraCloudAsset: { path: `${MEMBER}/${H3}`, mimeType: 'text/plain', encoding: 'base64' } } } }], sequence: 1, created_at: '2026-11-01T00:00:02Z' },
    { id: 'm3', conversation_id: 'c1', role: 'model', parts: [{ text: 'ok' }], sequence: 2, created_at: '2026-11-01T00:00:03Z' }
  ]
});

const fakes = ({ data = collected(), status = {} } = {}) => {
  const calls = { rpc: [], copied: [] };
  const db = { rpc: async (name, params) => { calls.rpc.push([name, params]); if (name === 'server_collect_project_copy') return data; if (name === 'server_store_project_copy') return params.p_conversations.length; return null; } };
  const files = { copyFile: async ({ fromUserId, toUserId, hash }) => { calls.copied.push([fromUserId, toUserId, hash]); const result = status[hash] || 'copied'; if (result === 'error') throw new Error('down'); return { status: result, size: 1 }; } };
  return { db, files, calls };
};

test('the files are copied to the owner, the paths of the copies name the owner, and what could not be kept is told in the text', async () => {
  const { db, files, calls } = fakes({ status: { [H2]: 'quota', [H3]: 'missing' } });
  const result = await createProjectReader({ db, files }).keepConversations({ userId: MEMBER, projectId: PROJECT, memberId: MEMBER });
  assert.deepEqual(result, { conversations: 1, files: { copied: 1, skipped: 2 } });
  assert.deepEqual(calls.copied.map((entry) => entry[2]).sort(), [H1, H2, H3]);
  const stored = calls.rpc.find(([name]) => name === 'server_store_project_copy')[1];
  assert.equal(stored.p_member_id, MEMBER);
  assert.deepEqual(stored.p_messages[0].parts[1].inlineData.data.__astraCloudAsset.path, `${OWNER}/${H1}`);
  assert.deepEqual(stored.p_messages[1].parts, [{ text: '[Attachment not kept: big.pdf]' }, { text: '[Attachment not kept: gone.txt]' }]);
  assert.deepEqual(stored.p_messages[2].parts, [{ text: 'ok' }]);
  assert.equal(JSON.stringify(stored.p_messages).includes(MEMBER), false, 'nothing of the member’s folder is named by the copies');
});

test('a file the owner already has costs nothing and is kept; asking is refused for anybody who may not, and nothing is stored', async () => {
  const { db, files, calls } = fakes({ status: { [H1]: 'there', [H2]: 'there', [H3]: 'there' } });
  assert.deepEqual((await createProjectReader({ db, files }).keepConversations({ userId: OWNER, projectId: PROJECT, memberId: MEMBER })).files, { copied: 3, skipped: 0 });
  assert.equal(calls.rpc[0][1].p_actor_id, OWNER);
  const refused = fakes({ data: null });
  await assert.rejects(() => createProjectReader({ db: refused.db, files: refused.files }).keepConversations({ userId: OWNER, projectId: PROJECT, memberId: MEMBER }), (error) => error.code === 'forbidden');
  assert.equal(refused.calls.rpc.some(([name]) => name === 'server_store_project_copy'), false);
});

test('a member with no conversation in the project has nothing to copy; a storage that is down for every file stops the copy, one file that fails does not', async () => {
  const none = fakes({ data: { owner_id: OWNER, conversations: [], messages: [] } });
  assert.deepEqual(await createProjectReader({ db: none.db, files: none.files }).keepConversations({ userId: MEMBER, projectId: PROJECT, memberId: MEMBER }), { conversations: 0, files: { copied: 0, skipped: 0 } });
  const down = fakes({ status: { [H1]: 'error', [H2]: 'error', [H3]: 'error' } });
  await assert.rejects(() => createProjectReader({ db: down.db, files: down.files }).keepConversations({ userId: MEMBER, projectId: PROJECT, memberId: MEMBER }), (error) => error.code === 'database');
  assert.equal(down.calls.rpc.some(([name]) => name === 'server_store_project_copy'), false);
  const some = fakes({ status: { [H2]: 'error' } });
  const result = await createProjectReader({ db: some.db, files: some.files }).keepConversations({ userId: MEMBER, projectId: PROJECT, memberId: MEMBER });
  assert.deepEqual(result.files, { copied: 2, skipped: 1 });
});

test('the file store copies a file from one folder to another by the storage API, and says when it is there, missing, or does not fit', async () => {
  const seen = [];
  const have = new Set([`${MEMBER}/${H1}`, `${MEMBER}/${H2}`, `${OWNER}/${H3}`]);
  let used = 0;
  const fetchImpl = async (url, options = {}) => {
    seen.push([options.method || 'GET', url.replace('https://p.example/storage/v1/', '')]);
    const path = decodeURIComponent(url.split('/user-assets/')[1] || '');
    if (url.includes('/object/info/')) return have.has(path) ? new Response(JSON.stringify({ size: 10 }), { status: 200 }) : new Response('{}', { status: 404 });
    if (url.endsWith('/object/copy')) { const body = JSON.parse(options.body); have.add(body.destinationKey); return new Response('{}', { status: 200 }); }
    return new Response('{}', { status: 404 });
  };
  const db = { rpc: async () => used };
  const store = createFileStore({ url: 'https://p.example', serviceKey: 'svc', db, quotaBytes: 100, fetchImpl });
  assert.deepEqual(await store.copyFile({ fromUserId: MEMBER, toUserId: OWNER, hash: H1 }), { status: 'copied', size: 10 });
  assert.deepEqual(await store.copyFile({ fromUserId: MEMBER, toUserId: OWNER, hash: H1 }), { status: 'there', size: 0 });
  assert.deepEqual(await store.copyFile({ fromUserId: MEMBER, toUserId: OWNER, hash: H3 }), { status: 'there', size: 0 });
  assert.deepEqual(await store.copyFile({ fromUserId: MEMBER, toUserId: OWNER, hash: 'd'.repeat(64) }), { status: 'missing', size: 0 });
  used = 95;
  assert.deepEqual(await store.copyFile({ fromUserId: MEMBER, toUserId: OWNER, hash: H2 }), { status: 'quota', size: 10 });
  assert.equal(have.has(`${OWNER}/${H2}`), false);
  await assert.rejects(() => store.copyFile({ fromUserId: MEMBER, toUserId: OWNER, hash: '../x' }), /not the path/);
  assert.ok(seen.some(([method, url]) => method === 'POST' && url === 'object/copy'));
});

async function withServer(run, { projectReader }) {
  const config = loadConfig({ SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon', SOURCE_COMMIT: 'abc123' });
  const fetchImpl = async (url, options) => (options.headers.Authorization === `Bearer ${TOKEN}` ? new Response(JSON.stringify({ id: MEMBER }), { status: 200 }) : new Response('{}', { status: 401 }));
  const server = createServer(createApp({ config, fetchImpl, projectReader, log: createLogger(() => {}) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('POST /v1/projects/:id/keep-conversations keeps the conversations of the signed-in person, or of the member the owner names', async () => {
  const asked = [];
  const { db, files } = fakes();
  const reader = createProjectReader({ db: { rpc: async (name, params) => { asked.push([name, params]); return db.rpc(name, params); } }, files });
  await withServer(async (base) => {
    const post = (body, { token = TOKEN, project = PROJECT, raw = null } = {}) => fetch(`${base}/v1/projects/${project}/keep-conversations`, { method: 'POST', headers: { ...(raw === null ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: raw === null ? JSON.stringify(body) : raw });
    const mine = await post({});
    assert.equal(mine.status, 200);
    assert.deepEqual((await mine.json()).files, { copied: 3, skipped: 0 });
    assert.equal(asked[0][1].p_actor_id, MEMBER);
    assert.equal(asked[0][1].p_member_id, MEMBER);
    assert.equal((await post({ memberId: OWNER })).status, 200);
    assert.equal(asked.find(([, params]) => params.p_member_id === OWNER)[1].p_actor_id, MEMBER, 'the database decides whether the actor may ask');
    assert.equal((await post({}, { token: '' })).status, 401);
    assert.equal((await post({ memberId: 'nope' })).status, 400);
    assert.equal((await post({}, { project: 'not-an-id' })).status, 404);
  }, { projectReader: reader });
  const refused = fakes({ data: null });
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/projects/${PROJECT}/keep-conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ memberId: OWNER }) });
    assert.equal(response.status, 404);
  }, { projectReader: createProjectReader({ db: refused.db, files: refused.files }) });
});
