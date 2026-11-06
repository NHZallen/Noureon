import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { createLogger } from '../../server/log.js';
import { ProjectReadError, createProjectReader, messageForMember } from '../../server/project-reader.js';
import { formatSandboxRunBlock } from '../../src/app/ui/sandbox/sandbox-run-block.js';

// A member reads a shared project through the server (server/project-reader.js): the rows come from the database function, what belongs to the personal memory of the person who shared the
// project is taken out of the messages from before the sharing, a deleted conversation has no messages, and the route is for a signed-in person only.

const USER = '123e4567-e89b-12d3-a456-426614174000';
const PROJECT = '223e4567-e89b-12d3-a456-426614174001';
const TOKEN = 'good-token-good-token-good-token';
const SHARED_AT = '2026-11-06T00:00:00.000Z';

const runBlock = () => formatSandboxRunBlock({ status: 'done', steps: [], elapsedMs: 4000, tools: [{ kind: 'memory', key: 'memorySearching', count: 2, ids: ['n1'] }, { kind: 'skill', name: 'pdf' }] });
const rows = (overrides = {}) => ({
  role: 'chat', shared_at: SHARED_AT, has_more: false,
  project: { id: PROJECT, name: 'City plan', icon: 'book', color: 'blue', text_color: 'gray', instructions: 'Answer in English.', memory_scope: 'project' },
  owner_id: 'owner', owner_name: 'Ada',
  conversations: [
    { id: 'c1', author_id: 'owner', author_name: 'Ada', title: 'Old chat', model: 'm', provider: 'p', metadata: {}, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', deleted_at: null },
    { id: 'c2', author_id: 'bob', author_name: 'Bob', title: 'Branch', model: 'm', provider: 'p', metadata: { branchedFrom: { conversationId: 'c1', messageId: 'm2' }, secret: 'x' }, created_at: '2026-11-07T00:00:00Z', updated_at: '2026-11-08T00:00:00Z', deleted_at: null },
    { id: 'c3', author_id: 'bob', author_name: 'Bob', title: 'Gone', model: 'm', provider: 'p', metadata: {}, created_at: '2026-11-07T00:00:00Z', updated_at: '2026-11-09T00:00:00Z', deleted_at: '2026-11-09T00:00:00Z' }
  ],
  messages: [
    { id: 'm1', conversation_id: 'c1', role: 'user', parts: [{ text: 'q' }], metadata: null, sequence: 0, created_at: '2026-10-01T00:00:01Z' },
    { id: 'm2', conversation_id: 'c1', role: 'model', parts: [{ text: `${runBlock()}old answer` }], metadata: { memoryUsed: ['n1'], memoryUpdated: ['n2'], memoryHistory: [{ id: 'x' }], visionCheck: { ok: true } }, sequence: 1, created_at: '2026-10-01T00:00:02Z' },
    { id: 'm3', conversation_id: 'c2', role: 'model', parts: [{ text: `${runBlock()}new answer` }], metadata: { memoryUsed: ['p1'] }, sequence: 1, created_at: '2026-11-07T00:00:02Z' },
    { id: 'm4', conversation_id: 'c3', role: 'user', parts: [{ text: 'deleted' }], metadata: null, sequence: 0, created_at: '2026-11-07T00:00:01Z' }
  ],
  ...overrides
});

test('a message from before the sharing loses what belongs to the personal memory; a message after it stays as it is', () => {
  const before = messageForMember(rows().messages[1], { sharedAt: SHARED_AT });
  assert.deepEqual(before.metadata, { visionCheck: { ok: true } });
  assert.doesNotMatch(before.parts[0].text, /memorySearching/);
  assert.match(before.parts[0].text, /"pdf"/);
  assert.match(before.parts[0].text, /old answer/);
  const after = messageForMember(rows().messages[2], { sharedAt: SHARED_AT });
  assert.deepEqual(after.metadata, { memoryUsed: ['p1'] });
  assert.match(after.parts[0].text, /memorySearching/);
  assert.equal(messageForMember({ ...rows().messages[0] }, { sharedAt: SHARED_AT }).metadata, undefined);
});

test('the reader gives the project, the conversations with their messages and where to go on; a deleted conversation has none', async () => {
  const calls = [];
  const reader = createProjectReader({ db: { rpc: async (name, params) => { calls.push([name, params]); return rows(); } }, pageSize: 10 });
  const result = await reader.read({ userId: USER, projectId: PROJECT, since: '2026-10-31T00:00:00Z' });
  assert.deepEqual(calls, [['server_read_project_for_member', { p_user_id: USER, p_project_id: PROJECT, p_since: '2026-10-31T00:00:00Z', p_limit: 10, p_conversation_id: null }]]);
  assert.equal(result.role, 'chat');
  assert.equal(result.project.name, 'City plan');
  assert.deepEqual(result.owner, { id: 'owner', name: 'Ada' });
  assert.deepEqual(result.conversations.map((chat) => [chat.id, chat.authorName, chat.messages.length, chat.deleted]), [['c1', 'Ada', 2, false], ['c2', 'Bob', 1, false], ['c3', 'Bob', 0, true]]);
  // only the mark of a branch is kept of the metadata of a conversation
  assert.deepEqual(result.conversations[1].branchedFrom, { conversationId: 'c1', messageId: 'm2' });
  assert.equal(JSON.stringify(result).includes('"secret"'), false);
  assert.equal(result.next, '2026-11-09T00:00:00Z');
  assert.equal(result.hasMore, false);
});

test('a project that is not there for the person, or a database that fails, are told apart', async () => {
  await assert.rejects(() => createProjectReader({ db: { rpc: async () => null } }).read({ userId: USER, projectId: PROJECT }), (error) => error instanceof ProjectReadError && error.code === 'not_found');
  await assert.rejects(() => createProjectReader({ db: { rpc: async () => { throw new Error('down'); } } }).read({ userId: USER, projectId: PROJECT }), (error) => error instanceof ProjectReadError && error.code === 'database');
});

async function withServer(run, { projectReader }) {
  const config = loadConfig({ SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon', SOURCE_COMMIT: 'abc123' });
  const fetchImpl = async (url, options) => (options.headers.Authorization === `Bearer ${TOKEN}` ? new Response(JSON.stringify({ id: USER }), { status: 200 }) : new Response('{}', { status: 401 }));
  const server = createServer(createApp({ config, fetchImpl, projectReader, log: createLogger(() => {}) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve) => server.close(resolve)); }
}
const call = (base, body, { token = TOKEN, project = PROJECT } = {}) => fetch(`${base}/v1/projects/${project}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

test('POST /v1/projects/:id/read gives the page to a signed-in person, and says why when it cannot', async () => {
  const seen = [];
  const projectReader = createProjectReader({ db: { rpc: async (name, params) => { seen.push(params); return params.p_project_id === PROJECT ? rows() : null; } } });
  await withServer(async (base) => {
    const ok = await call(base, { since: '2026-10-31T00:00:00Z' });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.conversations.length, 3);
    assert.equal(seen[0].p_user_id, USER);
    assert.equal(seen[0].p_since, '2026-10-31T00:00:00Z');
    assert.equal((await call(base, {}, { token: '' })).status, 401);
    assert.equal((await call(base, { since: 'yesterday-ish' })).status, 400);
    assert.equal((await call(base, { conversationId: 'nope' })).status, 400);
    assert.equal((await call(base, { conversationId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' })).status, 200);
    assert.equal(seen.at(-1).p_conversation_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    assert.equal((await call(base, {}, { project: '323e4567-e89b-12d3-a456-426614174002' })).status, 404);
    assert.equal((await fetch(`${base}/v1/projects/not-an-id/read`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: '{}' })).status, 404);
  }, { projectReader });
  await withServer(async (base) => { assert.equal((await call(base, {})).status, 503); }, { projectReader: null });
});

test('a file of the project is given to a member as base64 only when the database says the project holds it', async () => {
  const PATH = `${USER}/${'a'.repeat(64)}`;
  const asked = [];
  const files = { loadPath: async (path) => { asked.push(path); if (path.endsWith('f'.repeat(64))) { const error = new Error('big'); error.code = 'too_large'; throw error; } return new Uint8Array([104, 105]); } };
  const db = { rpc: async (name, params) => (name === 'server_project_asset_allowed' ? params.p_path === PATH || params.p_path.endsWith('f'.repeat(64)) : null) };
  const reader = createProjectReader({ db, files });
  assert.deepEqual(await reader.asset({ userId: USER, projectId: PROJECT, path: PATH }), { data: 'aGk=' });
  await assert.rejects(() => reader.asset({ userId: USER, projectId: PROJECT, path: `${USER}/${'b'.repeat(64)}` }), (error) => error.code === 'not_found');
  assert.deepEqual(asked, [PATH]);
  await assert.rejects(() => reader.asset({ userId: USER, projectId: PROJECT, path: `${USER}/${'f'.repeat(64)}` }), (error) => error.code === 'too_large');
  await assert.rejects(() => createProjectReader({ db: { rpc: async () => { throw new Error('down'); } }, files }).asset({ userId: USER, projectId: PROJECT, path: PATH }), (error) => error.code === 'database');
  await withServer(async (base) => {
    const post = (body, token = TOKEN) => fetch(`${base}/v1/projects/${PROJECT}/asset`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const ok = await post({ path: PATH });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { data: 'aGk=' });
    assert.equal((await post({ path: PATH }, '')).status, 401);
    assert.equal((await post({ path: '../../etc/passwd' })).status, 400);
    assert.equal((await post({ path: `${USER}/${'b'.repeat(64)}` })).status, 404);
    assert.equal((await post({ path: `${USER}/${'f'.repeat(64)}` })).status, 413);
  }, { projectReader: reader });
});
