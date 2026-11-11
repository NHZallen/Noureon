import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspaceStoreV2 } from '../src/app/runtime/kernel/workspace-store-v2.js';
import { EMPTY_MESSAGES, evictInPlace, hydrateInPlace, isStub } from '../src/app/runtime/kernel/conversation-stub.js';

// The stub records of the on-demand loading (docs/superpowers/specs/2026-11-12-on-demand-loading-design.md): written with the conversation, read
// instead of it at the start, never written back, refilled in place, and always optional (anything that is not of the stored version is ignored).

const clock = () => '2026-11-12T12:00:00.000Z';
const quiet = { warn() {}, error() {}, info() {} };
const P = 'chatWS2:alice:';

function createFakeStorage() {
  const values = new Map();
  const log = { applies: [], reads: [] };
  return {
    values,
    log,
    async getItem(key) { log.reads.push(key); return values.has(key) ? values.get(key) : null; },
    async readItems(keys) { return keys.map(key => { log.reads.push(key); return values.has(key) ? values.get(key) : null; }); },
    async applyAtomic({ puts = [], removes = [] } = {}) {
      log.applies.push({ puts: puts.map(entry => entry.key), removes: [...removes] });
      for (const { key, value } of puts) values.set(key, value);
      for (const key of removes) values.delete(key);
    },
    async getKeys() { return [...values.keys()]; },
    async removeItemsByPrefix(prefix) { for (const key of [...values.keys()]) if (key.startsWith(prefix)) values.delete(key); }
  };
}

const BIG = 'A'.repeat(40000);
const conversation = (id, extra = {}) => ({
  id,
  title: `Chat ${id}`,
  createdAt: '2026-11-01T00:00:00.000Z',
  lastUpdatedAt: '2026-11-01T00:00:00.000Z',
  pinned: false,
  messages: [
    { id: `${id}-1`, role: 'user', parts: [{ text: '你好 hello' }] },
    { id: `${id}-2`, role: 'model', parts: [{ text: 'hi' }] }
  ],
  ...extra
});
const withPicture = id => conversation(id, { messages: [{ id: `${id}-1`, role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: BIG } }] }] });
const workspace = (...convs) => ({ conversations: convs, folders: [], astras: [], personalMemories: [], memoryState: { version: 2 } });
const make = (storage, stubs = true) => createWorkspaceStoreV2({ storage, username: 'alice', now: clock, logger: quiet, stubs });

test('with stubs on, a save writes the stub of every conversation it writes, in the same transaction; with them off it writes none', async () => {
  const on = createFakeStorage();
  await make(on).save(workspace(conversation('c1'), conversation('c2')));
  assert.deepEqual(on.log.applies[0].puts.filter(key => key.includes(':stub:')).sort(), [`${P}stub:c1`, `${P}stub:c2`]);
  const meta = JSON.parse(on.values.get(`${P}meta`));
  assert.equal(meta.conversations.c1.stubFp, meta.conversations.c1.fp);
  const stub = JSON.parse(on.values.get(`${P}stub:c1`));
  assert.equal(stub.title, 'Chat c1');
  assert.equal(stub.__count, 2);
  assert.equal('messages' in stub, false, 'the messages are not in the stub');

  const off = createFakeStorage();
  await make(off, false).save(workspace(conversation('c1')));
  assert.equal([...off.values.keys()].some(key => key.includes(':stub:')), false);
  assert.equal(JSON.parse(off.values.get(`${P}meta`)).conversations.c1.stubFp, undefined);
});

test('loadStubs gives stubs: no messages, a frozen empty list, the count, and no attachment is read', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  await store.save(workspace(withPicture('c1'), conversation('c2')));
  storage.log.reads.length = 0;
  const loaded = await store.loadStubs();
  assert.equal(loaded.state, 'ready');
  assert.deepEqual([loaded.stubCount, loaded.fullCount], [2, 0]);
  const [first, second] = loaded.workspace.conversations;
  assert.deepEqual([first.id, second.id], ['c1', 'c2']);
  assert.ok(isStub(first));
  assert.equal(first.title, 'Chat c1');
  assert.equal(first.__count, 1);
  assert.equal(first.messages, EMPTY_MESSAGES);
  assert.throws(() => first.messages.push({}), TypeError, 'a read of the messages that forgot to load shows itself');
  assert.equal(storage.log.reads.some(key => key.includes(':att:') || key.includes(':conv:')), false, 'neither a conversation nor an attachment was read');
  assert.deepEqual(loaded.workspace.memoryState, { version: 2 });
});

