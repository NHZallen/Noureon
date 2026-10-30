import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import i18n from '../../src/data/i18n.js';
import { createMemoryNotesSettings } from '../../src/app/ui/memory-notes/memory-notes-settings.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';
import { applyWrite } from '../../src/app/runtime/memory-notes/write-check.js';
import { createRebuildController } from '../../src/app/runtime/memory-store/page-rebuild.js';
import { createPageVectors } from '../../src/app/runtime/memory-store/page-vectors.js';
import { createPageHistory } from '../../src/app/runtime/memory-store/page-history.js';
import { createFakeIndexedDb } from '../helpers/fake-indexeddb.js';

const noteRow = (note) => ({ record_key: `note:${note.id}`, payload: note, version: 1, updated_at: note.updatedAt, deleted_at: null });
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

async function setup({ language = 'en', notes = [], extraRows = [], conversations = [], makeVectors = () => null } = {}) {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '<div id="memory-section"></div>';
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows: [...notes.map(noteRow), ...extraRows] })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const config = { uiLanguage: language };
  const notices = [];
  let counter = 0;
  const answers = [];
  const rebuild = createRebuildController({ getStore: () => memory.getStore(), getConversations: () => conversations, getConfig: () => config, getModelRunner: () => async () => '{"ops":[]}', models: [{ id: 'm1', provider: 'gemini' }], getApiKeyForProvider: () => 'key', logger: { warn() {} } });
  const vectors = makeVectors(memory);
  const ui = createMemoryNotesSettings({
    document,
    getConfig: () => config,
    saveConfig: async () => {},
    getMemory: () => memory,
    getUser: () => ({ username: 'tester' }),
    getRebuild: () => rebuild,
    getVectors: () => vectors,
    getModels: () => [{ id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' }, { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }],
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
  return { window, document, memory, config, notices, answers, ui, root, click, rebuild, vectors };
}

const dog = createNote({ id: 'dog', text: 'The user has a Shiba Inu named Mochi', kind: 'relationship' });
const tea = createNote({ id: 'tea', text: 'The user prefers jasmine tea', kind: 'preference' });

test('the memory section shows the title, the switches and the summary of the notes', async () => {
  const { root } = await setup({ notes: [dog, tea] });
  assert.match(root().textContent, /Manage notes/);
  assert.match(root().textContent, /2notes/);
  assert.equal(root().querySelectorAll('input[type=checkbox]').length, 2, 'use and learn');
  assert.doesNotMatch(root().textContent, /Use the new memory system/);
});

test('the use and learn switches are saved in the settings of the memory', async () => {
  const { document, memory, root } = await setup({ notes: [dog] });
  const [use, learn] = [...root().querySelectorAll('input[type=checkbox]')];
  use.checked = false;
  use.dispatchEvent(new document.defaultView.Event('change'));
  learn.checked = false;
  learn.dispatchEvent(new document.defaultView.Event('change'));
  await tick();
  assert.equal(memory.getStore().getSettings().use, false);
  assert.equal(memory.getStore().getSettings().learn, false);
});

test('the manage page lists notes, searches them, adds one, pins one, and deletes one', async () => {
  const { window, memory, answers, notices, root, click } = await setup({ notes: [dog, tea] });
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
  const { memory, answers, root, click } = await setup({ notes: [dog, tea] });
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
    const { root } = await setup({ language, notes: [dog] });
    assert.doesNotMatch(root().textContent, /\bmn[A-Z]/, `${language} has no missing key`);
  }
  const risky = createNote({ id: 'x', text: '<img src=x onerror=alert(1)> bold', kind: 'fact' });
  const { root, click } = await setup({ notes: [risky] });
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
  const ui = createMemoryNotesSettings({ document, getConfig: () => ({ uiLanguage: 'en' }), saveConfig: async () => {}, getMemory: () => memory, getText: (key) => i18n.en[key] || '', showCustomDialog: async () => null });
  assert.equal(ui.mount(), true);
  assert.match(document.getElementById('memory-notes-settings').textContent, /cannot be read right now/);
});

test('the curator model can be chosen, and automatic is the first choice', async () => {
  const { document, memory, root } = await setup({ notes: [dog] });
  const select = root().querySelector('select');
  assert.equal(select.value, '', 'automatic by default');
  assert.deepEqual([...select.options].map((option) => option.value), ['', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  select.value = 'gemini-3.8-flash';
  select.dispatchEvent(new document.defaultView.Event('change'));
  await tick();
  assert.equal(memory.getStore().getSettings().curatorModelId, 'gemini-3.8-flash');
});

test('the card that builds the memory from old conversations: start, progress, done, and a confirmation before clearing', async () => {
  const conversations = [
    { id: 'a', model: 'm1', lastUpdatedAt: '2026-03-01T00:00:00.000Z', messages: [{ role: 'user', parts: [{ text: 'I live in Taipei and work as a nurse' }], createdAt: '2026-03-01T00:00:00.000Z' }, { role: 'model', parts: [{ text: 'ok' }] }] },
    { id: 'b', model: 'm1', lastUpdatedAt: '2026-04-01T00:00:00.000Z', messages: [{ role: 'user', parts: [{ text: 'I moved to Hsinchu for a new hospital' }], createdAt: '2026-04-01T00:00:00.000Z' }, { role: 'model', parts: [{ text: 'ok' }] }] }
  ];
  const empty = await setup({ conversations });
  assert.match(empty.root().textContent, /Build memory from past conversations/);
  await empty.click('Start');
  await tick();
  await tick();
  assert.match(empty.root().textContent, /Done: read 2 conversations, added 0 notes\./);

  const withNotes = await setup({ notes: [dog], conversations });
  assert.ok([...withNotes.root().querySelectorAll('button')].some((button) => button.textContent === 'Clear and build again'));
  withNotes.answers.push(null);
  await withNotes.click('Clear and build again');
  assert.equal(withNotes.memory.getStore().getNotes().filter((note) => note.status === 'active').length, 1, 'cancel keeps the notes');

  const none = await setup({ conversations: [] });
  assert.match(none.root().textContent, /There are no conversations to read yet/);
});

test('the tidy card says when the notes were last tidied, tidies on a click, and a tidy is listed with Undo that brings every note back', async () => {
  const { runConsolidation } = await import('../../src/data/memory-consolidate.js');
  const trip = { ...createNote({ id: 'trip', text: 'The user travels to Japan', kind: 'project', now: () => '2026-09-01T00:00:00.000Z' }), validUntil: '2026-10-01T00:00:00.000Z' };
  const tidy = await runConsolidation({ notes: [trip, tea], settings: {}, commit: async () => {}, createId: () => 'tidy1', now: () => '2026-10-30T01:00:00.000Z' });
  assert.equal(tidy.events.length, 1);
  const { memory, root, click, notices } = await setup({
    notes: tidy.notes,
    extraRows: [{ record_key: 'event:tidy1', payload: tidy.events[0], version: 1, updated_at: tidy.events[0].at, deleted_at: null }]
  });
  assert.match(root().textContent, /Tidy the memory/);
  assert.match(root().textContent, /Not tidied yet/);
  assert.match(root().textContent, /Tidied 1 notes \(1 expired\)/);
  await click('Tidy now');
  await tick();
  assert.match(notices.at(-1).message, /Tidied/);
  assert.equal(notices.at(-1).kind, 'success');
  assert.ok(memory.getStore().getSettings().consolidatedAt, 'the time of the tidy is kept');
  assert.match(root().textContent, /Last tidied/);
  assert.equal(memory.getStore().getNotes().find((note) => note.id === 'trip').status, 'archived');
  await click('Undo');
  assert.equal(memory.getStore().getNotes().find((note) => note.id === 'trip').status, 'active');
  assert.equal(memory.getStore().getEvents().some((event) => event.id === 'tidy1'), false, 'the line goes away');
});

test('the tidy texts exist in all five languages', async () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of ['mnTidyTitle', 'mnTidyDesc', 'mnTidyLast', 'mnTidyNever', 'mnTidyNow', 'mnTidyRunning', 'mnTidyDoneChanged', 'mnTidyDoneNone', 'mnTidyFailed', 'mnTidyPartMerge', 'mnTidyPartSupersede', 'mnTidyPartExpire', 'mnTidyPartFade', 'mnTidyPartStanding', 'mnEvTidy']) {
      assert.ok(i18n[language]?.[key], `${language} has ${key}`);
    }
  }
});

test('the card of the search by meaning: needs a key, shows what will be sent before it asks, and turning it off deletes the vectors', async () => {
  const conversations = [{ id: 'a', lastUpdatedAt: '2026-10-01T00:00:00.000Z', messages: [{ role: 'user', parts: [{ text: 'My puppy does not eat his food lately' }], createdAt: '2026-10-01T00:00:00.000Z' }] }];
  const fetchImpl = async (url, options) => Response.json({ embeddings: JSON.parse(options.body).requests.map(() => ({ values: [1, 0, 0] })) });
  const make = (keys) => (memory) => {
    const history = createPageHistory({ getConversations: () => conversations });
    const vectors = createPageVectors({ getStore: () => memory.getStore(), getHistory: () => history, getApiKeyForProvider: (name) => keys[name] || '', indexedDB: createFakeIndexedDb(), userKey: () => 'tester', fetchImpl, wait: async () => {}, logger: { warn() {} }, options: { pauseMs: 0 } });
    history.setVectors(vectors);
    return vectors;
  };
  const noKey = await setup({ makeVectors: make({}) });
  assert.match(noKey.root().textContent, /Search by meaning \(optional\)/);
  assert.match(noKey.root().textContent, /A Gemini or OpenRouter API key is needed/);
  assert.equal([...noKey.root().querySelectorAll('button')].some((button) => button.textContent === 'Turn on…'), false);

  const keyed = await setup({ makeVectors: make({ gemini: 'g-key' }) });
  const asked = [];
  keyed.answers.push(null);
  await keyed.click('Turn on…');
  assert.equal(keyed.vectors.isEnabled(), false, 'declining turns nothing on');
  assert.equal(keyed.memory.getStore().getSettings().vector.enabled, false);

  keyed.answers.push(true);
  await keyed.click('Turn on…');
  await tick();
  await tick();
  assert.equal(keyed.vectors.isEnabled(), true);
  assert.ok(keyed.memory.getStore().getSettings().vector.consentAt);
  assert.match(keyed.root().textContent, /1\/1 pieces ready \(Gemini\)/);
  asked.push(keyed.root().textContent);
  assert.match(keyed.root().textContent, /A local account has no cloud/, 'a local account is told its vectors stay here');
  assert.equal([...keyed.root().querySelectorAll('button')].some((button) => button.textContent === 'Turn on sync'), false, 'and has no switch for the cloud');

  await keyed.click('Turn off and delete vectors');
  assert.equal(keyed.vectors.isEnabled(), false);
  assert.match(keyed.notices.at(-1).message, /Turned off/);
  assert.match(keyed.root().textContent, /Turn on…/);
});

test('a cloud account can keep the vectors in the cloud as a choice of its own, and turn it off again', async () => {
  const conversations = [{ id: 'a', lastUpdatedAt: '2026-10-01T00:00:00.000Z', messages: [{ role: 'user', parts: [{ text: 'My puppy does not eat his food lately' }], createdAt: '2026-10-01T00:00:00.000Z' }] }];
  const fetchImpl = async (url, options) => Response.json({ embeddings: JSON.parse(options.body).requests.map(() => ({ values: [1, 0, 0] })) });
  const cleared = [];
  const supabase = { from: () => { const builder = { select: () => builder, eq: () => builder, neq: () => builder, in: () => builder, order: () => builder, range: () => builder, upsert: () => builder, delete: () => { cleared.push('delete'); return builder; }, then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve) }; return builder; } };
  const makeVectors = (memory) => {
    const history = createPageHistory({ getConversations: () => conversations });
    const vectors = createPageVectors({ getStore: () => memory.getStore(), getHistory: () => history, getApiKeyForProvider: (name) => (name === 'gemini' ? 'g-key' : ''), getCloud: () => ({ supabase, userId: 'user-1' }), indexedDB: createFakeIndexedDb(), userKey: () => 'tester', fetchImpl, wait: async () => {}, logger: { warn() {} }, options: { pauseMs: 0 } });
    history.setVectors(vectors);
    return vectors;
  };
  const cloud = await setup({ makeVectors });
  cloud.answers.push(true);
  await cloud.click('Turn on…');
  await tick();
  await tick();
  assert.match(cloud.root().textContent, /Sync to the cloud account/);
  assert.equal(cloud.vectors.isSyncing(), false, 'off until the person turns it on');
  await cloud.click('Turn on sync');
  await tick();
  assert.equal(cloud.vectors.isSyncing(), true);
  assert.equal(cloud.memory.getStore().getSettings().vector.sync, true);
  assert.match(cloud.root().textContent, /synced to your cloud account/);
  await cloud.click('Turn off sync and delete cloud vectors');
  assert.equal(cloud.vectors.isSyncing(), false);
  assert.ok(cleared.length > 0, 'the copy in the cloud was deleted');
  assert.match(cloud.notices.at(-1).message, /Sync is off/);
});

