import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createSteerBubbles, steerBubblesHTML } from '../src/app/ui/sandbox/steer-bubbles.js';
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

test('the live reply draws a bubble like the person\'s own for each message put into it, at once, above the reply, and takes the faded look off when the model has seen it', () => {
  const { window, document } = setup();
  try {
    const stack = document.createElement('div');
    stack.className = 'message-stack message-stack-model';
    stack.innerHTML = '<div class="message-bubble"><div class="message-content"></div></div>';
    document.body.append(stack);
    const bubbles = createSteerBubbles({ document, place: () => stack });
    bubbles.add({ text: 'make it a table', pending: true });
    bubbles.add({ text: 'in <French>', pending: true });
    const items = [...stack.children];
    assert.equal(items.length, 3);
    assert.ok(items[0].classList.contains('user-message') && items[1].classList.contains('user-message'), 'in the order they came, in front of the reply\'s own bubble');
    assert.ok(items[2].querySelector('.message-content') && !items[2].classList.contains('user-message'));
    assert.equal(items[0].querySelector('.message-bubble .message-content').textContent, 'make it a table');
    assert.equal(items[1].querySelector('.message-content').textContent, 'in <French>', 'the words are text, not markup');
    assert.equal(items[0].classList.contains('is-pending'), true);
    assert.equal(bubbles.seen('make it a table'), true);
    assert.equal(items[0].classList.contains('is-pending'), false);
    assert.equal(items[1].classList.contains('is-pending'), true);
    assert.equal(bubbles.seen('never sent'), false);
    bubbles.remove();
    assert.equal(stack.children.length, 1);
  } finally {
    window.happyDOM.abort();
  }
});

test('the saved reply has the same bubbles, made from its run record', () => {
  const html = steerBubblesHTML(normalizeSandboxRun({ status: 'done', steps: [], steers: [{ text: 'make it a table' }, { text: 'a <b>' }] }).steers);
  assert.equal((html.match(/user-message steer-message/g) || []).length, 2);
  assert.match(html, /make it a table/);
  assert.match(html, /a &lt;b&gt;/);
  assert.equal(steerBubblesHTML(undefined), '');
  const { window, document } = setup();
  try {
    const run = normalizeSandboxRun({ status: 'done', steps: [], elapsedMs: 9000, steers: [{ text: 'make it a table' }] });
    assert.doesNotMatch(createSandboxRunElement(document, run, { language: 'en' })?.textContent || '', /make it a table/, 'not inside the process list');
  } finally {
    window.happyDOM.abort();
  }
});
