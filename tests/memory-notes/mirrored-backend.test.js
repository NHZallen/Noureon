import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryBackend, createMirroredBackend } from '../../src/app/runtime/memory-store/backends.js';
import { createNotesStore } from '../../src/app/runtime/memory-store/notes-store.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createNote, isActive } from '../../src/app/runtime/memory-notes/notes.js';
import { createFakeTable } from '../helpers/fake-memory-supabase.js';

const NOW = '2026-10-30T12:00:00.000Z';
const now = () => NOW;
const note = (id, text, extra = {}) => ({ ...createNote({ id, text, now }), ...extra });
const storageOf = () => { const data = new Map(); return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }; };

// A cloud that can be switched off.
function flaky(rows = []) {
  const inner = createMemoryBackend({ rows, now });
  const state = { down: false, reads: 0, writes: 0 };
  const guard = () => { if (state.down) throw new Error('network down'); };
  return {
    state,
    inner,
    readAll: async () => { guard(); state.reads += 1; return inner.readAll(); },
    write: async (changes) => { guard(); state.writes += 1; return inner.write(changes); },
    subscribe: (fn) => inner.subscribe(fn)
  };
}
const quiet = { warn() {} };
const mirrored = (remote, storage) => createMirroredBackend({ remote, storage, key: 'mirror', now, setTimer: () => 1, clearTimer: () => {}, logger: quiet });

test('what is read from the cloud is kept as a copy, and the copy answers when the cloud cannot be read', async () => {
  const remote = flaky([{ record_key: 'note:a', payload: note('a', 'The user likes tea') }]);
  const storage = storageOf();
  const first = mirrored(remote, storage);
  assert.equal((await first.readAll()).length, 1);
  remote.state.down = true;
  const second = mirrored(remote, storage);
  const rows = await second.readAll();
  assert.equal(rows[0].payload.text, 'The user likes tea');
  assert.equal(second.isOffline(), true);
});

test('with no copy and no cloud it is still an error (the memory says so), and an empty cloud makes an empty copy', async () => {
  const remote = flaky();
  remote.state.down = true;
  await assert.rejects(mirrored(remote, storageOf()).readAll(), /network down/);
  remote.state.down = false;
  assert.deepEqual(await mirrored(remote, storageOf()).readAll(), []);
});

test('a change made while the cloud is down is kept, shows at once, and is sent when the cloud answers, joined with what changed there meanwhile', async () => {
  const remote = flaky([{ record_key: 'note:a', payload: note('a', 'The user likes tea') }, { record_key: 'note:b', payload: note('b', 'The user has a dog') }]);
  const storage = storageOf();
  const backend = mirrored(remote, storage);
  const store = createNotesStore({ backend, now, logger: quiet });
  await store.load();
  remote.state.down = true;
  const edited = store.getNotes().map((entry) => (entry.id === 'a' ? { ...entry, text: 'The user likes green tea', updatedAt: '2026-10-30T12:05:00.000Z' } : entry));
  await store.commitNotes([...edited, note('c', 'The user lives in Taipei')]);
  assert.equal(store.getNotes().find((entry) => entry.id === 'a').text, 'The user likes green tea', 'it shows at once');
  assert.equal(backend.isOffline(), true);
  assert.equal(backend.pendingCount(), 2);
  // Meanwhile another device changed the other note in the cloud.
  await remote.inner.write([{ key: 'note:b', payload: { ...note('b', 'The user has a dog named Rex'), updatedAt: '2026-10-30T12:03:00.000Z' }, baseVersion: 1 }]);
  remote.state.down = false;
  await backend.retry();
  assert.equal(backend.isOffline(), false);
  assert.equal(backend.pendingCount(), 0);
  const texts = Object.fromEntries((await remote.inner.readAll()).map((row) => [row.record_key, row.payload.text]));
  assert.equal(texts['note:a'], 'The user likes green tea');
  assert.equal(texts['note:c'], 'The user lives in Taipei');
  assert.equal(texts['note:b'], 'The user has a dog named Rex', 'what the other device wrote is not overwritten');
});

