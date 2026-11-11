import assert from 'node:assert/strict';
import test from 'node:test';

import { ConversationLoadError, createConversationLoader } from '../src/app/runtime/kernel/conversation-loader.js';
import { EMPTY_MESSAGES, defaultStubOf, isStub, stubObjectFrom } from '../src/app/runtime/kernel/conversation-stub.js';

const full = (id, n = 2) => ({ id, title: `T${id}`, messages: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, parts: [{ text: 'x' }] })) });
const stubOf = id => stubObjectFrom(defaultStubOf(full(id)));

function setup({ ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'], keep = 2 } = {}) {
  const conversations = ids.map(stubOf);
  const stored = new Map(ids.map(id => [id, full(id)]));
  const reads = [];
  const hooks = { onCheck: null };
  const saved = new Set(ids); // ids whose memory version equals the stored one
  const store = {
    async readConversations(wanted) {
      reads.push([...wanted]);
      await Promise.resolve();
      const found = new Map();
      const problems = [];
      for (const id of wanted) (stored.has(id) ? found.set(id, structuredClone(stored.get(id))) : problems.push({ id, reason: 'missing' }));
      return { found, problems };
    },
    async isUnchanged(conversation) { hooks.onCheck?.(conversation); return saved.has(conversation.id); }
  };
  let tick = 0;
  const busy = new Set();
  const loader = createConversationLoader({ getStore: () => store, getConversations: () => conversations, normalizeRecord: record => ({ ...record, normalized: true }), inUse: c => busy.has(c.id), keep, now: () => ++tick, logger: { warn() {} } });
  return { conversations, loader, reads, saved, busy, stored, hooks };
}

test('ensureLoaded fills the stub in place (the same object), once however many ask at the same time', async () => {
  const { conversations, loader, reads } = setup();
  const held = conversations[0];
  await Promise.all([loader.ensureLoaded(['a']), loader.ensureLoaded('a'), loader.ensureLoaded(['a', 'b'])]);
  assert.equal(conversations[0], held);
  assert.equal(isStub(held), false);
  assert.equal(held.messages.length, 2);
  assert.equal(held.normalized, true, 'what is read is normalized like the rest of the workspace');
  assert.equal(reads.flat().filter(id => id === 'a').length, 1, 'one read of a');
  await loader.ensureLoaded(['a']);
  assert.equal(reads.length, 2, 'a conversation that is in memory is not read again');
});

test('a conversation that cannot be read rejects with what could not, and stays a stub; the others are filled', async () => {
  const { conversations, loader, stored } = setup();
  stored.delete('b');
  await assert.rejects(() => loader.ensureLoaded(['a', 'b']), error => error instanceof ConversationLoadError && error.ids.join() === 'b');
  assert.equal(isStub(conversations[0]), false);
  assert.equal(isStub(conversations[1]), true);
  assert.equal(conversations[1].messages, EMPTY_MESSAGES);
});

test('a conversation taken out while it was read is not brought back, and one filled by someone else is left alone', async () => {
  const { conversations, loader } = setup();
  const pending = loader.ensureLoaded(['a']);
  conversations.splice(0, 1);
  await pending;
  assert.deepEqual(conversations.map(c => c.id), ['b', 'c', 'd', 'e', 'f', 'g']);
});

test('trim empties the least recently used ones beyond the number to keep, never one in use, one waiting for its save or one that is not yet saved', async () => {
  const { conversations, loader, saved, busy } = setup({ keep: 2 });
  for (const id of ['a', 'b', 'c', 'd', 'e']) await loader.ensureLoaded([id]);
  assert.deepEqual(loader.tracked().sort(), ['a', 'b', 'c', 'd', 'e']);
  busy.add('a');
  saved.delete('b');
  const emptied = await loader.trim();
  // oldest first among the ones past the two newest (d, e): a (busy, stays), b (unsaved, stays), c (emptied)
  assert.deepEqual(emptied, ['c']);
  assert.equal(isStub(conversations[2]), true);
  assert.equal(conversations[2].__count, 2);
  assert.equal(isStub(conversations[0]), false);
  assert.equal(isStub(conversations[1]), false);
  busy.clear();
  saved.add('b');
  assert.deepEqual((await loader.trim()).sort(), ['a', 'b']);
  await loader.ensureLoaded(['c']);
  assert.equal(conversations[2].messages.length, 2, 'what was let go can be read again');
});

test('touching a conversation makes it recent, so it is kept', async () => {
  const { conversations, loader } = setup({ keep: 1 });
  await loader.ensureLoaded(['a']);
  await loader.ensureLoaded(['b']);
  loader.touch('a');
  assert.deepEqual(await loader.trim(), ['b']);
  assert.equal(isStub(conversations[0]), false);
});

test('a conversation that became busy while it was checked is not emptied', async () => {
  const { conversations, loader, busy, hooks } = setup({ keep: 0 });
  await loader.ensureLoaded(['a']);
  hooks.onCheck = conversation => busy.add(conversation.id);
  assert.deepEqual(await loader.trim(), []);
  assert.equal(isStub(conversations[0]), false);
});
