import assert from 'node:assert/strict';
import test from 'node:test';

import { loadPyodide } from 'pyodide';

import { LIMITS } from '../../public/sandbox/protocol.js';
import {
  chartFontOrder,
  clearFolders,
  collectOutput,
  mountInputFiles,
  prepareFolders,
  runCode,
  safeFileName,
  snapshotOutput,
  trimTraceback
} from '../../public/sandbox/runtime.js';

// The real Python runtime (from node_modules, no network), loaded once.
let pyodidePromise = null;
const getPyodide = () => {
  pyodidePromise ||= loadPyodide().then((pyodide) => {
    prepareFolders(pyodide);
    return pyodide;
  });
  return pyodidePromise;
};
const newGlobals = (pyodide) => pyodide.globals.get('dict')();

test('file names are kept, made safe and numbered when taken', () => {
  const taken = new Set();
  assert.equal(safeFileName('營收.csv', taken), '營收.csv');
  taken.add('營收.csv');
  assert.equal(safeFileName('營收.csv', taken), '營收 (2).csv');
  assert.equal(safeFileName('../../etc/passwd'), 'passwd');
  assert.equal(safeFileName('C:\\Users\\a\\b:c?.txt'), 'b_c_.txt');
  assert.equal(safeFileName('.hidden'), 'hidden');
  assert.equal(safeFileName(''), 'file');
});

test('tracebacks keep only the user code frames', () => {
  const message = [
    'Traceback (most recent call last):',
    '  File "/lib/python314.zip/_pyodide/_base.py", line 597, in eval_code_async',
    '    await CodeRunner(',
    '  File "<exec>", line 3, in <module>',
    'NameError: name \'x\' is not defined'
  ].join('\n');
  assert.equal(trimTraceback(message), 'Traceback (most recent call last):\n  File "<exec>", line 3, in <module>\nNameError: name \'x\' is not defined');
  assert.equal(trimTraceback('SyntaxError: bad\n'), 'SyntaxError: bad');
});

test('chart fonts put the document language first', () => {
  assert.deepEqual(chartFontOrder('zh-TW').slice(0, 2), ['Inter', 'Noto Sans TC']);
  assert.deepEqual(chartFontOrder('ja').slice(0, 2), ['Inter', 'Noto Sans JP']);
  assert.deepEqual(chartFontOrder('fr').slice(0, 2), ['Inter', 'Noto Sans TC']);
});

test('code runs in /work with its output captured and variables kept between runs', async () => {
  const pyodide = await getPyodide();
  const globals = newGlobals(pyodide);
  const first = await runCode(pyodide, 'import os\nx = 21\nprint(os.getcwd())\nprint("中文", end="")', globals);
  assert.equal(first.error, null);
  assert.equal(first.stdout.text, '/work\n中文');
  const second = await runCode(pyodide, 'import sys\nprint(x * 2)\nprint("warn", file=sys.stderr)', globals);
  assert.equal(second.stdout.text, '42\n');
  assert.equal(second.stderr.text, 'warn\n');
  const failed = await runCode(pyodide, 'y = 1\nundefined_name', globals);
  assert.match(failed.error, /^Traceback[\s\S]*File "<exec>", line 2[\s\S]*NameError/);
  assert.doesNotMatch(failed.error, /_pyodide/);
});

test('captured output stops at the limit and counts the rest', async () => {
  const pyodide = await getPyodide();
  const result = await runCode(pyodide, `print("a" * ${LIMITS.capturedTextChars + 10}, end="")`, newGlobals(pyodide));
  assert.equal(result.stdout.text.length, LIMITS.capturedTextChars);
  assert.equal(result.stdout.dropped, 10);
});

