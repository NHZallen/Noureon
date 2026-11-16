// A file the browser agent downloaded is a step of the reply with its file and nothing else: the row says "Downloaded", has no code card, and lists the file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createSandboxRunElement } from '../src/app/ui/sandbox/sandbox-run-view.js';
import { normalizeSandboxRun } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { sandboxText } from '../src/app/runtime/sandbox/sandbox-texts.js';

const run = normalizeSandboxRun({ status: 'done', elapsedMs: 4000, steps: [
  { title: 'report.pdf', code: '', stdout: '', stderr: '', files: [{ name: 'report.pdf', size: 2048, id: 'file-1' }], elapsedMs: 0 },
  { title: 'Sum', code: 'print(1)', stdout: '1', stderr: '', files: [], elapsedMs: 12 }
] });

test('a download step is worded as a download and a code step keeps its words', () => {
  const window = new Window();
  const element = createSandboxRunElement(window.document, run, { language: 'en' });
  const labels = [...element.querySelectorAll('.ledger-label')].map((node) => node.textContent);
  assert.ok(labels.some((label) => label.includes('Downloaded: report.pdf')), labels.join(' | '));
  assert.ok(labels.some((label) => label.includes('Ran code: Sum')));
  assert.ok(!labels.some((label) => label.includes('Ran code: report.pdf')));
  assert.ok(element.textContent.includes('report.pdf'));
});

test('the five languages word it', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) assert.match(sandboxText(language, 'browserDownloaded', { title: 'x.pdf' }), /x\.pdf/, language);
});
