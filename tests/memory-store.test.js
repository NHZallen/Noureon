import assert from 'node:assert/strict';
import test from 'node:test';

import { createCloudBackend, createLocalBackend, createMemoryBackend } from '../src/app/runtime/memory-store/backends.js';
import { createNotesStore } from '../src/app/runtime/memory-store/notes-store.js';
import { createNote } from '../src/app/runtime/memory-notes/notes.js';
import { applyWrite } from '../src/app/runtime/memory-notes/write-check.js';
import { makeTombstone } from '../src/app/runtime/memory-notes/tombstone.js';
import { mergeNotes, noteFromRow, rowFromNote } from '../src/app/runtime/memory-notes/records.js';
import { createFakeTable } from './helpers/fake-memory-supabase.js';

const T = (iso) => () => iso;
const make = (id, text, extra = {}) => createNote({ id, text, keywords: extra.keywords || [id], observedAt: extra.observedAt, source: { conversationId: 'c1', messageIds: [`m-${id}`], quote: 'q', seen: ['c1|2026-10-01'] }, now: T(extra.at || '2026-10-01T00:00:00.000Z') });
const quiet = { warn() {} };

test('a store reads its rows, saves what is new or changed, and keeps the settings, the cursors and the events', async () => {
  const store = await createNotesStore({ backend: createMemoryBackend(), logger: quiet }).load();
  assert.deepEqual(store.getNotes(), []);
  assert.equal(store.getSettings().learn, true);
  const a = make('a', '使用者住在台中');
  assert.equal(await store.commitNotes([a]), 1);
  assert.equal(await store.commitNotes([a]), 0, 'nothing changed: nothing written');
  assert.deepEqual(store.getNotes().map((note) => note.id), ['a']);
  assert.equal(store.getRow('note:a').version, 1);
  await store.commitNotes([{ ...a, text: '使用者住在台北', updatedAt: '2026-10-02T00:00:00.000Z' }]);
  assert.equal(store.getRow('note:a').version, 2);
  assert.equal(store.getNotes()[0].text, '使用者住在台北');

  await store.setSettings({ paused: true, vector: { enabled: true, consentAt: '2026-10-30T00:00:00.000Z', provider: 'gemini' } });
  assert.equal(store.getSettings().paused, true);
  assert.equal(store.getSettings().learn, true, 'what was not said stays');
  assert.equal(store.getSettings().vector.enabled, true);
  await store.setCursor('c1', { processedThroughMessageId: 'm9' });
  assert.equal(store.getCursor('c1').processedThroughMessageId, 'm9');
  assert.equal(store.getCursor('other').processedThroughMessageId, '');
});

test('an accepted write brings its notes, its event and the operation done, in one go; the events older than thirty days go', async () => {
  const store = await createNotesStore({ backend: createMemoryBackend(), logger: quiet }).load();
  const messages = [{ id: 'm1', role: 'user', text: '我住在台中', at: '2026-10-29T00:00:00.000Z' }];
  const result = applyWrite({ notes: store.getNotes(), request: { op: 'add', text: '使用者住在台中', quote: '我住在台中' }, context: { conversationId: 'c1', messages, who: 'tool', createId: () => 'n1', now: T('2026-10-30T00:00:00.000Z') } });
  await store.commitWrite(result, { conversationId: 'c1' });
  assert.equal(store.getNotes().length, 1);
  assert.equal(store.getEvents().length, 1);
  assert.equal(store.getEvents()[0].who, 'tool');
  assert.deepEqual(store.getCursor('c1').appliedOps, [result.opId]);
  const old = createNotesStore({ backend: createMemoryBackend({ rows: [{ record_key: 'event:old', payload: { id: 'old', at: '2026-08-01T00:00:00.000Z', ops: [] } }, { record_key: 'event:new', payload: { id: 'new', at: '2026-10-29T00:00:00.000Z', ops: [] } }] }), now: T('2026-10-30T00:00:00.000Z'), logger: quiet });
  await old.load();
  assert.equal(await old.pruneEvents(), 1);
  assert.deepEqual(old.getEvents().map((event) => event.id), ['new']);
});

test('two devices change one note: nothing is lost; a note that was deleted stays deleted; what another device changes is heard', async () => {
  const backend = createMemoryBackend();
  const first = await createNotesStore({ backend, logger: quiet }).load();
  const second = await createNotesStore({ backend, logger: quiet }).load();
  const a = make('a', '使用者住在台北');
  await first.commitNotes([a]);
  assert.deepEqual(second.getNotes().length, 0, 'the second has not heard yet (a memory backend does not tell)');
  // The second device changes a note it has not seen: the row is there already, so the two are joined.
  await second.commitNotes([{ ...a, text: '使用者住在台中', evidenceCount: 3, updatedAt: '2026-10-05T00:00:00.000Z' }]);
  const joined = noteFromRow((await backend.readAll()).find((row) => row.record_key === 'note:a'));
  assert.equal(joined.text, '使用者住在台中', 'the later one gives the text');
  assert.equal(joined.evidenceCount, 3, 'and the most sightings stand');

  // A tombstone is not brought back by a device that still has the note.
  await first.load();
  await first.commitNotes([makeTombstone(first.getNotes()[0], T('2026-10-06T00:00:00.000Z'))]);
  await second.commitNotes([{ ...joined, text: '使用者住在高雄', updatedAt: '2026-10-07T00:00:00.000Z' }]);
  const final = noteFromRow((await backend.readAll()).find((row) => row.record_key === 'note:a'));
  assert.equal(final.status, 'deleted');
  assert.equal(final.text, '');

  const heard = [];
  second.subscribe(() => heard.push(second.getNotes().length));
  backend.injectRemote({ record_key: 'note:b', payload: make('b', '使用者喜歡爵士樂') });
  assert.ok(heard.length >= 1);
  assert.ok(second.getNotes().some((note) => note.id === 'b'), 'a note another device (or the server) saved shows up');
});

