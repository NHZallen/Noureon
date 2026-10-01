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

test('the code of a step sits in a card with the language and a copy button, live and saved alike', async () => {
  const { window, document, message } = setup();
  const { createCodeCard, codeOfCard } = await import('../../src/app/ui/sandbox/run-code-card.js');
  const card = createCodeCard(document, 'print(1)', 'fr');
  message.append(card);
  assert.equal(card.querySelector('.run-code-name').textContent, 'Python');
  const button = card.querySelector('button.run-code-copy');
  assert.equal(button.type, 'button');
  assert.equal(button.getAttribute('aria-label'), sandboxText('fr', 'copyCode'));
  assert.equal(codeOfCard(button), 'print(1)');
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) assert.notEqual(sandboxText(language, 'copyCode'), 'copyCode', language);
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  list.event({ type: 'step', n: 1, title: '', code: 'x = 1' });
  assert.equal(message.querySelectorAll('.run-code-card').length, 2, 'the live step uses the same card');
  list.remove();
  window.happyDOM.abort();
});

test('what the model says before a run appears between the step lines, in ordinary text', () => {
  const { window, document, message } = setup();
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  list.event({ type: 'round', label: 'Thinking…', doneLabel: 'Finished thinking' });
  list.event({ type: 'narration', text: "First I'll **check** the folder." });
  list.event({ type: 'narration', text: '   ' });
  list.event({ type: 'step', n: 1, title: 'Look', code: 'import os' });
  const children = [...message.querySelector('.ledger-list').children];
  assert.deepEqual(children.map((node) => (node.classList.contains('sandbox-run-narration') ? 'narration' : 'row')), ['row', 'narration', 'row'], 'between the thinking line and the run');
  assert.equal(children[1].textContent, "First I'll check the folder.");
  assert.equal(children[1].querySelector('strong').textContent, 'check');
  list.remove();
  window.happyDOM.abort();
});

test('a search that runs first is a row in progress that becomes the finished row of pages, or goes if it found none', () => {
  const { window, document, message } = setup();
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  list.event({ type: 'searching', label: 'Searching the web…' });
  let rows = [...message.querySelectorAll('.ledger-row')];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].classList.contains('is-running'), true, 'in progress while it searches');
  assert.equal(rows[0].querySelector('.ledger-label').textContent, 'Searching the web…');
  list.event({ type: 'sources', sources: [{ title: 'A', url: 'https://a.example/1' }] });
  rows = [...message.querySelectorAll('.ledger-row')];
  assert.equal(rows.length, 1, 'the same row, not a second one');
  assert.equal(rows[0].classList.contains('is-done'), true);
  assert.equal(rows[0].querySelector('.ledger-label').textContent, 'Searched 1 sites');
  assert.equal(rows[0].querySelectorAll('.run-source-chip').length, 1);

  const empty = createSandboxLedger({ document, host: message, language: 'en' });
  empty.event({ type: 'searching', label: 'Searching the web…' });
  empty.event({ type: 'sources', sources: [] });
  assert.equal(message.querySelectorAll('.ledger-row').length, 1, 'a search that found nothing leaves no row');
  list.remove();
  empty.remove();
  window.happyDOM.abort();
});

