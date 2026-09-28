import assert from 'node:assert/strict';
import test from 'node:test';

import { SandboxError, createSandboxClient } from '../../src/app/runtime/sandbox/sandbox-client.js';

const ORIGIN = 'http://127.0.0.1:5173';

// A page with one iframe whose "sandbox" answers through `respond`.
function createFakePage(respond) {
  const listeners = new Set();
  const sent = [];
  let frame = null;
  const window = {
    location: new URL('http://localhost:5173/'),
    addEventListener: (type, listener) => { if (type === 'message') listeners.add(listener); },
    removeEventListener: (type, listener) => listeners.delete(listener),
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (id) => clearInterval(id)
  };
  const reply = (data, { origin = ORIGIN, source } = {}) => {
    queueMicrotask(() => listeners.forEach((listener) => listener({ data, origin, source: source ?? frame.contentWindow })));
  };
  const document = {
    createElement: () => {
      const handlers = {};
      frame = {
        attributes: {},
        style: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener: (type, handler) => { handlers[type] = handler; },
        remove() { frame.removed = true; },
        contentWindow: {
          postMessage(message, targetOrigin, transfer) {
            sent.push({ message, targetOrigin, transfer });
            respond(message, reply);
          }
        }
      };
      queueMicrotask(() => handlers.load?.());
      return frame;
    },
    body: { appendChild: () => {} }
  };
  return { window, document, sent, reply, frame: () => frame };
}

const answerAll = (message, reply) => {
  if (message.type === 'init') reply({ type: 'ready', id: message.id, protocol: 1 });
  if (message.type === 'run') reply({ type: 'result', id: message.id, stdout: { text: 'ok\n', dropped: 0 }, error: null });
  if (message.type === 'reset' || message.type === 'clear' || message.type === 'mount') reply({ type: 'result', id: message.id });
};

test('the sandbox frame is isolated and only told the language', async () => {
  const page = createFakePage(answerAll);
  const client = createSandboxClient({ document: page.document, window: page.window, origin: ORIGIN, language: 'ja' });
  const ready = await client.prepare();
  assert.equal(ready.type, 'ready');
  const frame = page.frame();
  assert.equal(frame.src, `${ORIGIN}/sandbox/index.html`);
  assert.equal(frame.attributes.sandbox, 'allow-scripts allow-same-origin');
  assert.equal(frame.attributes.allow, '');
  assert.equal(frame.attributes.referrerpolicy, 'no-referrer');
  assert.deepEqual(Object.keys(page.sent[0].message).sort(), ['id', 'language', 'type']);
  assert.equal(page.sent[0].targetOrigin, ORIGIN, 'messages only go to the sandbox origin');
  const result = await client.run('print("ok")');
  assert.equal(result.stdout.text, 'ok\n');
  client.dispose();
  assert.equal(frame.removed, true);
});

test('replies from another origin or window are ignored, failures reject', async () => {
  const page = createFakePage((message, reply) => {
    if (message.type === 'init') {
      reply({ type: 'ready', id: message.id }, { origin: 'https://evil.example' });
      reply({ type: 'ready', id: message.id }, { source: {} });
      reply({ type: 'failure', id: message.id, stage: 'init', message: 'no python' });
    }
  });
  const client = createSandboxClient({ document: page.document, window: page.window, origin: ORIGIN });
  await assert.rejects(client.prepare(), (error) => error instanceof SandboxError && error.message === 'no python' && error.stage === 'init');
});

test('files are sent as transferable copies and fonts only when asked for', async () => {
  const fontBytes = new Uint8Array([1, 2, 3]);
  let fontsLoaded = 0;
  const page = createFakePage((message, reply) => {
    answerAll(message, reply);
    if (message.type === 'run') reply({ type: 'fonts-request' });
  });
  const client = createSandboxClient({
    document: page.document,
    window: page.window,
    origin: ORIGIN,
    loadFonts: async () => { fontsLoaded += 1; return [{ name: 'inter.ttf', family: 'Inter', bytes: fontBytes }]; }
  });
  const csv = new Uint8Array([65, 66]);
  await client.mount([{ name: 'a.csv', type: 'text/csv', bytes: csv }, { name: 'b.txt', bytes: new Blob(['hi']) }]);
  const mount = page.sent.find((entry) => entry.message.type === 'mount');
  assert.deepEqual(mount.message.files.map((file) => [file.name, file.bytes.byteLength]), [['a.csv', 2], ['b.txt', 2]]);
  assert.equal(mount.transfer.length, 2);
  assert.equal(csv.byteLength, 2, "the caller's bytes are not transferred away");
  assert.equal(fontsLoaded, 0);
  await client.run('import matplotlib');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const fonts = page.sent.find((entry) => entry.message.type === 'fonts');
  assert.equal(fontsLoaded, 1);
  assert.deepEqual(fonts.message.fonts.map((font) => [font.name, font.family, font.bytes.byteLength]), [['inter.ttf', 'Inter', 3]]);
  assert.equal(fontBytes.byteLength, 3, 'the prepared fonts stay usable');
  client.dispose();
});

test('stopping a run resets the sandbox and resolves as stopped', async () => {
  const page = createFakePage((message, reply) => {
    if (message.type !== 'run') answerAll(message, reply);
  });
  const client = createSandboxClient({ document: page.document, window: page.window, origin: ORIGIN });
  const controller = new AbortController();
  const running = client.run('while True: pass', { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();
  assert.deepEqual(await running, { stopped: true });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(page.sent.some((entry) => entry.message.type === 'reset'));
  client.dispose();
});
