import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Window } from 'happy-dom';

import { loadConfig } from '../../sandbox-host/runner/config.js';
import { collectOutput } from '../../sandbox-host/runner/output.js';
import { toolResultFor } from '../../src/app/runtime/sandbox/sandbox-reply.js';
import { SANDBOX_TEXT_KEYS, SANDBOX_TEXT_LANGUAGES, sandboxTextsFor, skippedFileText } from '../../src/app/runtime/sandbox/sandbox-texts.js';
import { createSandboxLedger } from '../../src/app/ui/sandbox/sandbox-ledger.js';

const MB = 1024 * 1024;

test('the runner lets a step leave files up to 50 MB each and 100 MB together, and says which file went and what the limit was', () => {
  const config = loadConfig({ RUNNER_TOKEN: 'a'.repeat(40) });
  assert.equal(config.outputFileBytes, 50 * MB);
  assert.equal(config.outputTotalBytes, 100 * MB);
  const dir = mkdtempSync(join(tmpdir(), 'noureon-out-'));
  try {
    writeFileSync(join(dir, 'a.bin'), Buffer.alloc(30 * MB));
    writeFileSync(join(dir, 'b.bin'), Buffer.alloc(40 * MB));
    writeFileSync(join(dir, 'c.bin'), Buffer.alloc(45 * MB));
    writeFileSync(join(dir, 'd.bin'), Buffer.alloc(51 * MB));
    const limits = { outputFileCount: 10, outputFileBytes: config.outputFileBytes, outputTotalBytes: config.outputTotalBytes };
    const { files, skipped } = collectOutput(dir, new Map(), limits);
    assert.deepEqual(files.map((file) => file.name), ['a.bin', 'b.bin'], 'what fits, in order');
    assert.deepEqual(skipped.map((file) => [file.name, file.reason, file.limit]), [['c.bin', 'total-too-large', 100 * MB], ['d.bin', 'file-too-large', 50 * MB]]);
    // The browser's own sandbox keeps its smaller limits when none are given.
    assert.deepEqual(collectOutput(dir, new Map()).files.map((file) => file.name), [], 'the default is 25 MB each, 50 MB together: not even the 30 MB file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the model is told a file was not delivered and what to do, and the person sees the line in the step', () => {
  const result = toolResultFor({ stdout: '', stderr: '', files: [], skippedFiles: [{ name: 'big.mp4', reason: 'file-too-large', size: 80 * MB, limit: 50 * MB }] });
  const parsed = JSON.parse(result);
  assert.deepEqual(parsed.skipped_files, [{ path: '/output/big.mp4', reason: 'file-too-large', size_mb: 80, limit_mb: 50 }]);
  assert.match(parsed.skipped_note, /NOT delivered/);
  assert.equal(JSON.parse(toolResultFor({ files: [] })).skipped_note, undefined);

  const window = new Window({ url: 'https://example.test/' });
  window.document.body.innerHTML = '<div id="host"></div>';
  const host = window.document.getElementById('host');
  const ledger = createSandboxLedger({ document: window.document, host, language: 'en' });
  ledger.event({ type: 'step', n: 1, title: 'Download', code: 'yt-dlp URL', command: true });
  ledger.event({ type: 'step-end', n: 1, ok: true, error: '', files: [], skipped: [{ name: 'big.mp4', reason: 'file-too-large', size: 80 * MB, limit: 50 * MB }], elapsedMs: 5 });
  assert.equal(host.querySelector('.sandbox-run-note.is-skipped').textContent, 'Not offered for download: big.mp4 (80 MB, over the limit of 50 MB per file)');
  ledger.remove();
});

test('every reason a file may not be offered has its words in the five languages', () => {
  for (const reason of ['file-too-large', 'total-too-large', 'too-many-files', 'blocked-type', 'not-saved', 'quota']) {
    for (const language of SANDBOX_TEXT_LANGUAGES) {
      const text = skippedFileText(language, { name: 'x.mp4', reason, size: 60 * MB, limit: 50 * MB });
      assert.ok(text.includes('x.mp4'), `${language} ${reason}`);
      assert.doesNotMatch(text, /\{\w+\}/, `${language} ${reason}`);
    }
  }
  for (const language of SANDBOX_TEXT_LANGUAGES) assert.deepEqual(Object.keys(sandboxTextsFor(language)), SANDBOX_TEXT_KEYS, language);
});