test('the pages a search found show as a finished, folded row before the model starts', () => {
  const { window, document, message } = setup();
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  list.event({ type: 'sources', sources: [{ title: 'A', url: 'https://a.example/1' }, { title: 'B', url: 'https://www.b.example/2' }] });
  list.event({ type: 'round', label: 'Thinking…', doneLabel: 'Finished thinking' });
  const rows = [...message.querySelectorAll('.ledger-row')];
  assert.equal(rows[0].dataset.kind, 'search');
  assert.equal(rows[0].querySelector('.ledger-label').textContent, 'Searched 2 sites');
  assert.equal(rows[0].classList.contains('is-done'), true);
  const markIcon = rows[0].querySelector('.ledger-mark .run-mark-site img');
  assert.equal(markIcon?.getAttribute('src'), 'https://a.example/favicon.ico', 'the first site\'s icon is in front of the label');
  assert.equal(rows[0].querySelectorAll('.ledger-mark .run-mark-site').length, 1);
  assert.deepEqual([...rows[0].querySelectorAll('.run-source-host')].map((node) => node.textContent), ['a.example', 'b.example']);
  assert.equal(rows[0].querySelector('.ledger-body').hidden, true, 'folded until it is opened');
  list.event({ type: 'sources', sources: [] });
  assert.equal(message.querySelectorAll('.ledger-row').length, 2, 'no pages, no row');
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
  assert.equal(row.querySelector('.ledger-body').hidden, true, 'the thinking is folded while it streams: nothing opens by itself');
  row.querySelector('.ledger-row-head').click();
  assert.equal(row.querySelector('.ledger-body').hidden, false, 'and opens when the reader asks');
  list.event({ type: 'code', text: 'import matplotlib.pyplot' });
  assert.equal(row.querySelector('.ledger-body').hidden, false, 'more of it arriving does not close what they opened');
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

test('the pages that were read and the pages that were searched for are one row, since to the person both are sites consulted', () => {
  const { window, document, message } = setup();
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  list.event({
    type: 'sources',
    sources: [
      { title: 'Linked', url: 'https://linked.example/a', read: true },
      { title: 'Found', url: 'https://found.example/1' },
      { title: 'Linked two', url: 'https://linked.example/b', read: true }
    ]
  });
  const rows = [...message.querySelectorAll('.ledger-row')];
  assert.deepEqual(rows.map((row) => row.querySelector('.ledger-label').textContent), ['Searched 3 sites']);
  assert.deepEqual([...rows[0].querySelectorAll('.run-source-host')].map((node) => node.textContent), ['linked.example', 'found.example', 'linked.example']);
  assert.equal(rows.every((row) => row.classList.contains('is-done')), true);

  const onlyRead = createSandboxLedger({ document, host: message, language: 'zh-TW' });
  onlyRead.event({ type: 'sources', sources: [{ title: 'Linked', url: 'https://linked.example/a', read: true }] });
  const labels = [...message.querySelectorAll('.ledger-label')].map((node) => node.textContent);
  assert.equal(labels.at(-1), '已讀取 1 個網頁');
  assert.equal(labels.filter((label) => label.startsWith('已搜尋')).length, 0, 'nothing was searched for, so it is not said to be');
  list.remove();
  onlyRead.remove();
  window.happyDOM.abort();
});


test('every search and page of a reply adds to one row of sites, and the rows of the calls after the first are only there while they run', () => {
  const { window, document, message } = setup();
  const list = createSandboxLedger({ document, host: message, language: 'en' });
  list.event({ type: 'searching', label: 'Searching: a' });
  list.event({ type: 'sources', sources: [{ title: 'A', url: 'https://a.example/1' }, { title: 'B', url: 'https://b.example/1' }] });
  list.event({ type: 'narration', text: 'Now the page.' });
  list.event({ type: 'searching', label: 'Reading page: a.example' });
  assert.equal(message.querySelectorAll('.ledger-row').length, 2, 'the call that is running has its row for now');
  list.event({ type: 'sources', sources: [{ title: 'A', url: 'https://a.example/1', read: true }] });
  list.event({ type: 'searching', label: 'Searching: b' });
  list.event({ type: 'sources', sources: [{ title: 'C', url: 'https://c.example/1' }, { title: 'A', url: 'https://a.example/1' }] });
  const rows = [...message.querySelectorAll('.ledger-row')];
  assert.equal(rows.length, 1, 'one row, whatever the number of calls');
  assert.equal(rows[0].querySelector('.ledger-label').textContent, 'Searched 3 sites', 'a site found and then read is counted once');
  assert.deepEqual([...rows[0].querySelectorAll('.run-source-host')].map((node) => node.textContent), ['a.example', 'b.example', 'c.example']);
  assert.equal(rows[0].querySelectorAll('.ledger-mark .run-mark-site').length, 1);
  // A call that found nothing leaves nothing behind.
  list.event({ type: 'searching', label: 'Searching: nothing' });
  list.event({ type: 'sources', sources: [] });
  assert.equal(message.querySelectorAll('.ledger-row').length, 1);
  list.remove();
  window.happyDOM.abort();
});

test('with a summary all the steps are one line that says what the work is at and opens to them, every step folded', () => {
  const { window, document, message } = setup();
  const list = createSandboxLedger({ document, host: message, language: 'en', summary: true });
  const rows = () => [...message.querySelectorAll('.ledger-row')];
  const line = () => rows()[0];
  assert.equal(line().querySelector('.ledger-label').textContent, 'Working');
  assert.equal(line().querySelector('.ledger-body').hidden, true, 'folded until it is opened');
  assert.equal(line().querySelectorAll('.ledger-list .ledger-row').length, 0);

  list.event({ type: 'round', label: 'Thinking…', doneLabel: 'Thought' });
  assert.equal(line().querySelector('.ledger-label').textContent, 'Working · Thinking…');
  list.event({ type: 'searching', label: 'Searching: a' });
  assert.equal(line().querySelector('.ledger-label').textContent, 'Working · Searching: a');
  list.event({ type: 'sources', sources: [{ title: 'A', url: 'https://a.example/1' }] });
  list.event({ type: 'step', n: 1, title: 'Sum', code: 'print(1)' });
  assert.equal(line().querySelector('.ledger-label').textContent, 'Working · Running code: Sum');
  const step = [...line().querySelectorAll('.ledger-row[data-kind="code"]')][0];
  assert.equal(step.querySelector('.ledger-body').hidden, true, 'the step that is running is folded too: it runs all the same');
  assert.equal(step.querySelector('.run-code-card, pre') !== null, true, 'its code is there to open');
  assert.equal(message.querySelectorAll('.ledger-list').length, 2, 'the steps sit in a list inside the line');
  assert.ok(line().querySelector('.ledger-list'));

  list.event({ type: 'answering' });
  assert.match(line().querySelector('.ledger-label').textContent, /^Processed for \d/);
  assert.equal(line().classList.contains('is-quiet'), true);
  list.remove();
  assert.equal(message.querySelectorAll('.ledger-row').length, 0, 'all of it goes');
  window.happyDOM.abort();
});

test('the line can start open, and without a summary the steps are the list itself, as before', () => {
  const { window, document, message } = setup();
  const open = createSandboxLedger({ document, host: message, language: 'en', summary: true, open: true });
  assert.equal(message.querySelector('.ledger-row .ledger-body').hidden, false);
  open.remove();
  const plain = createSandboxLedger({ document, host: message, language: 'en' });
  plain.event({ type: 'round', label: 'Thinking…', doneLabel: 'Thought' });
  assert.equal(message.querySelectorAll('.ledger-row').length, 1);
  assert.equal(message.querySelector('.ledger-label').textContent, 'Thinking…');
  plain.remove();
  window.happyDOM.abort();
});
