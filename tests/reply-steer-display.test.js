import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { sandboxText } from '../src/app/runtime/sandbox/sandbox-texts.js';
import { createSandboxLedger } from '../src/app/ui/sandbox/sandbox-ledger.js';
import { formatSandboxRunBlock, liftSandboxRunBlock, normalizeSandboxRun, summarizeSandboxRunText } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { createSandboxRunElement } from '../src/app/ui/sandbox/sandbox-run-view.js';

const setup = () => {
  const window = new Window();
  const { document } = window;
  const message = document.createElement('div');
  const answer = document.createElement('div');
  answer.className = 'message-content';
  message.append(answer);
  document.body.append(message);
  window.URL.createObjectURL = () => 'blob:test';
  window.URL.revokeObjectURL = () => {};
  return { window, document, message, answer };
};

const rowLabels = (message) => [...message.querySelectorAll('.ledger-row[data-kind="steer"]')].map((row) => row.textContent.trim());

test('the run record keeps what the person added: cleaned, cut, at most twenty, none that is empty', () => {
  const run = normalizeSandboxRun({ status: 'done', steps: [], steers: [{ text: '  use \n a table ' }, { text: '   ' }, { nothing: true }, { text: 'x'.repeat(400) }, ...Array.from({ length: 30 }, (_, i) => ({ text: `more ${i}` }))] });
  assert.equal(run.steers.length, 20);
  assert.equal(run.steers[0].text, 'use a table');
  assert.equal(run.steers[1].text.length, 300);
  assert.equal('steers' in normalizeSandboxRun({ status: 'done', steps: [], steers: [] }), false, 'nothing when there is nothing');
  const { run: lifted } = liftSandboxRunBlock(`${formatSandboxRunBlock(run)}Answer`);
  assert.deepEqual(lifted.steers, run.steers, 'kept in the saved text');
});

test('a later turn is told the reply was steered, in the words of the person, and not the other way round', () => {
  const text = `${formatSandboxRunBlock({ status: 'done', steps: [], steers: [{ text: 'make it a table' }, { text: 'in French' }] })}The answer.`;
  const summary = summarizeSandboxRunText(text);
  assert.match(summary, /While this reply was being made the user added: "make it a table"; "in French"/);
  assert.ok(summary.endsWith('The answer.'));
  assert.equal(summarizeSandboxRunText(`${formatSandboxRunBlock({ status: 'done', steps: [] })}The answer.`), 'The answer.', 'nothing added when nothing was');
});

test('the live step list shows a message when it is put into the reply, and says the model saw it when it has; a page that did not add it just shows that it did', () => {
  const { window, document, message, answer } = setup();
  try {
    const ledger = createSandboxLedger({ document, host: message, before: answer, language: 'en', summary: true, open: true });
    ledger.event({ type: 'steer', phase: 'sent', text: 'make it a table' });
    assert.ok(rowLabels(message).some((label) => label.includes(sandboxText('en', 'steerSent', { text: 'make it a table' }))));
    ledger.event({ type: 'steer', phase: 'taken', text: 'make it a table' });
    const labels = rowLabels(message);
    assert.ok(labels.some((label) => label.includes(sandboxText('en', 'steerTaken', { text: 'make it a table' }))));
    assert.equal(labels.filter((label) => label.includes('make it a table')).length, 1, 'the same row, not a second one');
    ledger.event({ type: 'steer', phase: 'taken', text: 'from another tab' });
    assert.ok(rowLabels(message).some((label) => label.includes(sandboxText('en', 'steerTaken', { text: 'from another tab' }))));
  } finally {
    window.happyDOM.abort();
  }
});

test('the saved reply draws a row for each message the model saw, with the line of how long it took', () => {
  const { window, document } = setup();
  const run = normalizeSandboxRun({ status: 'done', steps: [], elapsedMs: 9000, steers: [{ text: 'make it a table' }] });
  const view = createSandboxRunElement(document, run, { language: 'en' });
  assert.match(view.textContent, new RegExp(sandboxText('en', 'steerTaken', { text: 'make it a table' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(view.querySelector('.ledger-row[data-kind="steer"], [data-kind="steer"]') !== null, true, 'with its own kind (its icon)');
  window.happyDOM.abort();
});

test('the words of a steer are in all five languages', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of ['steerSent', 'steerTaken']) {
      const text = sandboxText(language, key, { text: 'X' });
      assert.ok(text.includes('X') && text !== key, `${language} ${key}`);
    }
  }
});
