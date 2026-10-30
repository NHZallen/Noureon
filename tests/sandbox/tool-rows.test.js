import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { formatSandboxRunBlock, normalizeTools, liftSandboxRunBlock, noteToolEnd, noteWebStep, normalizeWebSteps, toolOfEvent } from '../../src/app/ui/sandbox/sandbox-run-block.js';
import { createSandboxLedger } from '../../src/app/ui/sandbox/sandbox-ledger.js';
import { createSandboxRunElement } from '../../src/app/ui/sandbox/sandbox-run-view.js';
import { SANDBOX_TEXT_LANGUAGES, loaderEndEvent, memoryDoneLabel, sandboxText } from '../../src/app/runtime/sandbox/sandbox-texts.js';
import { createMemoryLoader } from '../../src/data/memory-tool.js';

// What the person saw while the reply was made (a skill loaded, the memory looked up) must still be there when the reply is saved and opened again.

test('the skills loaded and the memory looked up are kept in the saved record, each skill once, and nothing else gets in', () => {
  const run = { status: 'done', steps: [], elapsedMs: 5000, tools: [{ kind: 'memory', key: 'memorySearching' }, { kind: 'skill', name: 'pdf' }, { kind: 'skill', name: 'pdf' }, { kind: 'memory', key: 'memoryReviewing' }, { kind: 'memory', key: 'bogus' }, { kind: 'other' }, null] };
  assert.deepEqual(normalizeTools(run.tools), [{ kind: 'memory', key: 'memorySearching' }, { kind: 'skill', name: 'pdf' }, { kind: 'memory', key: 'memoryReviewing' }]);
  const parsed = liftSandboxRunBlock(formatSandboxRunBlock(run));
  assert.deepEqual(parsed.run.tools, normalizeTools(run.tools), 'it survives being written into the message and read back');
  assert.deepEqual(toolOfEvent({ type: 'memory', key: 'memoryWriting' }), { kind: 'memory', key: 'memoryWriting' });
  assert.deepEqual(toolOfEvent({ type: 'skill', name: 'pdf', label: 'x' }), { kind: 'skill', name: 'pdf' });
  assert.equal(toolOfEvent({ type: 'connector', label: 'x' }), null);
});

test('the saved reply shows a row for each, in every language, even when it did nothing else', () => {
  for (const language of SANDBOX_TEXT_LANGUAGES) {
    const window = new Window();
    const { document } = window;
    const element = createSandboxRunElement(document, { status: 'done', steps: [], elapsedMs: 4000, tools: [{ kind: 'memory', key: 'memoryReviewing' }, { kind: 'memory', key: 'memorySearching' }, { kind: 'memory', key: 'memoryWriting' }, { kind: 'skill', name: 'pdf' }] }, { language });
    const labels = [...element.querySelectorAll('.ledger-label')].map((node) => node.textContent);
    assert.deepEqual(labels, [sandboxText(language, 'memoryReviewed'), sandboxText(language, 'memoryRecalled'), sandboxText(language, 'memoryWrote'), sandboxText(language, 'skillLoaded', { name: 'pdf' })], language);
    assert.ok(labels.every((label) => label && !label.includes('{')), language);
    window.happyDOM.abort();
  }
});

test('a row of a memory call is over when its answer is in, not when the next thing begins', () => {
  const window = new Window();
  const { document } = window;
  const message = document.createElement('div');
  document.body.append(message);
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  const loader = createMemoryLoader({ getNotes: () => [], getContext: () => ({}), commit: async () => {}, searchHistory: async () => [], createId: () => 'x', now: () => '2026-10-30T00:00:00.000Z' });
  const step = loader.stepEvent({ name: 'search_memory', args: { query: 'q', scope: 'history' } }, 'en');
  assert.equal(step.key, 'memoryReviewing');
  list.event(step);
  const row = () => message.querySelector('.ledger-row[data-kind="memory-review"]');
  assert.equal(row().classList.contains('is-running'), true, 'running while it looks');
  list.event({ type: 'tool-end' });
  assert.equal(row().classList.contains('is-running'), false, 'over as soon as the answer is in, whatever the model does next');
  window.happyDOM.abort();
});

