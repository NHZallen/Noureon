import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspaceStoreV2 } from '../src/app/runtime/kernel/workspace-store-v2.js';
import { createConversationLoader } from '../src/app/runtime/kernel/conversation-loader.js';
import { conversationStubFlags } from '../src/app/runtime/kernel/conversation-stub-flags.js';
import { isStub, refreezeStubs } from '../src/app/runtime/kernel/conversation-stub.js';

// The whole life of a conversation with on-demand loading, against the real store and loader (fake storage): the page starts with stubs, one is opened, changed and saved
// while the others stay stubs, it is let go of, and what is stored afterwards is whole for every conversation.

const quiet = { warn() {}, error() {}, info() {} };
const clock = () => '2026-11-12T12:00:00.000Z';
function fakeStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async readItems(keys) { return keys.map(key => (values.has(key) ? values.get(key) : null)); },
    async applyAtomic({ puts = [], removes = [] } = {}) { for (const { key, value } of puts) values.set(key, value); for (const key of removes) values.delete(key); },
    async getKeys() { return [...values.keys()]; },
    async removeItemsByPrefix(prefix) { for (const key of [...values.keys()]) if (key.startsWith(prefix)) values.delete(key); }
  };
}
const conversation = (id, n, extra = {}) => ({
  id, title: `Chat ${id}`, createdAt: '2026-11-01T00:00:00.000Z', lastUpdatedAt: '2026-11-01T00:00:00.000Z', pinned: false,
  messages: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, role: i % 2 ? 'model' : 'user', parts: [{ text: `message ${i} of ${id}` }] })),
  ...extra
});
const workspace = (...conversations) => ({ conversations, folders: [], astras: [], personalMemories: [], memoryState: { version: 2 } });

test('open one stub, change it, save: the others are untouched; let it go and every conversation is still whole in the store', async () => {
  const storage = fakeStorage();
  const store = createWorkspaceStoreV2({ storage, username: 'alice', now: clock, logger: quiet, stubs: true, stubFlags: conversationStubFlags });
  await store.save(workspace(conversation('a', 4), conversation('b', 6, { council: undefined }), conversation('c', 2)));

  // A new page: everything is a stub.
  const loaded = await store.loadStubs();
  assert.equal(loaded.state, 'ready');
  const conversations = loaded.workspace.conversations;
  refreezeStubs(conversations);
  assert.equal(conversations.every(isStub), true);
  assert.deepEqual(conversations.map(entry => entry.__count), [4, 6, 2]);

  const loader = createConversationLoader({ getStore: () => store, getConversations: () => conversations, keep: 0, logger: quiet });
  const b = conversations.find(entry => entry.id === 'b');
  await loader.ensureLoaded(['b']);
  assert.equal(isStub(b), false);
  assert.equal(b.messages.length, 6);

  // The person writes in b; the workspace (b whole, a and c stubs) is saved.
  b.messages.push({ id: 'b-6', role: 'user', parts: [{ text: 'a new message' }] });
  b.lastUpdatedAt = '2026-11-12T12:01:00.000Z';
  await store.save(loaded.workspace);
  assert.equal(await store.isUnchanged(b), true, 'what is in memory is what is stored');

  // Let go of it (nothing is using it): it is a stub again with the new count.
  assert.deepEqual(await loader.trim(), ['b']);
  assert.equal(isStub(b), true);
  assert.equal(b.__count, 7);

  // A later page, reading everything in full, finds every conversation whole and b with its new message.
  const again = createWorkspaceStoreV2({ storage, username: 'alice', now: clock, logger: quiet, stubs: true });
  const whole = await again.load();
  assert.equal(whole.state, 'ready');
  const byId = Object.fromEntries(whole.workspace.conversations.map(entry => [entry.id, entry]));
  assert.deepEqual([byId.a.messages.length, byId.b.messages.length, byId.c.messages.length], [4, 7, 2]);
  assert.equal(byId.b.messages.at(-1).parts[0].text, 'a new message');
  assert.equal(byId.a.messages[0].parts[0].text, 'message 0 of a', 'a was never read and is as it was');
  // And the stubs of a later start say the same.
  const stubs = (await again.loadStubs()).workspace.conversations;
  assert.deepEqual(stubs.map(entry => [entry.id, entry.__count]), [['a', 4], ['b', 7], ['c', 2]]);
});

test('a conversation with unsaved changes is never let go of', async () => {
  const storage = fakeStorage();
  const store = createWorkspaceStoreV2({ storage, username: 'alice', now: clock, logger: quiet, stubs: true });
  await store.save(workspace(conversation('a', 2), conversation('b', 2)));
  const conversations = (await store.loadStubs()).workspace.conversations;
  refreezeStubs(conversations);
  const loader = createConversationLoader({ getStore: () => store, getConversations: () => conversations, keep: 0, logger: quiet });
  await loader.ensureLoaded(['a']);
  conversations.find(entry => entry.id === 'a').messages.push({ id: 'a-2', role: 'user', parts: [{ text: 'not saved yet' }] });
  assert.deepEqual(await loader.trim(), [], 'the message is not in the store yet: the conversation stays whole');
  assert.equal(conversations.find(entry => entry.id === 'a').messages.length, 3);
});
