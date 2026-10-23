import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

// The sandbox page (public/sandbox/host.js) with a page above it and a Worker of its own making: who it answers, what it forwards, and what it does when
// the code runs too long, the worker crashes, or Pyodide dies.

const SANDBOX = 'https://run.noureon.com';
const APP = 'https://noureon.com';
const hostUrl = new URL('../../public/sandbox/host.js', import.meta.url).href;

const setGlobal = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
let counter = 0;

// A worker whose answers a test scripts: `script(message, worker)` runs for each message the host posts to it.
const makeWorkerClass = (script, made) => class FakeWorker {
  constructor(url, options) {
    this.url = String(url);
    this.options = options;
    this.listeners = new Map();
    this.terminated = false;
    this.posted = [];
    made.push(this);
  }
  addEventListener(type, listener) { (this.listeners.get(type) || this.listeners.set(type, new Set()).get(type)).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event) { for (const listener of [...(this.listeners.get(type) || [])]) listener(event); }
  reply(data) { queueMicrotask(() => this.emit('message', { data })); }
  postMessage(message) { this.posted.push(message); script(message, this); }
  terminate() { this.terminated = true; }
};

const quietWorker = (message, worker) => {
  if (message.type === 'init') worker.reply({ type: 'ready' });
  else if (message.type === 'mount') worker.reply({ type: 'result', id: message.id, mounted: (message.files || []).length });
  else if (message.type === 'clear') worker.reply({ type: 'result', id: message.id, cleared: true });
  else if (message.type === 'run') {
    worker.reply({ type: 'progress', id: message.id, stage: 'running' });
    worker.reply({ type: 'result', id: message.id, stdout: `ran: ${message.code}`, files: [] });
  }
};

// Loads the page fresh (its state is module-level) at the given origin, with the page above it recorded.
const open = async ({ script = quietWorker, origin = SANDBOX } = {}) => {
  const win = new Window({ url: `${origin}/sandbox/index.html` });
  const sent = [];
  const parent = { postMessage: (message, target, transfer) => sent.push({ message, target, transfer }) };
  Object.defineProperty(win, 'parent', { value: parent, configurable: true });
  const made = [];
  setGlobal('window', win);
  setGlobal('navigator', win.navigator);
  setGlobal('Worker', makeWorkerClass(script, made));
  await import(`${hostUrl}?case=${counter += 1}`);
  const tell = async (data, { from = APP, source = parent } = {}) => {
    win.dispatchEvent(Object.assign(new win.Event('message'), { data, origin: from, source }));
    for (let tick = 0; tick < 20; tick += 1) await new Promise((resolve) => setImmediate(resolve));
  };
  return { win, sent, made, tell, replies: () => sent.map((entry) => entry.message) };
};

test('a page that is not on the sandbox origin does not listen at all', async () => {
  const page = await open({ origin: 'https://evil.example' });
  await page.tell({ type: 'init', id: '1' });
  assert.deepEqual(page.sent, []);
  assert.equal(page.made.length, 0);
});

test('only an app origin the sandbox knows is answered, and the first one to speak is the only one after that', async () => {
  const page = await open();
  await page.tell({ type: 'init', id: '1' }, { from: 'https://evil.example' });
  assert.deepEqual(page.sent, [], 'a stranger gets nothing');
  await page.tell({ type: 'init', id: '1' }, { source: { postMessage() {} } });
  assert.deepEqual(page.sent, [], 'only the page above may speak');
  await page.tell({ type: 'init', id: '1' }, { from: SANDBOX });
  assert.deepEqual(page.sent, [], 'never the sandbox\'s own origin');

  await page.tell({ type: 'init', id: '2', language: 'en' });
  assert.equal(page.sent.at(-1).target, APP, 'answers go to that origin, never to *');
  assert.equal(page.replies().at(-1).type, 'ready');
  await page.tell({ type: 'run', id: '3', code: 'x' }, { from: 'https://staging.noureon.com' });
  assert.equal(page.replies().some((reply) => reply.id === '3'), false, 'another allowed origin is not answered once one has begun');
});

test('init loads the worker with the page\'s language and says what protocol and Python it has; running before init is refused', async () => {
  const page = await open();
  await page.tell({ type: 'run', id: '0', code: 'print(1)' });
  assert.match(page.replies().find((reply) => reply.id === '0').message, /not been initialised/);

  await page.tell({ type: 'init', id: '1', language: 'fr' });
  const ready = page.replies().find((reply) => reply.type === 'ready');
  assert.equal(ready.id, '1');
  assert.equal(ready.protocol, 1);
  assert.match(ready.pyodide, /^\d+\.\d+\.\d+$/);
  assert.equal(page.made.length, 1);
  assert.equal(page.made[0].options.type, 'module');
  assert.equal(page.made[0].posted[0].language, 'fr');
});

test('code is run in the worker and its result goes back, and a second request while one runs is told the sandbox is busy', async () => {
  let held;
  const page = await open({ script: (message, worker) => {
    if (message.type === 'init') worker.reply({ type: 'ready' });
    else if (message.type === 'mount') worker.reply({ type: 'result', id: message.id, mounted: (message.files || []).length });
    else if (message.type === 'run') held = { message, worker };
  } });
  await page.tell({ type: 'init', id: '1' });
  await page.tell({ type: 'run', id: '2', code: 'print(1)' });
  await page.tell({ type: 'run', id: '3', code: 'print(2)' });
  assert.match(page.replies().find((reply) => reply.id === '3').message, /busy/);
  held.worker.reply({ type: 'result', id: '2', stdout: '1\n', files: [] });
  await page.tell({ type: 'noop' });
  await page.tell({ type: 'mount', id: '4', files: [] });
  assert.equal(page.replies().find((reply) => reply.id === '2').stdout, '1\n');
  assert.equal(page.replies().find((reply) => reply.id === '4').mounted, 0, 'free again after the result');
});