test('mergeNotes: the later change gives the text, the most sightings and the lock stand, and a tombstone wins', () => {
  const left = make('a', '使用者住在台北', { at: '2026-10-01T00:00:00.000Z' });
  const right = { ...make('a', '使用者住在台中', { at: '2026-10-05T00:00:00.000Z' }), evidenceCount: 2, locked: true };
  const merged = mergeNotes({ ...left, evidenceCount: 4 }, right);
  assert.equal(merged.text, '使用者住在台中');
  assert.equal(merged.evidenceCount, 4);
  assert.equal(merged.locked, true);
  assert.equal(mergeNotes(left, makeTombstone(right)).status, 'deleted');
  assert.equal(mergeNotes(null, left), left);
  assert.equal(noteFromRow({ record_key: 'cursor:x', payload: {} }), null);
  assert.equal(noteFromRow({ ...rowFromNote(left), deleted_at: '2026-10-01T00:00:00.000Z' }), null, 'a row taken away is no note');
});

test('clearing the memory marks the rows (the tombstones stay by default) and the other devices hear of it', async () => {
  const backend = createMemoryBackend();
  const store = await createNotesStore({ backend, logger: quiet }).load();
  const a = make('a', '使用者住在台中');
  const b = makeTombstone(make('b', '使用者喜歡爵士樂'));
  await store.commitNotes([a, b]);
  await store.setSettings({ paused: true });
  assert.equal(await store.clearAll(), 1);
  assert.deepEqual(store.getNotes().map((note) => note.id), ['b'], 'only the tombstone is left');
  assert.equal(store.getSettings().paused, true, 'the settings are not the memory');
  assert.equal(await store.clearAll({ keepTombstones: false }), 1);
  assert.deepEqual(store.getNotes(), []);
});

test('in the browser: the rows are kept in one item of the storage and are there the next time', async () => {
  const items = new Map();
  const storage = { getItem: async (key) => items.get(key) ?? null, setItem: async (key, value) => { items.set(key, value); } };
  const first = await createNotesStore({ backend: createLocalBackend({ storage, key: 'k' }), logger: quiet }).load();
  await first.commitNotes([make('a', '使用者住在台中')]);
  await first.setSettings({ use: false });
  assert.ok(items.get('k').includes('使用者住在台中'));
  const second = await createNotesStore({ backend: createLocalBackend({ storage, key: 'k' }), logger: quiet }).load();
  assert.deepEqual(second.getNotes().map((note) => note.text), ['使用者住在台中']);
  assert.equal(second.getSettings().use, false);
  const broken = await createNotesStore({ backend: createLocalBackend({ storage: { getItem: async () => '{not json', setItem: async () => {} }, key: 'k' }), logger: quiet }).load();
  assert.deepEqual(broken.getNotes(), [], 'a spoilt item is no memory, not an error');
});

test('in the database of the account: rows are added and changed with the version that was read, a conflict is joined, and a change from the server is heard', async () => {
  const table = createFakeTable();
  const userId = '11111111-1111-4111-8111-111111111111';
  const store = await createNotesStore({ backend: createCloudBackend({ supabase: table.supabase, userId, logger: quiet }), logger: quiet }).load();
  const a = make('a', '使用者住在台北');
  await store.commitNotes([a]);
  assert.equal(table.rows.size, 1);
  assert.equal(store.getRow('note:a').version, 1);
  await store.commitNotes([{ ...a, text: '使用者住在台中', updatedAt: '2026-10-05T00:00:00.000Z' }]);
  assert.equal(store.getRow('note:a').version, 2);

  // The server saves a note while the page is open: the page hears it.
  const heard = [];
  store.subscribe(() => heard.push(store.getNotes().length));
  table.service.insert('t', { user_id: userId, record_key: 'note:from-server', payload: make('from-server', '使用者對花生過敏') });
  await Promise.resolve();
  assert.ok(store.getNotes().some((note) => note.id === 'from-server'));
  assert.ok(heard.length >= 1);

  // The server changes the note the page has: the page's next change meets the new version and joins it.
  await table.service.update('t', { user_id: userId, record_key: 'note:a' }, { payload: { ...store.getNotes().find((note) => note.id === 'a'), evidenceCount: 5, updatedAt: '2026-10-06T00:00:00.000Z' } });
  const stale = store.getNotes().find((note) => note.id === 'a');
  store.getRow('note:a').version = 2; // the page missed the news
  await store.commitNotes([{ ...stale, keywords: ['a', '台中'], updatedAt: '2026-10-07T00:00:00.000Z' }]);
  const saved = [...table.rows.values()].find((row) => row.record_key === 'note:a');
  assert.equal(saved.payload.evidenceCount, 5, 'what the server wrote stands');
  assert.ok(saved.payload.keywords.includes('台中'), 'and what the page changed');

  // More than a page of rows is read.
  for (let index = 0; index < 620; index += 1) table.write({ user_id: userId, record_key: `event:e${index}`, payload: { id: `e${index}`, at: '2026-10-29T00:00:00.000Z', ops: [] } });
  const reload = await createNotesStore({ backend: createCloudBackend({ supabase: table.supabase, userId, logger: quiet }), logger: quiet }).load();
  assert.equal(reload.getEvents().length, 620);
});
