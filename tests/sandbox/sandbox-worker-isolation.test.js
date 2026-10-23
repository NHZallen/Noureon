import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('../..', import.meta.url).pathname;

// The worker that runs the model's Python (public/sandbox/worker.js) cuts itself off from the network before it does anything else. It is run in a
// process of its own with the globals of a worker (tests/helpers/sandbox/run-worker.mjs), because that cut is for good.

const worker = async (messages = []) => {
  const { stdout } = await run(process.execPath, ['tests/helpers/sandbox/run-worker.mjs'], { cwd: root, env: { PATH: process.env.PATH, BOOT_SCENARIO: JSON.stringify({ messages }) }, timeout: 60_000 });
  return JSON.parse(stdout.split('\n').find((line) => line.startsWith('REPORT ')).slice('REPORT '.length));
};

test('the worker takes the ways out of the sandbox away for good: only fetch is left, and only to the pinned files and the sandbox\'s own', async () => {
  const report = await worker();
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource', 'BroadcastChannel', 'Worker', 'importScripts', 'indexedDB', 'caches']) {
    assert.equal(report.removed[name], 'undefined', name);
  }
  assert.match(report.refused, /Network access is disabled/);
  assert.equal(report.fetchWritable, false);
  assert.equal(report.fetchConfigurable, false);
  assert.equal(report.reassigned, 'threw', 'code cannot put the real fetch back');
  assert.deepEqual(report.fetched, ['https://run.noureon.com/sandbox/pyodide/pyodide-lock.json'], 'only the sandbox\'s own file reached the network');
});

test('code longer than the limit is refused before Pyodide is even loaded', async () => {
  const report = await worker([{ type: 'run', id: '1', codeLength: 200_001 }]);
  const result = report.posted.find((message) => message.id === '1');
  assert.equal(result.type, 'result');
  assert.match(result.error, /longer than 200000 characters/);
  assert.equal(report.posted.some((message) => message.stage === 'runtime'), false, 'Pyodide was not started for it');
});

test('messages the worker does not know, and fonts nobody asked for, are ignored without an answer', async () => {
  const report = await worker([{ type: 'nonsense', id: 'a' }, { type: 'fonts', fonts: [{ name: 'x.ttf' }] }, {}]);
  assert.deepEqual(report.posted, []);
});

test('when Pyodide cannot be loaded the worker says so for the request that needed it, instead of dying', async () => {
  const report = await worker([{ type: 'init', id: '1' }, { type: 'mount', id: '2', files: [] }]);
  assert.equal(report.posted.find((message) => message.stage === 'runtime').type, 'progress');
  for (const id of ['1', '2']) {
    const failure = report.posted.find((message) => message.id === id);
    assert.equal(failure.type, 'failure', id);
    assert.ok(failure.message.length > 0 && failure.message.length <= 2000);
  }
});