test('files to mount are cleaned (only well-formed ones) and copied to the worker, again after the worker is replaced', async () => {
  const page = await open();
  await page.tell({ type: 'init', id: '1' });
  const good = new Uint8Array([1, 2, 3]).buffer;
  await page.tell({ type: 'mount', id: '2', files: [{ name: 'a.csv', type: 'text/csv', bytes: good }, { name: 5, bytes: good }, { name: 'b.csv', bytes: 'not bytes' }, null] });
  const worker = page.made[0];
  const mounted = worker.posted.find((message) => message.type === 'mount');
  assert.deepEqual(mounted.files.map((file) => file.name), ['a.csv']);
  assert.deepEqual([...mounted.files[0].bytes], [1, 2, 3]);
  assert.equal(page.replies().find((reply) => reply.id === '2').mounted, 1);

  await page.tell({ type: 'reset', id: '3' });
  assert.equal(worker.terminated, true, 'reset throws the worker away');
  assert.equal(page.made.length, 2);
  assert.deepEqual(page.made[1].posted.find((message) => message.type === 'mount').files.map((file) => file.name), ['a.csv'], 'the new worker is given the files again');
  assert.equal(page.replies().find((reply) => reply.id === '3').restarted, true);
});

test('code that runs past its limit is stopped, the worker is replaced, and the page above is told it timed out', async () => {
  const page = await open({ script: (message, worker) => {
    if (message.type === 'init') worker.reply({ type: 'ready' });
    else if (message.type === 'run') worker.reply({ type: 'progress', id: message.id, stage: 'running' });
  } });
  await page.tell({ type: 'init', id: '1' });
  await page.tell({ type: 'run', id: '2', code: 'while True: pass', timeoutMs: 1 });
  assert.equal(page.replies().some((reply) => reply.id === '2' && reply.type === 'result'), false, 'not yet');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await page.tell({ type: 'noop' });
  const result = page.replies().find((reply) => reply.id === '2' && reply.type === 'result');
  assert.equal(result.timedOut, true);
  assert.equal(result.restarted, true);
  assert.equal(page.made[0].terminated, true);
  assert.equal(page.made.length, 2, 'a fresh worker was started');
});

test('a worker that crashes while code runs, or a Pyodide that has died, is replaced and the code is reported as crashed', async () => {
  const page = await open({ script: (message, worker) => {
    if (message.type === 'init') worker.reply({ type: 'ready' });
    else if (message.type === 'run' && message.code === 'crash') queueMicrotask(() => worker.emit('error', { message: 'out of memory', preventDefault() {} }));
    else if (message.type === 'run') worker.reply({ type: 'result', id: message.id, error: 'Pyodide has suffered a fatal error. Please report this to the Pyodide maintainers.' });
  } });
  await page.tell({ type: 'init', id: '1' });
  await page.tell({ type: 'run', id: '2', code: 'crash' });
  const crashed = page.replies().find((reply) => reply.id === '2');
  assert.equal(crashed.crashed, true);
  assert.match(crashed.error, /out of memory/);
  assert.equal(page.made.length, 2);

  await page.tell({ type: 'run', id: '3', code: 'fatal' });
  const fatal = page.replies().find((reply) => reply.id === '3');
  assert.equal(fatal.crashed, true, 'a fatal Pyodide error is a crash, not a result');
  assert.equal(page.made.length, 3);
});

test('a worker that cannot start is told to the page above as a failure of init', async () => {
  const page = await open({ script: (message, worker) => { if (message.type === 'init') worker.reply({ type: 'failure', message: 'no network' }); } });
  await page.tell({ type: 'init', id: '1' });
  const failure = page.replies().find((reply) => reply.id === '1');
  assert.equal(failure.type, 'failure');
  assert.equal(failure.stage, 'init');
  assert.match(failure.message, /no network/);
});

test('the chart fonts of the app are asked for once, kept, and given to the worker that needs them', async () => {
  const page = await open({ script: (message, worker) => {
    if (message.type === 'init') worker.reply({ type: 'ready' });
    else if (message.type === 'run') { worker.reply({ type: 'fonts-request' }); worker.reply({ type: 'result', id: message.id, files: [] }); }
  } });
  await page.tell({ type: 'init', id: '1' });
  await page.tell({ type: 'run', id: '2', code: 'plot' });
  assert.equal(page.replies().filter((reply) => reply.type === 'fonts-request').length, 1, 'asked of the page above');
  const bytes = new Uint8Array([9, 9]).buffer;
  await page.tell({ type: 'fonts', fonts: [{ name: 'A.ttf', family: 'A', bytes }, { name: 'bad', bytes: 'x' }] });
  const delivered = page.made[0].posted.find((message) => message.type === 'fonts');
  assert.deepEqual(delivered.fonts.map((font) => font.name), ['A.ttf']);
  await page.tell({ type: 'run', id: '3', code: 'plot' });
  assert.equal(page.replies().filter((reply) => reply.type === 'fonts-request').length, 1, 'not asked again: the page keeps them');
});
