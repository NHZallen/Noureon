import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { sandboxText } from '../../src/app/runtime/sandbox/sandbox-texts.js';
import { createSandboxWorkWindow } from '../../src/app/ui/sandbox/sandbox-work-window.js';

const setup = (language = 'zh-TW') => {
  const window = new Window();
  const { document } = window;
  const composer = document.createElement('div');
  composer.id = 'input-bar-container';
  document.body.append(composer);
  window.URL.createObjectURL = () => 'blob:test';
  window.URL.revokeObjectURL = () => {};
  return { window, document, composer, work: createSandboxWorkWindow({ document, language }) };
};

test('the window sits above the composer and shows the status, the code, the output as it comes and the files', () => {
  const { window, composer, work } = setup();
  const box = composer.querySelector('.work-window');
  assert.ok(box);
  assert.equal(box.querySelector('.work-window-stop'), null, 'the composer stops the reply, not this window');
  work.status('Gemini 正在思考並撰寫程式……');
  assert.equal(box.querySelector('[role="status"]').textContent, 'Gemini 正在思考並撰寫程式……');

  work.event({ type: 'step', n: 1, title: '加總', code: 'print(1 + 1)' });
  assert.equal(box.querySelector('.work-step-heading').textContent, `${sandboxText('zh-TW', 'sandboxStep', { n: 1 })} · 加總`);
  assert.equal(box.querySelector('.work-code').textContent, 'print(1 + 1)');
  assert.equal(box.querySelector('.work-step-state').textContent, sandboxText('zh-TW', 'workRunning'));
  assert.equal(box.querySelector('.work-output').hidden, true);

  work.event({ type: 'output', n: 1, stream: 'stdout', text: '第一行\n' });
  work.event({ type: 'output', n: 1, stream: 'stdout', text: '第二行\n' });
  assert.equal(box.querySelector('.work-output').textContent, '第一行\n第二行\n');
  assert.equal(box.querySelector('.work-output').hidden, false);

  work.event({
    type: 'step-end', n: 1, ok: true, error: '', elapsedMs: 1234,
    files: [{ name: 'chart.png', size: 2048, bytes: new Uint8Array([1, 2, 3]) }, { name: 'deck.pptx', size: 44000, bytes: new Uint8Array([1]) }]
  });
  assert.match(box.querySelector('.work-step-state').textContent, /1\.2 s/);
  assert.equal(box.querySelectorAll('.work-file-image img').length, 1, 'a picture shows as a thumbnail');
  assert.equal(box.querySelector('.work-file-image img').getAttribute('alt'), 'chart.png');
  assert.equal(box.querySelector('.work-file-chip .work-file-type').textContent, 'PPTX');
  assert.equal(box.querySelector('.work-file-chip .work-file-size').textContent, '43 KB');
  assert.equal(box.querySelector('.work-files').hidden, false);
  work.remove();
  assert.equal(composer.querySelector('.work-window'), null);
  window.happyDOM.abort();
});

test('a new run folds the earlier ones, and a failed run shows its error', () => {
  const { window, composer, work } = setup('en');
  work.event({ type: 'step', n: 1, title: '', code: 'a' });
  work.event({ type: 'step-end', n: 1, ok: true, error: '', files: [], elapsedMs: 10 });
  work.event({ type: 'step', n: 2, title: 'Second', code: 'boom()' });
  work.event({ type: 'output', n: 2, stream: 'stderr', text: 'warn\n' });
  work.event({ type: 'step-end', n: 2, ok: false, error: 'NameError: boom', files: [], elapsedMs: 5 });
  const [first, second] = composer.querySelectorAll('.work-step');
  assert.equal(first.open, false);
  assert.equal(second.open, true);
  assert.equal(second.querySelector('.work-step-state').textContent, `${sandboxText('en', 'workFailed')} · 0.0 s`);
  assert.match(second.querySelector('.work-output').textContent, /warn[\s\S]*NameError: boom/);
  assert.equal(second.querySelector('.work-output').classList.contains('is-error'), true);
  work.event({ type: 'output', n: 99, stream: 'stdout', text: 'ignored' });
  work.remove();
  window.happyDOM.abort();
});

test('long output keeps its end, and the window texts exist in five languages', () => {
  const { window, composer, work } = setup();
  work.event({ type: 'step', n: 1, title: '', code: 'x' });
  work.event({ type: 'output', n: 1, stream: 'stdout', text: `${'a'.repeat(5000)}END` });
  const shown = composer.querySelector('.work-output').textContent;
  assert.ok(shown.length <= 4000 && shown.endsWith('END'));
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of ['workFold', 'workUnfold', 'workRunning', 'workDone', 'workFailed']) {
      assert.notEqual(sandboxText(language, key), key, `${language} ${key}`);
    }
  }
  work.remove();
  window.happyDOM.abort();
});