test('a conversation with no valid stub (old record, or a record written some other way) comes in full, and backfillStubs makes its stub', async () => {
  const storage = createFakeStorage();
  await make(storage, false).save(workspace(conversation('c1'), conversation('c2'), conversation('c3')));
  const store = make(storage);
  const first = await store.loadStubs();
  assert.deepEqual([first.stubCount, first.fullCount], [0, 3]);
  assert.equal(isStub(first.workspace.conversations[0]), false);
  assert.equal(first.workspace.conversations[0].messages.length, 2);

  const round = await store.backfillStubs({ limit: 2 });
  assert.deepEqual(round, { written: 2, remaining: 1 });
  assert.deepEqual(await store.backfillStubs({ limit: 2 }), { written: 1, remaining: 0 });
  assert.deepEqual(await store.backfillStubs(), { written: 0, remaining: 0 });
  const second = await store.loadStubs();
  assert.deepEqual([second.stubCount, second.fullCount], [3, 0]);
});

test('a stub that is not of the stored version is not used (a record written by another path leaves the stub behind)', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  await store.save(workspace(conversation('c1'), conversation('c2')));
  // what a repair that rewrites a record without knowing about stubs does: new text and fingerprint, the old stubFp
  const meta = JSON.parse(storage.values.get(`${P}meta`));
  const record = JSON.parse(storage.values.get(`${P}conv:c1`));
  record.messages.push({ id: 'c1-3', role: 'user', parts: [{ text: 'new' }] });
  const json = JSON.stringify(record);
  storage.values.set(`${P}conv:c1`, json);
  const { fingerprintText } = await import('../src/app/runtime/kernel/workspace-store-v2.js');
  meta.conversations.c1.fp = fingerprintText(json);
  storage.values.set(`${P}meta`, JSON.stringify(meta));
  const loaded = await store.loadStubs();
  assert.deepEqual([loaded.stubCount, loaded.fullCount], [1, 1]);
  assert.equal(loaded.workspace.conversations[0].messages.length, 3, 'the one with the old stub is read in full');
});

test('a save never writes a stub, and an unchanged mixed workspace writes nothing', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  await store.save(workspace(conversation('c1'), conversation('c2'), conversation('c3')));
  const loaded = await store.loadStubs();
  const count = storage.log.applies.length;
  const unchanged = await store.save(loaded.workspace);
  assert.equal(unchanged.wrote, false);
  assert.equal(storage.log.applies.length, count);

  // one conversation is read in full and changed: only it is written, the stubs stay as they are
  const { found } = await store.readConversations(['c2']);
  const full = found.get('c2');
  full.messages.push({ id: 'c2-3', role: 'user', parts: [{ text: 'more' }] });
  hydrateInPlace(loaded.workspace.conversations[1], full);
  const saved = await store.save(loaded.workspace);
  assert.equal(saved.written, 1);
  assert.deepEqual(storage.log.applies.at(-1).puts.sort(), [`${P}conv:c2`, `${P}meta`, `${P}stub:c2`].sort());
  assert.equal(JSON.parse(storage.values.get(`${P}stub:c2`)).__count, 3, 'its stub follows it');
  assert.equal(JSON.parse(storage.values.get(`${P}conv:c1`)).messages.length, 2, 'a conversation that was only a stub is as it was');
});

test('a stub that has no stored record is refused, not written as an empty chat', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  await store.save(workspace(conversation('c1')));
  const loaded = await store.loadStubs();
  loaded.workspace.conversations.push({ id: 'ghost', title: 'x', messages: EMPTY_MESSAGES, __stub: true });
  await assert.rejects(() => store.save(loaded.workspace), error => error.code === 'stub-without-record');
  assert.equal(storage.values.has(`${P}conv:ghost`), false);
});

test('a conversation taken out of the workspace loses its stub with its record; the integrity check knows the stubs and finds a left one', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  await store.save(workspace(conversation('c1'), conversation('c2')));
  assert.deepEqual(await store.checkIntegrity(), { state: 'ok', missing: [], orphans: [], missingAttachments: [] });
  const loaded = await store.loadStubs();
  loaded.workspace.conversations = loaded.workspace.conversations.filter(item => item.id !== 'c1');
  await store.save(loaded.workspace);
  assert.equal(storage.values.has(`${P}stub:c1`), false);
  assert.equal(storage.values.has(`${P}conv:c1`), false);
  storage.values.set(`${P}stub:left`, '{}');
  assert.deepEqual((await store.checkIntegrity()).orphans, [`${P}stub:left`]);
});

test('readConversations gives the full conversations with their attachments back in place, and says what it could not find', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  await store.save(workspace(withPicture('c1'), conversation('c2')));
  const { found, problems } = await store.readConversations(['c1', 'nope']);
  assert.equal(found.get('c1').messages[0].parts[0].inlineData.data, BIG);
  assert.deepEqual(problems, [{ id: 'nope', reason: 'not-indexed' }]);
});