test('the texts of the search by meaning exist in all five languages and say what is sent', async () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of ['mnVecTitle', 'mnVecDesc', 'mnVecNoKey', 'mnVecOn', 'mnVecConsentTitle', 'mnVecConsent', 'mnVecConsentOk', 'mnVecBuilding', 'mnVecReady', 'mnVecError', 'mnVecRetry', 'mnVecOff', 'mnVecOffDone', 'mnVecSyncTitle', 'mnVecSyncDesc', 'mnVecSyncOn', 'mnVecSyncOff', 'mnVecSyncIs', 'mnVecSyncLocal', 'mnVecSyncOffDone', 'mnVecProviderTitle', 'mnVecProviderDesc']) {
      assert.ok(i18n[language]?.[key], `${language} has ${key}`);
    }
    assert.match(i18n[language].mnVecConsent, /\{provider\}/);
    assert.match(i18n[language].mnVecConsent, /\{pieces\}/);
  }
});

test('the notes page has no import or export of its own: they are in the data settings, and the page says so', async () => {
  const { root } = await setup({ notes: [dog] });
  assert.equal(root().querySelector('input[type=file]'), null, 'no file picker here');
  const labels = [...root().querySelectorAll('button')].map((button) => button.textContent);
  assert.equal(labels.includes('Import'), false);
  assert.equal(labels.includes('Export'), false);
  assert.match(root().textContent, /Export and import are in Settings → Data/);
});
