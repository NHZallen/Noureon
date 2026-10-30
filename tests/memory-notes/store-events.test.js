import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryBackend } from '../../src/app/runtime/memory-store/backends.js';
import { createNotesStore } from '../../src/app/runtime/memory-store/notes-store.js';

test('an event can be taken away, and it is gone for the next reader', async () => {
  const backend = createMemoryBackend({ rows: [
    { record_key: 'event:e1', payload: { at: '2026-10-30T01:00:00.000Z', ops: [] } },
    { record_key: 'event:e2', payload: { at: '2026-10-30T02:00:00.000Z', ops: [] } }
  ] });
  const store = createNotesStore({ backend, logger: { warn() {} } });
  await store.load();
  assert.deepEqual(store.getEvents().map((event) => event.id), ['e2', 'e1']);
  assert.equal(await store.removeEvent('e2'), 1);
  assert.equal(await store.removeEvent('e2'), 0, 'taking it away again does nothing');
  assert.deepEqual(store.getEvents().map((event) => event.id), ['e1']);
  const later = createNotesStore({ backend, logger: { warn() {} } });
  await later.load();
  assert.deepEqual(later.getEvents().map((event) => event.id), ['e1']);
});
