import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryRecords } from '../../server/memory-records.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';
import { applyWrite } from '../../src/app/runtime/memory-notes/write-check.js';
import { createFakeTable } from '../helpers/fake-memory-supabase.js';

const USER = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-10-30T00:00:00.000Z';
const now = () => NOW;
const messages = [{ id: 'm1', role: 'user', text: '我住在台中，在做後端工程師', at: '2026-10-29T00:00:00.000Z' }];
let counter = 0;
const context = () => ({ conversationId: 'c1', messages, who: 'tool', createId: () => `n${(counter += 1)}`, now });

test('the server saves what an accepted write brought into the table the page reads: the note, the event, and the operation done', async () => {
  const table = createFakeTable({ now });
  const records = createMemoryRecords({ db: table.service, now });
  const before = await records.load(USER, { conversationId: 'c1' });
  assert.deepEqual(before.notes, []);
  const result = applyWrite({ notes: before.notes, request: { op: 'add', text: '使用者住在台中', quote: '我住在台中' }, context: context() });
  assert.equal(await records.saveWrite(USER, { before, result, conversationId: 'c1' }), 3);
  const after = await records.load(USER, { conversationId: 'c1' });
  assert.deepEqual(after.notes.map((note) => note.text), ['使用者住在台中']);
  assert.deepEqual(after.cursor.appliedOps, [result.opId]);
  assert.ok([...table.rows.keys()].some((key) => key.endsWith('event:' + result.event.id)));
  // The same request again is known as done.
  const again = applyWrite({ notes: after.notes, request: { op: 'add', text: '使用者住在台中', quote: '我住在台中' }, context: { ...context(), appliedOps: after.cursor.appliedOps } });
  assert.equal(again.action, 'noop');
});

test('a note that the person changed from a page while the reply ran is joined, not overwritten', async () => {
  const table = createFakeTable({ now });
  const records = createMemoryRecords({ db: table.service, now });
  const old = createNote({ id: 'a', text: '使用者住在台北', keywords: ['台北', '居住'], source: { conversationId: 'c0', messageIds: ['x'], quote: '我住台北', seen: ['c0|2026-05-01'] }, observedAt: '2026-05-01T00:00:00.000Z', now: () => '2026-05-01T00:00:00.000Z' });
  table.write({ user_id: USER, record_key: 'note:a', payload: old });
  const before = await records.load(USER, { conversationId: 'c1' });
  const result = applyWrite({ notes: before.notes, request: { op: 'update', id: 'a', text: '使用者住在台中', quote: '我住在台中', keywords: ['台中', '居住'] }, context: context() });
  assert.equal(result.action, 'update');
  // While the reply ran the person locked the note and a page saw it again.
  await table.service.update('t', { user_id: USER, record_key: 'note:a' }, { payload: { ...old, locked: true, evidenceCount: 6, updatedAt: '2026-10-29T12:00:00.000Z' } });
  await records.saveWrite(USER, { before, result, conversationId: 'c1' });
  const saved = [...table.rows.values()].find((row) => row.record_key === 'note:a');
  assert.equal(saved.payload.text, '使用者住在台中', 'the later change gives the text');
  assert.equal(saved.payload.locked, true, 'the lock the person set stays');
  assert.equal(saved.payload.evidenceCount, 6);
  assert.equal(saved.version, 3);
});

test('what was taken away is not read, and the settings and the cursor of the conversation come with the notes', async () => {
  const table = createFakeTable({ now });
  const records = createMemoryRecords({ db: table.service, now });
  table.write({ user_id: USER, record_key: 'note:gone', payload: createNote({ id: 'gone', text: 'x y z', now }), deleted_at: NOW });
  table.write({ user_id: USER, record_key: 'meta:settings', payload: { learn: false } });
  table.write({ user_id: USER, record_key: 'cursor:c9', payload: { processedThroughMessageId: 'm5', appliedOps: ['o1'] } });
  table.write({ user_id: '33333333-3333-4333-8333-333333333333', record_key: 'note:other', payload: createNote({ id: 'other', text: 'not yours', now }) });
  const loaded = await records.load(USER, { conversationId: 'c9' });
  assert.deepEqual(loaded.notes, []);
  assert.equal(loaded.settings.learn, false);
  assert.equal(loaded.cursor.processedThroughMessageId, 'm5');
});
