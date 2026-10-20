import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { createConversationShadowSync } from '../src/app/sync/cloud-sync-v2.js';
import { encodeWorkspaceConversationShadow } from '../src/app/sync/cloud-sync-v2-codecs.js';
import { conversationDeleteFingerprint, conversationDeleteMatchKeys, uniqueConversationsById } from '../src/app/sync/cloud-sync-v2-delete-match.js';
import { mergeRemoteIntoEntityDirtyLocal, reconcileEncodedMessageIds } from '../src/app/sync/cloud-sync-v2-merge.js';
import { withoutDeleted } from '../src/app/sync/cloud-sync-v2-remote-apply.js';
import { createTombstoneIndex } from '../src/app/sync/cloud-sync-v2-deletions.js';
import { ShadowSyncStoppedError, messageSequenceKey, parseLocalWorkspace, summarizeWorkspace } from '../src/app/sync/cloud-sync-v2-shared.js';

const userId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';

const conversation = (messages, metadata = {}) => ({
  id: conversationId,
  title: 'A chat',
  createdAt: '2026-10-01T10:00:00.000Z',
  ...metadata,
  messages
});
const message = (role, text, createdAt) => ({ role, parts: [{ text }], createdAt });

async function cloudRows(workspace) {
  const encoded = await encodeWorkspaceConversationShadow({ workspace, userId, cryptoProvider: webcrypto });
  return {
    folders: encoded.folders,
    conversations: encoded.conversations.map(row => ({ ...row, updated_at: row.created_at })),
    messages: encoded.messages.map(row => ({ ...row, updated_at: row.created_at })),
    astras: []
  };
}

function fakeRepository(rows) {
  const uploads = [];
  return {
    uploads,
    repository: {
      paginatedSnapshotsAreComplete: true,
      probe: async () => ({ schema_version: 2, migration_state: 'ready' }),
      fetchTombstones: async () => [],
      fetchWorkspace: async () => structuredClone(rows),
      setMigrationState: async () => {},
      upsertFolders: async () => {},
      upsertConversations: async items => uploads.push(['conversations', items]),
      upsertMessages: async items => uploads.push(['messages', items]),
      upsertAstras: async () => {},
      verify: async () => true
    }
  };
}

test('a conversation cut back by an edit and answered again: the sync sends the cloud\'s messages past the cut as deleted, and the new answer', async () => {
  const before = { folders: [], conversations: [conversation([
    message('user', 'First question', '2026-10-01T10:00:00.000Z'),
    message('model', 'First answer', '2026-10-01T10:00:05.000Z'),
    message('user', 'Second question', '2026-10-01T10:01:00.000Z'),
    message('model', 'Second answer', '2026-10-01T10:01:05.000Z')
  ])] };
  const { repository, uploads } = fakeRepository(await cloudRows(before));
  let scheduled = null;
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => structuredClone(before),
    userId,
    cryptoProvider: webcrypto,
    canSkipInitialUpload: () => true,
    schedule: callback => { scheduled = callback; return 1; },
    cancel: () => {}
  });
  assert.equal((await sync.initialize()).uploadSkipped, true);

  // The second question was edited: the conversation is cut back after the first answer, and the edited question is answered again.
  const cutAt = '2026-10-01T10:02:00.000Z';
  const after = { folders: [], conversations: [conversation([
    message('user', 'First question', '2026-10-01T10:00:00.000Z'),
    message('model', 'First answer', '2026-10-01T10:00:05.000Z'),
    message('user', 'Second question, edited', '2026-10-01T10:02:00.000Z'),
    message('model', 'The new answer', '2026-10-01T10:02:05.000Z')
  ], { messagesCutAt: cutAt })] };
  assert.equal(sync.captureWorkspace(after), true);
  await scheduled();

  assert.equal(sync.getStatus().state, 'ready');
  const sentMessages = uploads.filter(([kind]) => kind === 'messages').flatMap(([, items]) => items);
  const live = sentMessages.filter(row => !row.deleted_at).map(row => row.parts[0].text);
  assert.deepEqual(live.sort(), ['Second question, edited', 'The new answer'].sort(), 'the edited question and the new answer are sent');
  // Each place in the conversation is sent once (no second row for the same sequence).
  const keys = sentMessages.map(messageSequenceKey);
  assert.equal(new Set(keys).size, keys.length);
});

