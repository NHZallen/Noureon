import assert from 'node:assert/strict';
import test from 'node:test';

import { collectReplySources, hasMemorySources, historyEntriesOf } from '../../src/app/runtime/memory-store/reply-sources.js';

const note = (id, extra = {}) => ({ id, text: `text of ${id}`, kind: 'fact', status: 'active', standing: false, lastUsedAt: '2026-10-30T00:00:00.000Z', ...extra });

test('the conversations a reply looked into come from what was kept and from the slip, once each, never more than eight', () => {
  const entries = historyEntriesOf({ memoryHistory: [{ id: 'a', title: 'A', at: '2026-10-21' }, { id: 'a', title: 'again' }, { id: '' }, null], historySourceConversationIds: ['a', 'b'] });
  assert.deepEqual(entries, [{ id: 'a', title: 'A', at: '2026-10-21' }, { id: 'b', title: '', at: '' }]);
  const many = historyEntriesOf({ historySourceConversationIds: Array.from({ length: 20 }, (_, index) => `c${index}`) });
  assert.equal(many.length, 8);
  assert.equal(hasMemorySources({}), false);
  assert.equal(hasMemorySources({ memoryUsed: ['n1'] }), true);
  assert.equal(hasMemorySources({ memoryHistory: [{ id: 'a' }] }), true);
});

test('the notes are read as they are now (a deleted one says so), the conversations keep their name once they are gone', () => {
  const message = { metadata: { memoryUsed: ['n1', 'n2', 'n3'], memoryHistory: [{ id: 'c1', title: 'Scooter commute', at: '2026-10-21' }, { id: 'c2', title: 'Old chat', at: '2026-09-01' }] } };
  const found = collectReplySources({
    message,
    notes: [note('n1'), note('n3', { status: 'archived' })],
    conversations: [{ id: 'c1', title: 'Renamed since', lastUpdatedAt: '2026-10-22' }]
  });
  assert.deepEqual(found.notes.map((entry) => [entry.id, Boolean(entry.gone)]), [['n1', false], ['n2', true], ['n3', true]]);
  assert.equal(found.notes[0].text, 'text of n1');
  assert.deepEqual(found.conversations[0], { id: 'c1', title: 'Renamed since', at: '2026-10-21', available: true });
  assert.deepEqual(found.conversations[1], { id: 'c2', title: 'Old chat', at: '2026-09-01', available: false });
  const deleted = collectReplySources({ message: { metadata: { memoryHistory: [{ id: 'c1', title: 'Kept name', at: '2026-10-21' }] } }, conversations: [{ id: 'c1', title: 'x', deletedAt: '2026-10-25' }] });
  assert.equal(deleted.conversations[0].available, false);
  assert.equal(deleted.conversations[0].title, 'Kept name');
});
