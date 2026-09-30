import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { sandboxText } from '../../src/app/runtime/sandbox/sandbox-texts.js';
import { createLedger, formatElapsed } from '../../src/app/ui/ledger/ledger.js';
import { createSandboxLedger } from '../../src/app/ui/sandbox/sandbox-ledger.js';

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

test('elapsed time stays quiet for quick steps', () => {
  assert.equal(formatElapsed(900), '');
  assert.equal(formatElapsed(2999), '');
  assert.equal(formatElapsed(4000), '4s');
  assert.equal(formatElapsed(65_000), '1:05');
  assert.equal(formatElapsed(400, { always: true }), '0s');
});

test('a step list puts itself before the answer, marks each step and lets finished ones fold', () => {
  const { window, document, message, answer } = setup();
  const ledger = createLedger({ document, host: message, before: answer });
  assert.equal(message.firstElementChild, ledger.element, 'in the message, above the answer');
  const first = ledger.addRow('Thinking');
  assert.equal(first.node.classList.contains('is-running'), true);
  first.finish('done');
  const second = ledger.addRow('Running');
  second.enableBody(true);
  second.body.textContent = 'code';
  assert.equal(ledger.current, second);
  assert.equal(second.body.hidden, false, 'the step in progress is open');
  ledger.foldFinished();
  assert.equal(second.body.hidden, false, 'a running step is never folded');
  second.finish('failed');
  assert.equal(second.node.classList.contains('is-failed'), true);
  assert.equal(second.node.querySelector('.ledger-mark').textContent, '✕');
  assert.equal(first.node.querySelector('.ledger-mark').textContent, '✓');
  ledger.foldFinished();
  assert.equal(second.body.hidden, true);
  second.node.querySelector('.ledger-row-head').click();
  assert.equal(second.body.hidden, false, 'a click opens what a finished step did');
  ledger.remove();
  assert.equal(message.querySelector('.ledger'), null);
  window.happyDOM.abort();
});

test('the sandbox list shows the model, each run with its code, output as it comes and files', () => {
  const { window, document, message, answer } = setup();
  const list = createSandboxLedger({ document, host: message, before: answer, language: 'en' });
  list.event({ type: 'round', label: 'Thinking…', doneLabel: 'Finished thinking' });
  const rows = () => [...message.querySelectorAll('.ledger-row')];
  assert.equal(rows()[0].classList.contains('is-running'), true, 'shown at once');
  list.event({ type: 'step', n: 1, title: 'Sum', code: 'print(1 + 1)' });
  assert.equal(rows()[0].querySelector('.ledger-label').textContent, 'Finished thinking');
  assert.equal(rows()[0].classList.contains('is-done'), true);
  assert.equal(rows()[1].querySelector('.ledger-label').textContent, sandboxText('en', 'sandboxRunning', { n: 1, title: 'Sum' }));
  assert.equal(rows()[1].querySelector('.ledger-code').textContent, 'print(1 + 1)');
  list.event({ type: 'prepare', text: 'Preparing Python… 11.8 MB' });
  assert.equal(rows()[1].querySelector('.ledger-detail').textContent, 'Preparing Python… 11.8 MB');
  list.event({ type: 'output', n: 1, stream: 'stdout', text: 'one\n' });
  list.event({ type: 'output', n: 1, stream: 'stdout', text: 'two\n' });
  assert.equal(rows()[1].querySelector('.ledger-output').textContent, 'one\ntwo\n');
  assert.equal(rows()[1].querySelector('.ledger-detail').hidden, true, 'the preparation note goes once output flows');
  list.event({
    type: 'step-end', n: 1, ok: true, error: '', elapsedMs: 1200,
    files: [{ name: 'chart.png', size: 2048, bytes: new Uint8Array([1, 2, 3]) }, { name: 'deck.pptx', size: 44_000, bytes: new Uint8Array([1]) }]
  });
  assert.equal(rows()[1].querySelector('.ledger-label').textContent, sandboxText('en', 'ledgerRan', { n: 1, title: 'Sum' }));
  assert.equal(rows()[1].querySelector('.ledger-file-image img').getAttribute('alt'), 'chart.png');
  assert.equal(rows()[1].querySelector('.ledger-file-chip .ledger-file-type').textContent, 'PPTX');
  assert.equal(rows()[1].querySelector('.ledger-file-chip .ledger-file-size').textContent, '43 KB');
  list.event({ type: 'round', label: 'Continuing…', doneLabel: 'done' });
  assert.equal(rows()[1].querySelector('.ledger-body').hidden, true, 'the run folds when the next step starts');
  list.event({ type: 'finishing', label: 'Preparing the files…' });
  assert.equal(rows().at(-1).querySelector('.ledger-label').textContent, 'Preparing the files…');
  list.remove();
  assert.equal(message.querySelector('.ledger'), null);
  window.happyDOM.abort();
});