test('a memory search says how many notes or past conversations came back: in the live row, in the saved record and in the saved reply, in every language', async () => {
  const notes = [{ id: 'n1', text: 'Lives in Taipei', kind: 'fact', status: 'active', surface: 'normal', keywords: ['taipei'], observedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', lastUsedAt: null, recallCount: 0, version: 1 }];
  const pieces = [{ conversationId: 'a', at: '2026-10-01', role: 'user', text: 'one' }, { conversationId: 'b', at: '2026-10-02', role: 'user', text: 'two' }];
  const loader = createMemoryLoader({ getNotes: () => notes, getContext: () => ({}), commit: async () => {}, searchHistory: async () => pieces, createId: () => 'x', now: () => '2026-10-30T00:00:00.000Z' });
  const reviewing = { name: 'search_memory', args: { query: 'taipei', scope: 'history' } };
  await loader.run(reviewing);
  assert.deepEqual(loaderEndEvent(loader, reviewing, 'en'), { type: 'tool-end', count: 2, label: 'Past conversations reviewed: 2', chats: [{ id: 'a', at: '2026-10-01' }, { id: 'b', at: '2026-10-02' }] });
  assert.deepEqual(loaderEndEvent(loader, reviewing, 'en'), { type: 'tool-end' }, 'the count is told once');
  const recalling = { name: 'search_memory', args: { query: 'taipei', scope: 'notes' } };
  await loader.run(recalling);
  assert.equal(loaderEndEvent(loader, recalling, 'zh-TW').label, '已回憶 1 條記憶');
  await loader.run({ name: 'search_memory', args: { query: 'zzzz qqqq', scope: 'notes' } });
  assert.equal(loaderEndEvent(loader, recalling, 'zh-TW').label, '沒有找到相關的記憶');

  const tools = [{ kind: 'memory', key: 'memorySearching' }];
  noteToolEnd(tools, { type: 'tool-end', count: 3 });
  tools.push({ kind: 'skill', name: 'pdf' }, { kind: 'memory', key: 'memoryReviewing' });
  noteToolEnd(tools, { type: 'tool-end' });
  noteToolEnd(tools, { type: 'tool-end', count: 9 });
  noteToolEnd(tools, { type: 'tool-end', count: 7 });
  assert.deepEqual(tools.filter((tool) => tool.kind === 'memory').map((tool) => tool.count), [3, 9], 'each answer lands on the memory row it ended, once');
  const record = { status: 'done', steps: [], elapsedMs: 3000, tools: [{ kind: 'memory', key: 'memorySearching', count: 3 }, { kind: 'memory', key: 'memoryReviewing', count: 0 }, { kind: 'memory', key: 'memoryReviewing', count: -4 }, { kind: 'memory', key: 'memorySearching' }] };
  assert.deepEqual(liftSandboxRunBlock(formatSandboxRunBlock(record)).run.tools, [{ kind: 'memory', key: 'memorySearching', count: 3 }, { kind: 'memory', key: 'memoryReviewing', count: 0 }, { kind: 'memory', key: 'memoryReviewing' }, { kind: 'memory', key: 'memorySearching' }]);

  for (const language of SANDBOX_TEXT_LANGUAGES) {
    const window = new Window();
    const element = createSandboxRunElement(window.document, record, { language });
    const labels = [...element.querySelectorAll('.ledger-label')].map((node) => node.textContent);
    assert.deepEqual(labels, [memoryDoneLabel(language, 'memorySearching', 3), memoryDoneLabel(language, 'memoryReviewing', 0), memoryDoneLabel(language, 'memoryReviewing'), memoryDoneLabel(language, 'memorySearching')].slice(0, labels.length), language);
    assert.ok(labels.every((label) => label && !label.includes('{')), language);
    window.happyDOM.abort();
  }

  const window = new Window();
  const { document } = window;
  const message = document.createElement('div');
  document.body.append(message);
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  list.event(loader.stepEvent(reviewing, 'en'));
  list.event({ type: 'tool-end', count: 2, label: 'Past conversations reviewed: 2' });
  assert.equal(message.querySelector('.ledger-row[data-kind="memory-review"] .ledger-label').textContent, 'Past conversations reviewed: 2');
  window.happyDOM.abort();
});

test('a memory step keeps which notes and which conversations it gave back (ids and days only), opens to them, and a conversation in it can be opened', async () => {
  const { fillMemoryRow } = await import('../../src/app/runtime/features/reply-sources-actions.js');
  const { setNotesMemory, setPageHistory } = await import('../../src/app/runtime/memory-store/memory-ref.js');
  const { applyToolEnd } = await import('../../src/app/ui/sandbox/sandbox-run-block.js');
  const note = (id, text, status = 'active') => ({ id, text, status, kind: 'fact', surface: 'normal', keywords: ['k'], observedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', lastUsedAt: null, recallCount: 0, version: 1 });
  const notes = [note('n1', 'Lives in Taipei'), note('n2', 'Was a nurse', 'archived')];
  const loader = createMemoryLoader({ getNotes: () => notes, getContext: () => ({}), commit: async () => {}, searchHistory: async () => [{ conversationId: 'a', at: '2026-10-21', role: 'user', text: 'secret words' }, { conversationId: 'a', at: '2026-10-22', role: 'user', text: 'again' }, { conversationId: 'gone', at: '2026-09-01', role: 'user', text: 'x' }], createId: () => 'x', now: () => '2026-10-30T00:00:00.000Z' });

  const reviewing = { name: 'search_memory', args: { query: 'taipei', scope: 'history' } };
  await loader.run(reviewing);
  const reviewed = loaderEndEvent(loader, reviewing, 'en');
  assert.deepEqual(reviewed.chats, [{ id: 'a', at: '2026-10-21' }, { id: 'gone', at: '2026-09-01' }], 'one for each conversation, no words');
  const recalling = { name: 'search_memory', args: { query: 'taipei', scope: 'notes' } };
  await loader.run(recalling);
  const recalled = loaderEndEvent(loader, recalling, 'en');
  assert.deepEqual(recalled.ids, ['n1']);

  const tools = [{ kind: 'memory', key: 'memorySearching' }];
  applyToolEnd(tools[0], recalled);
  tools.push({ kind: 'memory', key: 'memoryReviewing' });
  noteToolEnd(tools, reviewed);
  const record = { status: 'done', steps: [], elapsedMs: 1000, tools };
  const saved = liftSandboxRunBlock(formatSandboxRunBlock(record)).run.tools;
  assert.deepEqual(saved, [{ kind: 'memory', key: 'memorySearching', count: 1, ids: ['n1'] }, { kind: 'memory', key: 'memoryReviewing', count: 3, chats: reviewed.chats }]);
  assert.equal(JSON.stringify(saved).includes('secret words'), false, 'no part of a conversation is kept');
  assert.deepEqual(normalizeTools([{ kind: 'memory', key: 'memorySearching', ids: [1, '', 'ok', 'x'.repeat(200)], chats: [{ id: 'c', at: 5 }, { id: '' }, null] }]), [{ kind: 'memory', key: 'memorySearching', ids: ['ok'], chats: [{ id: 'c', at: '5' }] }]);

  const window = new Window();
  const { document } = window;
  const element = createSandboxRunElement(document, { ...record, tools: saved }, { language: 'en' });
  const rows = [...element.querySelectorAll('.ledger-row')];
  assert.ok(rows.every((row) => row.querySelector('summary').classList.contains('is-expandable')), 'both steps can be opened');
  const [recallRow, reviewRow] = rows;
  assert.equal(recallRow.querySelector('.memory-row-list').children.length, 0, 'the list is filled when the step opens');

  setNotesMemory({ getStore: () => ({ isLoaded: () => true, getNotes: () => notes }) });
  setPageHistory({ conversations: () => [{ id: 'a', title: 'Scooter commute', lastUpdatedAt: '2026-10-22T00:00:00.000Z' }] });
  try {
    fillMemoryRow({ document, row: recallRow, language: 'en' });
    assert.deepEqual([...recallRow.querySelectorAll('.memory-row-item')].map((node) => node.textContent), ['Lives in Taipei']);
    fillMemoryRow({ document, row: reviewRow, language: 'en' });
    const chats = [...reviewRow.querySelectorAll('.memory-row-chat')];
    assert.equal(chats.length, 2);
    assert.match(chats[0].textContent, /Scooter commute/);
    assert.equal(chats[0].querySelector('[data-open-chat]').dataset.openChat, 'a', 'a conversation that is still there can be opened');
    assert.match(chats[1].textContent, /Untitled chat/);
    assert.match(chats[1].textContent, /deleted/);
    assert.equal(chats[1].querySelector('[data-open-chat]'), null, 'one that is gone cannot');
    setNotesMemory({ getStore: () => ({ isLoaded: () => true, getNotes: () => [] }) });
    fillMemoryRow({ document, row: recallRow, language: 'en' });
    assert.match(recallRow.querySelector('.memory-row-item').textContent, /deleted/, 'a note forgotten since says so');
  } finally {
    setNotesMemory(null);
    setPageHistory(null);
    window.happyDOM.abort();
  }
});

test('each search and each page the model opened stays as a row, live and in the saved reply, with the pages it gave back', () => {
  const pages = (...numbers) => numbers.map((n) => ({ n, url: `https://site${n}.example/p`, title: `Page ${n}` }));
  const events = [
    { type: 'searching', kind: 'search', target: 'strawberry cake recipe', label: 'Searching: strawberry cake recipe', doneLabel: 'Searched: strawberry cake recipe' },
    { type: 'sources', sources: pages(1, 2) },
    { type: 'searching', kind: 'page', target: 'icook.tw', label: 'Reading page: icook.tw', doneLabel: 'Read page: icook.tw' },
    { type: 'sources', sources: pages(3) },
    { type: 'searching', kind: 'search', target: 'sponge cake temperature', label: 'x', doneLabel: 'Searched: sponge cake temperature' },
    { type: 'sources', sources: [] },
    { type: 'searching', label: 'Searching…' },
    { type: 'sources', sources: pages(9) }
  ];

  const window = new Window();
  const { document } = window;
  const message = document.createElement('div');
  document.body.append(message);
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  for (const event of events) list.event(event);
  const rows = [...message.querySelectorAll('.ledger-row[data-kind="search"]')];
  assert.deepEqual(rows.slice(0, 3).map((row) => row.querySelector('.ledger-label').textContent), ['Searched: strawberry cake recipe', 'Read page: icook.tw', 'Searched: sponge cake temperature'], 'none of them went away when the next began');
  assert.equal(rows[0].querySelectorAll('.run-source-chip').length, 2, 'the pages it gave back are in it');
  assert.equal(rows[2].querySelector('summary, .ledger-row-head').classList.contains('is-expandable'), false, 'a call that gave back nothing has nothing to open');
  assert.equal(rows[0].classList.contains('is-running'), false);
  window.happyDOM.abort();

  const web = [];
  for (const event of events) noteWebStep(web, event);
  assert.deepEqual(web.map(({ pending, ...step }) => step), [{ kind: 'search', target: 'strawberry cake recipe', ns: [1, 2] }, { kind: 'page', target: 'icook.tw', ns: [3] }, { kind: 'search', target: 'sponge cake temperature' }]);
  assert.deepEqual(normalizeWebSteps([{ kind: 'x', target: 'a' }, { kind: 'search', target: '' }, { kind: 'search', target: ' q ', ns: [2, 'x', -1, 5] }]), [{ kind: 'search', target: 'q', ns: [2, 5] }]);

  const run = { status: 'done', steps: [], elapsedMs: 9000, sources: [...pages(1, 2, 3)], web };
  const saved = liftSandboxRunBlock(formatSandboxRunBlock(run)).run;
  assert.equal(saved.web.length, 3);
  for (const language of SANDBOX_TEXT_LANGUAGES) {
    const view = new Window();
    const element = createSandboxRunElement(view.document, saved, { language });
    const labels = [...element.querySelectorAll('.ledger-label')].map((node) => node.textContent);
    assert.ok(labels.some((label) => label.includes('strawberry cake recipe')), language);
    assert.ok(labels.some((label) => label.includes('icook.tw')), language);
    assert.ok(labels.every((label) => label && !label.includes('{')), language);
    assert.equal(element.querySelectorAll('.run-source-chip').length >= 3, true, language);
    view.happyDOM.abort();
  }
});