test('message ids are matched to the cloud\'s by their place; two cloud messages in one place stop the upload instead of guessing', () => {
  const baseline = { messages: [{ id: 'cloud-1', conversation_id: 'c', sequence: 0 }, { id: 'cloud-2', conversation_id: 'c', sequence: 1 }] };
  const encoded = { messages: [{ id: 'local-1', conversation_id: 'c', sequence: 0 }, { id: 'local-2', conversation_id: 'c', sequence: 1 }] };
  const matched = reconcileEncodedMessageIds(encoded, baseline);
  assert.equal(matched.safe, true);
  assert.deepEqual(matched.encoded.messages.map(row => row.id), ['cloud-1', 'cloud-2']);

  const twoInOnePlace = { messages: [...baseline.messages, { id: 'cloud-3', conversation_id: 'c', sequence: 1 }] };
  assert.deepEqual(reconcileEncodedMessageIds(encoded, twoInOnePlace), { encoded, safe: false, reason: 'ambiguous-remote-message-sequence' });
});

test('a local change not uploaded yet is kept over the cloud\'s version of the same conversation; the others take the cloud\'s', () => {
  const local = { conversations: [
    { id: 'dirty', title: 'Renamed here', messages: [] },
    { id: 'clean', title: 'Old title', messages: [] }
  ], folders: [], astras: [] };
  const cloud = { conversations: [
    { id: 'dirty', title: 'Cloud title', messages: [] },
    { id: 'clean', title: 'New cloud title', messages: [] }
  ], folders: [], astras: [] };
  const merged = mergeRemoteIntoEntityDirtyLocal(local, cloud, { conversations: ['dirty'] });
  const titleOf = id => merged.conversations.find(item => item.id === id).title;
  assert.equal(titleOf('dirty'), 'Renamed here');
});

test('a conversation deleted forever is recognized in the cloud by its content when its id there is another', () => {
  const local = conversation([message('user', 'Plan the trip', '2026-10-01T10:00:00.000Z'), message('model', 'Here is a plan', '2026-10-01T10:00:05.000Z')]);
  const copy = { ...structuredClone(local), id: 'another-id' };
  assert.equal(conversationDeleteFingerprint(copy), conversationDeleteFingerprint(local));
  const renamed = { ...structuredClone(copy), title: 'Renamed elsewhere' };
  const keys = conversationDeleteMatchKeys(local);
  assert.ok([...conversationDeleteMatchKeys(renamed)].some(key => keys.has(key)), 'a renamed copy still shares a match key');
  assert.equal(uniqueConversationsById([local, structuredClone(local)]).length, 1);
});

test('the shared helpers: what was deleted forever is left out, a workspace is counted, a damaged local workspace is refused', () => {
  const workspace = { conversations: [{ id: 'kept', messages: [{}] }, { id: 'gone', messages: [{}, {}] }], folders: [], astras: [{ id: 'n1' }] };
  const tombstones = createTombstoneIndex([{ entity_type: 'conversation', entity_id: 'gone' }]);
  const left = withoutDeleted(workspace, tombstones, new Set(['n1']));
  assert.deepEqual(left.conversations.map(item => item.id), ['kept']);
  assert.deepEqual(left.astras, []);
  assert.equal(summarizeWorkspace(workspace).messages, 3);
  assert.throws(() => parseLocalWorkspace('{not json'), { name: 'LocalWorkspaceDataError' });
  assert.equal(new ShadowSyncStoppedError().name, 'ShadowSyncStoppedError');
});

test('stop() while a permanent delete is under way ends it without touching the cloud', async () => {
  const rows = await cloudRows({ folders: [], conversations: [conversation([message('user', 'Hi', '2026-10-01T10:00:00.000Z')])] });
  const { repository } = fakeRepository(rows);
  let deleted = 0;
  repository.permanentlyDeleteConversations = async () => { deleted += 1; };
  // The delete reads the local copies of the conversations: held until the sync is stopped.
  let gated = false;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let reachedGate;
  const atGate = new Promise(resolve => { reachedGate = resolve; });
  const sync = createConversationShadowSync({
    repository,
    readWorkspace: async () => {
      if (gated) {
        reachedGate();
        await gate;
      }
      return { folders: [], conversations: [] };
    },
    userId,
    cryptoProvider: webcrypto,
    canSkipInitialUpload: () => true,
    schedule: () => 1,
    cancel: () => {}
  });
  await sync.initialize();
  gated = true;
  const deleting = sync.permanentlyDeleteConversations([conversationId]);
  await atGate;
  sync.stop();
  release();
  await assert.rejects(deleting, { name: 'ShadowSyncStoppedError' });
  assert.equal(deleted, 0);
});