test('each kind of step has its own icon instead of a tick, and the code is a code element for the colouring', () => {
  const { window, document, message, answer } = setup();
  const list = createSandboxLedger({ document, host: message, before: answer, language: 'en' });
  list.event({ type: 'round', label: 'Thinking…', doneLabel: 'Finished thinking' });
  list.event({ type: 'step', n: 1, title: 'Sum', code: 'print(1 + 1)' });
  list.event({ type: 'step-end', n: 1, ok: true, error: '', files: [], elapsedMs: 10 });
  list.event({ type: 'finishing', label: 'Preparing the files…' });
  const rows = [...message.querySelectorAll('.ledger-row')];
  assert.deepEqual(rows.map((row) => row.dataset.kind), ['thought', 'code', 'file']);
  for (const row of rows.slice(0, 2)) {
    assert.equal(row.querySelector('.ledger-mark').classList.contains('run-icon'), true);
    assert.equal(row.querySelector('.ledger-mark').textContent, '', 'no tick: the icon stays');
  }
  assert.equal(rows[1].querySelector('.ledger-code > code.language-python').textContent, 'print(1 + 1)');
  list.remove();
  window.happyDOM.abort();
});

test('a failed run keeps its error in the list, and a run of another number is ignored', () => {
  const { window, document, message } = setup();
  const list = createSandboxLedger({ document, host: message, language: 'zh-TW' });
  list.event({ type: 'step', n: 2, title: '', code: 'boom()' });
  list.event({ type: 'output', n: 2, stream: 'stderr', text: 'warn\n' });
  list.event({ type: 'output', n: 9, stream: 'stdout', text: 'ignored' });
  list.event({ type: 'step-end', n: 2, ok: false, error: 'NameError: boom', files: [], elapsedMs: 5 });
  const row = message.querySelector('.ledger-row');
  assert.equal(row.classList.contains('is-failed'), true);
  assert.match(row.querySelector('.ledger-output').textContent, /warn[\s\S]*NameError: boom/);
  assert.equal(row.querySelector('.ledger-output').classList.contains('is-error'), true);
  list.event({ type: 'output', n: 2, stream: 'stdout', text: 'a'.repeat(5000) });
  assert.ok(row.querySelector('.ledger-output').textContent.length <= 4000);
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of ['ledgerThought', 'ledgerRan', 'ledgerRanUntitled']) assert.notEqual(sandboxText(language, key), key, `${language} ${key}`);
  }
  list.remove();
  window.happyDOM.abort();
});

test('the model\'s thinking and the code it is writing stream into its row, and the draft goes when the run starts', () => {
  const { window, document, message } = setup();
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  list.event({ type: 'round', label: 'Thinking…', doneLabel: 'Finished thinking' });
  list.event({ type: 'thinking', text: 'The user wants ' });
  list.event({ type: 'thinking', text: 'a chart.' });
  list.event({ type: 'code', text: 'import ma' });
  list.event({ type: 'code', text: 'import matplotlib' });
  const row = message.querySelector('.ledger-row');
  assert.equal(row.querySelector('.ledger-thought').textContent, 'The user wants a chart.');
  assert.equal(row.querySelectorAll('.ledger-code').length, 1);
  assert.equal(row.querySelector('.ledger-code').textContent, 'import matplotlib', 'the code so far, not a pile of pieces');
  assert.equal(row.querySelector('.ledger-body').hidden, false, 'the thinking is open while it streams');
  list.event({ type: 'step', n: 1, title: '', code: 'import matplotlib' });
  assert.equal(row.classList.contains('is-done'), true);
  assert.equal(row.querySelector('.ledger-label').textContent, 'Finished thinking');
  assert.equal(row.querySelectorAll('.ledger-code').length, 0, 'the run shows the code itself');
  assert.equal(row.querySelector('.ledger-thought').textContent, 'The user wants a chart.', 'the thinking stays to read');
  assert.equal(row.querySelector('.ledger-body').hidden, true, 'and folds behind its line');
  list.event({ type: 'thinking', text: 'ignored: no row is thinking' });
  list.remove();
  window.happyDOM.abort();
});

test('once the answer is being written the thinking row is finished and folded, not still counting', () => {
  const { window, document, message } = setup();
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  list.event({ type: 'round', label: 'Thinking…', doneLabel: 'Finished thinking' });
  list.event({ type: 'thinking', text: 'Plan the answer.' });
  const row = message.querySelector('.ledger-row');
  assert.equal(row.classList.contains('is-running'), true);
  list.event({ type: 'answering' });
  assert.equal(row.classList.contains('is-done'), true, 'no longer "Thinking…"');
  assert.equal(row.classList.contains('is-running'), false);
  assert.equal(row.querySelector('.ledger-label').textContent, 'Finished thinking');
  assert.equal(row.querySelector('.ledger-body').hidden, true);
  assert.equal(row.querySelector('.ledger-thought').textContent, 'Plan the answer.', 'still there to read');
  list.remove();
  window.happyDOM.abort();
});
