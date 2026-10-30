import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import i18n from '../../src/data/i18n.js';
import { createMemoryNotesSettings } from '../../src/app/ui/memory-notes/memory-notes-settings.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';
import { applyWrite } from '../../src/app/runtime/memory-notes/write-check.js';

const noteRow = (note) => ({ record_key: `note:${note.id}`, payload: note, version: 1, updated_at: note.updatedAt, deleted_at: null });
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

async function setup({ language = 'en', memorySystem = 'classic', notes = [], extraRows = [] } = {}) {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '<div id="memory-section"><div id="memory-summary-settings">old summary</div></div>';
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows: [...notes.map(noteRow), ...extraRows] })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const config = { uiLanguage: language, memorySystem };
  const notices = [];
  let counter = 0;
  const answers = [];
  const ui = createMemoryNotesSettings({
    document,
    getConfig: () => config,
    saveConfig: async () => {},
    getMemory: () => memory,
    getUser: () => ({ username: 'tester' }),
    getText: (key) => i18n[config.uiLanguage]?.[key] || '',
    showNotification: (message, kind) => notices.push({ message, kind }),
    // The dialog gives back what the next entry of `answers` says: a text for an input, true for a confirmation, null for cancel.
    showCustomDialog: async () => answers.shift(),
    createId: () => `new-${(counter += 1)}`
  });
  ui.mount();
  const root = () => document.getElementById('memory-notes-settings');
  const click = async (label) => {
    const target = [...root().querySelectorAll('button')].find((node) => node.textContent.trim() === label);
    assert.ok(target, `a button "${label}" is there`);
    target.click();
    await tick();
  };
  return { window, document, memory, config, notices, answers, ui, root, click };
}

const dog = createNote({ id: 'dog', text: 'The user has a Shiba Inu named Mochi', kind: 'relationship' });
const tea = createNote({ id: 'tea', text: 'The user prefers jasmine tea', kind: 'preference' });

test('with the old memory in use, only the switch is shown and the old summary stays', async () => {
  const { document, root } = await setup();
  assert.ok(root().querySelector('input[type=checkbox]'));
  assert.equal(root().querySelectorAll('input[type=checkbox]').length, 1);
  assert.equal(document.getElementById('memory-summary-settings').hidden, false);
  assert.match(root().textContent, /Use the new memory system/);
});

test('switching to the new memory hides the old summary and shows the switches and the summary', async () => {
  const { document, config, root } = await setup({ notes: [dog, tea] });
  const toggle = root().querySelector('input[type=checkbox]');
  toggle.checked = true;
  toggle.dispatchEvent(new document.defaultView.Event('change'));
  await tick();
  assert.equal(config.memorySystem, 'notes');
  assert.equal(document.getElementById('memory-summary-settings').hidden, true);
  assert.equal(root().querySelectorAll('input[type=checkbox]').length, 3, 'the master switch, use and learn');
  assert.match(root().textContent, /Manage notes/);
  assert.match(root().textContent, /2notes/);
  toggle.checked = false;
  const again = root().querySelector('input[type=checkbox]');
  again.checked = false;
  again.dispatchEvent(new document.defaultView.Event('change'));
  await tick();
  assert.equal(config.memorySystem, 'classic');
  assert.equal(document.getElementById('memory-summary-settings').hidden, false, 'it comes back when the switch is off');
});

test('the use and learn switches are saved in the settings of the memory', async () => {
  const { document, memory, root } = await setup({ memorySystem: 'notes', notes: [dog] });
  const [, use, learn] = [...root().querySelectorAll('input[type=checkbox]')];
  use.checked = false;
  use.dispatchEvent(new document.defaultView.Event('change'));
  learn.checked = false;
  learn.dispatchEvent(new document.defaultView.Event('change'));
  await tick();
  assert.equal(memory.getStore().getSettings().use, false);
  assert.equal(memory.getStore().getSettings().learn, false);
});