test('changes that wait survive a reload of the page, and are sent by the next load that reaches the cloud', async () => {
  const remote = flaky();
  const storage = storageOf();
  remote.state.down = true;
  const store = createNotesStore({ backend: mirrored(remote, storage), now, logger: quiet });
  // Nothing is in the cloud nor in the copy yet: the first read fails, as it should.
  await assert.rejects(store.load());
  remote.state.down = false;
  await store.load();
  remote.state.down = true;
  await store.commitNotes([note('n', 'The user prefers short answers')]);
  const reloaded = createNotesStore({ backend: mirrored(remote, storage), now, logger: quiet });
  await reloaded.load();
  assert.equal(reloaded.getNotes().filter(isActive).length, 1, 'the copy has it');
  remote.state.down = false;
  const again = createNotesStore({ backend: mirrored(remote, storage), now, logger: quiet });
  await again.load();
  assert.equal((await remote.inner.readAll()).length, 1 + 0, 'the waiting change reached the cloud');
});

test('the memory of the page uses the copy for a cloud account, and a person with no cloud has the notes in the browser as before', async () => {
  const table = createFakeTable({ now });
  const USER = '22222222-2222-4222-8222-222222222222';
  const storage = storageOf();
  let down = false;
  const client = {
    from: (name) => { if (down) throw new Error('offline'); return table.supabase.from(name); },
    channel: (name) => table.supabase.channel(name),
    removeChannel: (channel) => table.supabase.removeChannel(channel)
  };
  table.write({ user_id: USER, record_key: 'note:a', payload: note('a', 'The user likes tea') });
  const memory = createNotesMemory({ getSupabase: () => client, storage, now, logger: quiet });
  await memory.attach({ supabaseUserId: USER, username: 'supabase:x' });
  assert.equal(memory.getStore().getNotes().length, 1);
  assert.ok(storage.getItem(`noureon.memoryNotes.mirror.v1.${USER}`), 'a copy was made');
  down = true;
  const offline = createNotesMemory({ getSupabase: () => client, storage, now, logger: quiet });
  await offline.attach({ supabaseUserId: USER, username: 'supabase:x' });
  assert.equal(offline.isReady(), true, 'the memory works from the copy');
  assert.equal(offline.getStore().getNotes().length, 1);
});

test('the notes of a local account follow it when it is linked to a cloud account, and join the notes that account has', async () => {
  const { carryLocalNotes, carriedNotes, joinCarried } = await import('../../src/app/runtime/memory-store/notes-carry.js');
  const table = createFakeTable({ now });
  const USER = '33333333-3333-4333-8333-333333333333';
  const storage = { ...storageOf() };
  storage.removeItem = (key) => storage.data.delete(key);
  const local = createNotesMemory({ storage, now, logger: quiet });
  await local.attach({ username: 'alice' });
  await local.getStore().commitNotes([note('l1', 'The user prefers short answers'), note('l2', 'The user lives in Taipei')]);
  assert.equal(carryLocalNotes({ source: 'alice', target: 'supabase:33333333', storage }), 2);
  assert.equal(carryLocalNotes({ source: 'nobody', target: 'supabase:33333333', storage }), 0);
  assert.equal(carriedNotes({ name: 'supabase:33333333', storage, now }).length, 2);
  table.write({ user_id: USER, record_key: 'note:c1', payload: note('c1', 'The user has a dog') });
  const cloud = createNotesMemory({ getSupabase: () => table.supabase, storage, now, logger: quiet });
  await cloud.attach({ supabaseUserId: USER, username: 'supabase:33333333' });
  assert.deepEqual(cloud.getStore().getNotes().map((entry) => entry.id).sort(), ['c1', 'l1', 'l2']);
  assert.equal(storage.data.has('noureon.memoryNotes.carry.supabase:33333333'), false, 'the copy is removed once it was taken up');
  const rows = [...table.rows.values()].filter((row) => row.record_key.startsWith('note:')).map((row) => row.record_key).sort();
  assert.deepEqual(rows, ['note:c1', 'note:l1', 'note:l2'], 'they are in the cloud now');
  assert.deepEqual(joinCarried([note('a', 'x')], [note('a', 'x')]).length, 1);
});