test('input files are mounted by name and replaced on the next mount', async () => {
  const pyodide = await getPyodide();
  const { mounted } = mountInputFiles(pyodide, [
    { name: 'a.csv', bytes: new TextEncoder().encode('x,y\n1,2\n') },
    { name: 'a.csv', bytes: new Uint8Array([1, 2, 3]) }
  ]);
  assert.deepEqual(mounted.map((file) => file.name), ['a.csv', 'a (2).csv']);
  const read = await runCode(pyodide, 'import os\nprint(sorted(os.listdir("/input")))\nprint(open("/input/a.csv").read(), end="")', newGlobals(pyodide));
  assert.equal(read.stdout.text, "['a (2).csv', 'a.csv']\nx,y\n1,2\n");
  mountInputFiles(pyodide, [{ name: 'b.txt', bytes: new Uint8Array([65]) }]);
  const after = await runCode(pyodide, 'import os\nprint(os.listdir("/input"))', newGlobals(pyodide));
  assert.equal(after.stdout.text, "['b.txt']\n");
});

test('clearing empties /output and /work but keeps /input and loaded modules', async () => {
  const pyodide = await getPyodide();
  mountInputFiles(pyodide, [{ name: 'keep.txt', bytes: new Uint8Array([65]) }]);
  await runCode(pyodide, 'import os, json\nos.makedirs("/output/sub", exist_ok=True)\nopen("/output/sub/a.txt", "w").write("a")\nopen("/work/tmp.txt", "w").write("t")', newGlobals(pyodide));
  clearFolders(pyodide);
  const after = await runCode(pyodide, 'import os, sys\nprint(os.listdir("/output"), os.listdir("/work"), os.listdir("/input"), os.getcwd(), "json" in sys.modules)', newGlobals(pyodide));
  assert.equal(after.stdout.text, "[] [] ['keep.txt'] /work True\n");
});

test('only files a run creates or changes in /output are collected, within the limits', async () => {
  const pyodide = await getPyodide();
  const globals = newGlobals(pyodide);
  await runCode(pyodide, 'open("/output/old.txt", "w").write("old")', globals);
  const before = snapshotOutput(pyodide);
  await runCode(pyodide, [
    'import os, time',
    'time.sleep(0.01)',
    'os.makedirs("/output/charts", exist_ok=True)',
    'open("/output/new.csv", "w").write("a,b")',
    'open("/output/charts/c.svg", "w").write("<svg/>")',
    'open("/output/macro.xlsm", "wb").write(b"PK")'
  ].join('\n'), globals);
  const { files, skipped } = collectOutput(pyodide, before);
  assert.deepEqual(files.map((file) => file.name), ['charts/c.svg', 'new.csv']);
  assert.equal(new TextDecoder().decode(files[1].bytes), 'a,b');
  assert.deepEqual(skipped, [{ name: 'macro.xlsm', reason: 'blocked-type' }]);

  const next = snapshotOutput(pyodide);
  await runCode(pyodide, `for i in range(${LIMITS.outputFileCount + 2}):\n    open(f"/output/many-{i:02d}.txt", "w").write("x")`, globals);
  const many = collectOutput(pyodide, next);
  assert.equal(many.files.length, LIMITS.outputFileCount);
  assert.equal(many.skipped.length, 2);
  assert.ok(many.skipped.every((file) => file.reason === 'too-many-files'));
});

test('what the code prints is reported while it runs, kept text only', async () => {
  const pyodide = await loadPyodide();
  prepareFolders(pyodide);
  const heard = [];
  const result = await runCode(pyodide, 'import sys\nprint("one")\nprint("two", file=sys.stderr)\nprint("三")', newGlobals(pyodide), { onOutput: (stream, text) => heard.push([stream, text]) });
  assert.equal(result.stdout.text, 'one\n三\n');
  assert.equal(heard.filter(([stream]) => stream === 'stdout').map(([, text]) => text).join(''), 'one\n三\n');
  assert.equal(heard.filter(([stream]) => stream === 'stderr').map(([, text]) => text).join(''), 'two\n');
  const long = [];
  await runCode(pyodide, `print("a" * ${LIMITS.capturedTextChars + 10}, end="")`, newGlobals(pyodide), { onOutput: (stream, text) => long.push(text) });
  assert.equal(long.join('').length, LIMITS.capturedTextChars, 'what was dropped is not sent either');
});