test('the manage page lists notes, searches them, adds one, pins one, and deletes one', async () => {
  const { window, memory, answers, notices, root, click } = await setup({ memorySystem: 'notes', notes: [dog, tea] });
  await click('Manage notes →');
  assert.match(root().textContent, /Shiba Inu named Mochi/);
  assert.match(root().textContent, /jasmine tea/);

  const search = root().querySelector('input[type=search]');
  search.value = 'jasmine';
  search.dispatchEvent(new window.Event('input'));
  assert.doesNotMatch(root().textContent, /Shiba/);
  assert.match(root().textContent, /jasmine tea/);
  search.value = '';
  search.dispatchEvent(new window.Event('input'));

  answers.push('The user works nights');
  await click('＋ Add');
  assert.ok(memory.getStore().getNotes().some((note) => note.text === 'The user works nights'));
  assert.equal(notices.at(-1).kind, 'success');

  answers.push('the user works nights');
  await click('＋ Add');
  assert.equal(notices.at(-1).kind, 'error', 'the same note is refused');

  const teaRow = [...root().querySelectorAll('.mn-note')].find((row) => row.textContent.includes('jasmine'));
  teaRow.querySelector('.mn-more').click();
  await tick();
  await click('Make standing');
  assert.equal(memory.getStore().getNotes().find((note) => note.id === 'tea').standing, true);

  const dogRow = [...root().querySelectorAll('.mn-note')].find((row) => row.textContent.includes('Shiba'));
  dogRow.querySelector('.mn-more').click();
  await tick();
  answers.push(true);
  await click('Delete');
  const gone = memory.getStore().getNotes().find((note) => note.id === 'dog');
  assert.equal(gone.status, 'deleted');
  assert.equal(gone.text, '');
  assert.doesNotMatch(root().textContent, /Shiba/);
});

test('a change of the model is listed with Undo, and Undo brings the note back', async () => {
  const written = applyWrite({
    notes: [tea],
    request: { op: 'forget', id: 'tea', quote: 'forget the tea' },
    context: { conversationId: 'c', messages: [{ id: 'm', role: 'user', text: 'please forget the tea', at: '2026-10-30T00:00:00.000Z' }], who: 'tool', appliedOps: [], createId: () => 'e1', now: () => '2026-10-30T01:00:00.000Z' }
  });
  assert.equal(written.ok, true);
  const { memory, root, click } = await setup({
    memorySystem: 'notes',
    notes: [written.notes[0]],
    extraRows: [{ record_key: `event:${written.event.id}`, payload: written.event, version: 1, updated_at: written.event.at, deleted_at: null }]
  });
  assert.match(root().textContent, /Forgot: The user prefers jasmine tea/);
  await click('Undo');
  const back = memory.getStore().getNotes().find((note) => note.id === 'tea');
  assert.equal(back.status, 'active');
  assert.equal(back.text, 'The user prefers jasmine tea');
  assert.equal(memory.getStore().getEvents().length, 0, 'the line goes away');
  assert.match(root().textContent, /No changes yet/);
});

test('clearing all memory asks first and leaves nothing in the list', async () => {
  const { memory, answers, root, click } = await setup({ memorySystem: 'notes', notes: [dog, tea] });
  answers.push(null);
  await click('Clear all memory');
  assert.equal(memory.getStore().getNotes().length, 2, 'cancel keeps everything');
  answers.push(true);
  await click('Clear all memory');
  assert.equal(memory.getStore().getNotes().filter((note) => note.status === 'active').length, 0);
  assert.match(root().textContent, /0notes/);
});

test('every language has the text of the screen, and a note is drawn as text, never as markup', async () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    const { root } = await setup({ language, memorySystem: 'notes', notes: [dog] });
    assert.doesNotMatch(root().textContent, /\bmn[A-Z]/, `${language} has no missing key`);
  }
  const risky = createNote({ id: 'x', text: '<img src=x onerror=alert(1)> bold', kind: 'fact' });
  const { root, click } = await setup({ memorySystem: 'notes', notes: [risky] });
  await click('Manage notes →');
  assert.equal(root().querySelector('img'), null);
  assert.match(root().textContent, /<img src=x/);
});

test('a memory that could not be loaded says so and does not break the screen', async () => {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '<div id="memory-section"></div>';
  const memory = createNotesMemory({ storage: { getItem() { throw new Error('blocked'); }, setItem() {} }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const ui = createMemoryNotesSettings({ document, getConfig: () => ({ uiLanguage: 'en', memorySystem: 'notes' }), saveConfig: async () => {}, getMemory: () => memory, getText: (key) => i18n.en[key] || '', showCustomDialog: async () => null });
  assert.equal(ui.mount(), true);
  assert.match(document.getElementById('memory-notes-settings').textContent, /cannot be read right now/);
});
