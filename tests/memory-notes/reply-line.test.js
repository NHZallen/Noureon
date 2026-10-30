import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import i18n from '../../src/data/i18n.js';
import { startMemoryLines } from '../../src/app/ui/memory-notes/memory-reply-line.js';
import { announceMemoryUpdated, announceMessageDrawn } from '../../src/app/ui/memory-notes/memory-events.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';
import { applyWrite } from '../../src/app/runtime/memory-notes/write-check.js';

const row = (key, payload) => ({ record_key: key, payload, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null });
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
const tea = createNote({ id: 'tea', text: 'The user prefers jasmine tea', kind: 'preference', keywords: ['tea', 'jasmine'] });

async function setup({ forgetTea = true } = {}) {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '';
  let notes = [tea];
  const rows = [];
  let event = null;
  if (forgetTea) {
    const written = applyWrite({ notes: [tea], request: { op: 'forget', id: 'tea', quote: 'forget the tea' }, context: { conversationId: 'c', messages: [{ id: 'm', role: 'user', text: 'please forget the tea', at: '2026-10-30T00:00:00.000Z' }], who: 'tool', appliedOps: [], createId: () => 'ev1', now: () => '2026-10-30T01:00:00.000Z' } });
    notes = written.notes;
    event = written.event;
    rows.push(row(`event:${event.id}`, event));
  }
  rows.push(...notes.map((note) => row(`note:${note.id}`, note)));
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const conversation = {
    id: 'conv',
    messages: [
      { role: 'user', parts: [{ text: 'hi' }] },
      { role: 'model', parts: [{ text: 'a' }], metadata: { memoryUpdated: event ? [event.id] : [], memoryUsed: ['tea'] } },
      { role: 'user', parts: [{ text: 'again' }] },
      { role: 'model', parts: [{ text: 'b' }], metadata: { memoryUpdated: event ? [event.id] : [] } }
    ]
  };
  startMemoryLines({ document, getConfig: () => ({}), getMemory: () => memory, getConversation: () => conversation, getText: (key) => i18n.en[key] || '' });
  const element = (index) => {
    const node = document.createElement('div');
    node.dataset.messageIndex = String(index);
    node.innerHTML = '<div class="message-stack"></div>';
    document.body.append(node);
    announceMessageDrawn(document, { element: node, message: conversation.messages[index], conversation });
    return node;
  };
  return { window, document, memory, conversation, element };
}

const label = (node) => [...node.querySelectorAll('.memory-line-chip')].map((chip) => chip.textContent);

test('under a reply: "Memory updated" and "Used 1 notes" chips, quiet, only for a reply the memory touched', async () => {
  const { element } = await setup();
  assert.deepEqual(label(element(1)), ['Memory updated', 'Used 1 notes from memory']);
  assert.deepEqual(label(element(0)), [], 'a message of the person has none');
});

test('"Memory updated" is shown once in a conversation: on the first reply that changed the memory', async () => {
  const { element } = await setup();
  element(1);
  assert.deepEqual(label(element(3)), [], 'the second reply shows no chip, though it too holds the id');
});

test('opening "Memory updated" lists the change with Undo, and Undo brings the note back and takes the line away', async () => {
  const { memory, element } = await setup();
  const node = element(1);
  node.querySelector('.memory-line-chip').click();
  assert.match(node.querySelector('.memory-line-panel').textContent, /Forgot: The user prefers jasmine tea/);
  [...node.querySelectorAll('.memory-line-link')].find((button) => button.textContent === 'Undo').click();
  await tick();
  assert.equal(memory.getStore().getNotes().find((note) => note.id === 'tea').status, 'active');
  assert.equal(memory.getStore().getEvents().length, 0);
  assert.deepEqual(label(node), ['Used 1 notes from memory'], 'the line is drawn again without the update');
});

test('opening "Used 1 notes" shows the note and "Not relevant here" counts against it; a note that is gone says so', async () => {
  const { memory, element } = await setup({ forgetTea: false });
  const node = element(1);
  const used = [...node.querySelectorAll('.memory-line-chip')].find((chip) => chip.textContent.startsWith('Used'));
  used.click();
  assert.match(node.querySelector('.memory-line-panel').textContent, /jasmine tea/);
  [...node.querySelectorAll('.memory-line-link')].find((button) => button.textContent === 'Not relevant here').click();
  await tick();
  assert.equal(memory.getStore().getNotes().find((note) => note.id === 'tea').notRelevant, 1);
  assert.match(node.querySelector('.memory-line-panel').textContent, /Marked/);

  const gone = await setup();
  const goneNode = gone.element(1);
  [...goneNode.querySelectorAll('.memory-line-chip')].find((chip) => chip.textContent.startsWith('Used')).click();
  assert.match(goneNode.querySelector('.memory-line-panel').textContent, /this note is gone/);
});

test('the lines are drawn again when the memory changed after the reply', async () => {
  const { document, element, conversation } = await setup();
  const node = element(1);
  node.querySelector('.memory-line')?.remove();
  assert.deepEqual(label(node), []);
  announceMemoryUpdated(document, { conversationId: conversation.id });
  assert.deepEqual(label(node), ['Memory updated', 'Used 1 notes from memory']);
});
