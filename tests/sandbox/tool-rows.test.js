import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { formatSandboxRunBlock, normalizeTools, liftSandboxRunBlock, noteToolEnd, toolOfEvent } from '../../src/app/ui/sandbox/sandbox-run-block.js';
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
  assert.deepEqual(loaderEndEvent(loader, reviewing, 'en'), { type: 'tool-end', count: 2, label: 'Past conversations reviewed: 2' });
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