test('isUnchanged tells whether the conversation in memory is what is stored (so it may be emptied)', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  const data = workspace(conversation('c1'));
  await store.save(data);
  assert.equal(await store.isUnchanged(data.conversations[0]), true);
  data.conversations[0].title = 'renamed';
  assert.equal(await store.isUnchanged(data.conversations[0]), false);
  assert.equal(await store.isUnchanged({ id: 'unknown', messages: [] }), false);
});

test('hydrating fills the same object, and evicting empties it again (whoever holds it sees both)', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  await store.save(workspace(conversation('c1', { council: { enabled: false } })));
  const loaded = await store.loadStubs();
  const held = loaded.workspace.conversations[0];
  const { found } = await store.readConversations(['c1']);
  const returned = hydrateInPlace(held, found.get('c1'));
  assert.equal(returned, held);
  assert.equal(held.messages.length, 2);
  assert.equal(isStub(held), false);
  assert.equal('__count' in held, false);
  assert.deepEqual(held.council, { enabled: false });
  evictInPlace(held);
  assert.equal(isStub(held), true);
  assert.equal(held.messages, EMPTY_MESSAGES);
  assert.equal(held.__count, 2);
  assert.equal(held.title, 'Chat c1');
  assert.equal(evictInPlace(held), held, 'a stub stays a stub');
});

test('a record that cannot be read in full still leaves the others usable, and its stub is not enough to lose it', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  await store.save(workspace(conversation('c1'), conversation('c2')));
  storage.values.delete(`${P}stub:c1`);
  storage.values.delete(`${P}conv:c1`);
  const loaded = await store.loadStubs();
  assert.equal(loaded.state, 'degraded');
  assert.deepEqual(loaded.problems.map(problem => problem.id), ['c1']);
  assert.deepEqual(loaded.workspace.conversations.map(item => item.id), ['c2']);
  // saving what loaded keeps the unreadable one in the index (nothing is deleted)
  await store.save(loaded.workspace);
  const meta = JSON.parse(storage.values.get(`${P}meta`));
  assert.deepEqual(meta.order, ['c2', 'c1']);
});

test('the fields of a stub that were changed (renamed, pinned, put in the trash and restored) are saved into the stored conversation; its messages stay as they were', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  await store.save(workspace(conversation('a'), conversation('b', { deletedAt: '2026-11-10T00:00:00.000Z', folderId: 'f1' })));
  const loaded = await store.loadStubs();
  const [a, b] = loaded.workspace.conversations;
  assert.equal(isStub(a) && isStub(b), true);

  // Nothing changed: nothing is written.
  storage.log.applies.length = 0;
  await store.save(loaded.workspace);
  assert.equal(storage.log.applies.length, 0, 'an unchanged mixed workspace writes nothing');

  // The person renames a, pins it and takes b out of the trash and out of its folder (a field removed).
  a.title = 'Renamed';
  a.pinned = true;
  b.deletedAt = null;
  delete b.folderId;
  await store.save(loaded.workspace);

  const again = make(storage);
  const whole = (await again.load()).workspace.conversations;
  const [fullA, fullB] = whole;
  assert.equal(fullA.title, 'Renamed');
  assert.equal(fullA.pinned, true);
  assert.equal(fullA.messages.length, 2, 'the messages of a stub are as they were');
  assert.equal(fullA.messages[0].parts[0].text, '你好 hello');
  assert.equal(fullB.deletedAt, null);
  assert.equal('folderId' in fullB, false, 'a field taken out of the stub is taken out of the conversation');
  // The stubs of the next start say the same, and a save of them changes nothing more.
  const next = await again.loadStubs();
  assert.equal(next.workspace.conversations[0].title, 'Renamed');
  assert.equal(next.workspace.conversations[1].deletedAt, null);
  storage.log.applies.length = 0;
  await again.save(next.workspace);
  assert.equal(storage.log.applies.length, 0);
  // And the same store that saved them does not write them again.
  storage.log.applies.length = 0;
  await store.save(loaded.workspace);
  assert.equal(storage.log.applies.length, 0, 'the change was written once');
});

test('a changed stub whose record cannot be read now is kept and saved at the next save, not lost and not refused', async () => {
  const storage = createFakeStorage();
  const store = make(storage);
  await store.save(workspace(conversation('a'), conversation('b')));
  const loaded = await store.loadStubs();
  const [a] = loaded.workspace.conversations;
  a.title = 'Renamed while unreadable';
  const key = `${P}conv:a`;
  const kept = storage.values.get(key);
  storage.values.delete(key);
  await store.save(loaded.workspace); // does not throw: the other conversations are saved
  storage.values.set(key, kept);
  await store.save(loaded.workspace);
  const whole = (await make(storage).load()).workspace.conversations;
  assert.equal(whole[0].title, 'Renamed while unreadable');
  assert.equal(whole[0].messages.length, 2);
});
