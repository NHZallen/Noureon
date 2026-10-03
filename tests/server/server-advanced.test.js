import assert from 'node:assert/strict';
import test from 'node:test';

import { collectInputFiles, createStepEvents, finishAdvancedReply } from '../../server/advanced-reply.js';
import { executeReply, ReplyError } from '../../server/executor.js';
import { liftSandboxRunBlock } from '../../src/app/ui/sandbox/sandbox-run-block.js';

const KEY = 'sk-provider-secret-value';
const USER = '323e4567-e89b-12d3-a456-426614174002';
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });

const modelInfo = { id: 'openrouter-test', apiId: 'test/model', name: 'Test model', provider: 'openrouter' };
const specFor = (tools = {}, request = {}) => ({
  protocol: 1,
  clientVersion: '17.5.0',
  conversationId: '123e4567-e89b-12d3-a456-426614174000',
  assistantMessageId: '223e4567-e89b-12d3-a456-426614174001',
  sequence: 3,
  model: { provider: 'openrouter', id: 'test/model', info: modelInfo },
  request: { history: [], currentMessage: { parts: [{ text: 'Make me a chart file.' }] }, systemInstruction: 'Be helpful.', language: 'en', ...request },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: true, ...tools }
});
const secrets = { providerKey: KEY };

// A sandbox host that records what it is given and answers each step from a list.
function fakeHost(steps) {
  const record = { mounted: null, ran: [], disposed: 0, options: null };
  return {
    record,
    configured: true,
    getSandbox: (options) => {
      record.options = options;
      return {
        prepare: async () => ({}),
        clear: async () => ({}),
        mount: async (files) => { record.mounted = await Promise.all(files.map(async (file) => ({ name: file.name, text: Buffer.from(await file.bytes).toString() }))); return {}; },
        run: async (code) => {
          record.ran.push(code);
          const step = steps.shift();
          options.onProgress?.({ stage: 'output', stream: 'stdout', text: step.stdout });
          return { stdout: { text: step.stdout, dropped: 0 }, stderr: { text: '', dropped: 0 }, error: step.error || '', elapsedMs: 120, files: step.files || [], skippedFiles: [] };
        },
        dispose: async () => { record.disposed += 1; }
      };
    }
  };
}
const fakeFiles = () => {
  const saved = [];
  return { saved, save: async ({ userId, bytes, mimeType }) => { saved.push({ userId, text: Buffer.from(bytes).toString(), mimeType }); return { __astraCloudAsset: { path: `${userId}/hash${saved.length}`, mimeType, encoding: 'base64' } }; }, load: async () => new Uint8Array([1]) };
};

test('a reply with Python: the model\'s code runs in the sandbox, its files are kept and listed, the steps are told as they happen', async () => {
  const host = fakeHost([{ stdout: 'ok\n', files: [{ name: 'chart.png', size: 3, bytes: new Uint8Array([1, 2, 3]) }, { name: 'data.csv', size: 5, bytes: new TextEncoder().encode('a,b\n1') }] }]);
  const files = fakeFiles();
  const events = [];
  const live = [];
  let round = 0;
  const bodies = [];
  const result = await executeReply({
    spec: specFor(),
    secrets,
    userId: USER,
    sandboxHost: host,
    files,
    onLive: (event) => { live.push(event); if (event.ev) events.push(event.ev); },
    fetchImpl: async (url, options) => {
      bodies.push(JSON.parse(options.body));
      round += 1;
      return streamResponse(round === 1
        ? sse(toolCall('call_1', 'run_python', { title: 'Make the files', note: 'Making the chart.', code: 'print("ok")' }))
        : sse(content('Here are your files.')));
    }
  });
  assert.equal(result.status, 'done');
  assert.deepEqual(host.record.ran, ['print("ok")']);
  assert.equal(host.record.disposed, 1, 'the container goes with the reply');
  assert.equal(result.toolCalls, 1);

  const [text, ...fileParts] = result.parts;
  const { run, text: answer } = liftSandboxRunBlock(text.text);
  assert.equal(answer, 'Here are your files.');
  assert.equal(run.status, 'done');
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].title, 'Make the files');
  assert.equal(run.steps[0].stdout, 'ok\n');
  assert.deepEqual(run.steps[0].files.map((file) => file.name), ['chart.png', 'data.csv']);
  assert.ok(run.steps[0].files.every((file) => typeof file.id === 'string'), 'each file is listed by the id of its part');

  assert.equal(fileParts.length, 2);
  assert.deepEqual(fileParts.map((part) => part.sandboxFile.name), ['chart.png', 'data.csv']);
  assert.equal(fileParts[0].sandboxFile.mimeType, 'image/png');
  assert.equal(fileParts[0].sandboxFile.size, 3);
  assert.deepEqual(Object.keys(fileParts[0].sandboxFile.data), ['__astraCloudAsset'], 'the bytes are in storage, the message holds the marker');
  assert.equal(fileParts[0].sandboxFile.data.__astraCloudAsset.path.startsWith(`${USER}/`), true);
  assert.deepEqual(fileParts.map((part) => part.sandboxFile.id), run.steps[0].files.map((file) => file.id));
  assert.equal(files.saved[1].text, 'a,b\n1');
  assert.equal(JSON.stringify(result.parts).includes(KEY), false);

  // What the page's step list is told.
  assert.ok(events.every((event) => Number.isFinite(event.t) && event.t >= 0), 'each event says when it happened, so a page that joins late draws the same times');
  const types = events.map((event) => event.type);
  assert.ok(types.includes('step') && types.includes('output') && types.includes('step-end'));
  const end = events.find((event) => event.type === 'step-end');
  assert.equal(end.files[0].name, 'chart.png');
  assert.equal(end.files[0].data, Buffer.from([1, 2, 3]).toString('base64'), 'a small picture is shown while the step runs');
  assert.equal(end.files[1].data, undefined, 'a file that is not a picture is only named');
  assert.equal(JSON.stringify(live).includes('"bytes"'), false, 'bytes never go over the live channel');

  // The model was given the tool and the guidance for a sandbox on the server.
  const first = bodies[0];
  assert.ok(first.tools.some((tool) => tool.function.name === 'run_python'));
  assert.match(JSON.stringify(first.messages), /on the server/);
  assert.doesNotMatch(JSON.stringify(first.messages), /Pyodide/);
});

test('the files of the conversation are what the code finds in /input', async () => {
  const host = fakeHost([{ stdout: '' }]);
  let round = 0;
  await executeReply({
    spec: specFor({ inputs: [{ name: 'new.txt', mimeType: 'text/plain', data: Buffer.from('fresh').toString('base64') }] }, {
      history: [
        { role: 'user', parts: [{ inlineData: { name: 'old.txt', mimeType: 'text/plain', data: Buffer.from('old').toString('base64') } }, { text: 'here' }] },
        { role: 'model', parts: [{ text: 'ok' }, { sandboxFile: { id: 'f1', name: 'made.txt', mimeType: 'text/plain', size: 4, data: { __astraCloudAsset: { path: `${USER}/abc`, mimeType: 'text/plain', encoding: 'base64' } } } }] }
      ]
    }),
    secrets,
    userId: USER,
    sandboxHost: host,
    files: { ...fakeFiles(), load: async ({ userId, marker }) => { assert.equal(userId, USER); assert.equal(marker.__astraCloudAsset.path, `${USER}/abc`); return new TextEncoder().encode('kept'); } },
    fetchImpl: async () => { round += 1; return streamResponse(round === 1 ? sse(toolCall('c', 'run_python', { code: 'print(1)' })) : sse(content('done'))); }
  });
  assert.deepEqual(host.record.mounted.map((file) => `${file.name}=${file.text}`), ['old.txt=old', 'made.txt=kept', 'new.txt=fresh']);
});

test('inputs of other people\'s folders are never read', () => {
  const inputs = collectInputFiles({
    history: [{ parts: [{ sandboxFile: { name: 'x.txt', size: 1, data: { __astraCloudAsset: { path: 'someone-else/abc' } } } }] }],
    userId: USER,
    files: { load: async () => { throw new Error('must not be read'); } }
  });
  assert.deepEqual(inputs, []);
});

test('a reply that does not call Python is an ordinary reply, and no container is made for it unless asked', async () => {
  const host = fakeHost([]);
  let made = 0;
  const original = host.getSandbox;
  host.getSandbox = (options) => { made += 1; return original(options); };
  const result = await executeReply({
    spec: specFor(),
    secrets,
    userId: USER,
    sandboxHost: host,
    files: fakeFiles(),
    fetchImpl: async () => streamResponse(sse(content('Just words.')))
  });
  assert.equal(made, 0, 'the sandbox is asked for only when the model calls it');
  assert.deepEqual(result.parts, [{ text: 'Just words.' }]);
});

test('a sandbox that cannot start: the model finishes without it', async () => {
  let round = 0;
  const result = await executeReply({
    spec: specFor(),
    secrets,
    userId: USER,
    sandboxHost: { configured: true, getSandbox: () => ({ prepare: async () => { throw new Error('The Python sandbox could not be reached.'); }, dispose: async () => {} }) },
    files: fakeFiles(),
    fetchImpl: async () => { round += 1; return streamResponse(round === 1 ? sse(toolCall('c', 'run_python', { code: 'print(1)' })) : sse(content('I could not run it, but here is the answer.'))); }
  });
  const { run, text } = liftSandboxRunBlock(result.parts[0].text);
  assert.equal(run.fallback, 'sandbox-load-failed');
  assert.equal(text, 'I could not run it, but here is the answer.');
});

test('stopping a reply with Python keeps what was written and marks the run stopped', async () => {
  const controller = new AbortController();
  const host = fakeHost([]);
  host.getSandbox = () => ({
    prepare: async () => ({}),
    clear: async () => ({}),
    mount: async () => ({}),
    run: async () => { controller.abort(); return { stopped: true }; },
    dispose: async () => {}
  });
  let round = 0;
  const result = await executeReply({
    spec: specFor(),
    secrets,
    userId: USER,
    sandboxHost: host,
    files: fakeFiles(),
    signal: controller.signal,
    fetchImpl: async () => { round += 1; return streamResponse(sse(content('Starting. '), toolCall('c', 'run_python', { code: 'while True: pass' }))); }
  });
  assert.equal(result.status, 'stopped');
  const { run, text } = liftSandboxRunBlock(result.parts[0].text);
  assert.equal(run.status, 'stopped');
  assert.equal(run.steps[0].stopped, true);
  assert.match(text, /Starting\./);
});

test('Python without a sandbox host is a failure the person is told of, not a reply without it', async () => {
  await assert.rejects(() => executeReply({ spec: specFor(), secrets, userId: USER, fetchImpl: async () => streamResponse(sse(content('x'))) }), (error) => error instanceof ReplyError);
});

test('a reply taken up after a restart starts again from its beginning (the sandbox was lost)', async () => {
  const requests = [];
  const result = await executeReply({
    spec: specFor(),
    secrets,
    userId: USER,
    sandboxHost: fakeHost([]),
    files: fakeFiles(),
    resume: { version: 1, toolTurns: [{ stale: true }], text: 'old text', research: { used: 3 }, sources: [{ url: 'https://old.example', n: 1 }], elapsedMs: 5000 },
    fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return streamResponse(sse(content('Fresh.'))); }
  });
  assert.deepEqual(result.parts, [{ text: 'Fresh.' }]);
  assert.equal(JSON.stringify(requests).includes('old text'), false);
});

test('a file the store cannot take: a small one stays in the message, a large one is left out and said so', async () => {
  const run = { status: 'done', steps: [{ title: '', code: '', stdout: '', stderr: '', files: [{ name: 'small.txt', size: 2 }, { name: 'large.bin', size: 6 * 1024 * 1024 }], outputs: [{ name: 'small.txt', bytes: new Uint8Array([104, 105]) }, { name: 'large.bin', bytes: new Uint8Array(6 * 1024 * 1024) }] }] };
  const out = await finishAdvancedReply({ result: { text: 'Done.' }, run, userId: USER, files: { save: async () => { throw new Error('storage is down'); } }, createId: (() => { let n = 0; return () => `id${++n}`; })() });
  assert.equal(out.parts.length, 1);
  assert.equal(out.parts[0].sandboxFile.data, Buffer.from('hi').toString('base64'));
  const { run: kept } = liftSandboxRunBlock(out.text);
  assert.deepEqual(kept.steps[0].files.map((file) => file.name), ['small.txt']);
  assert.deepEqual(kept.steps[0].skipped, [{ name: 'large.bin', reason: 'not-saved' }]);
});

test('the end of a reply that cannot be finished with its files still gives the answer, and the log is told', async () => {
  // A file the host names in a way the listing cannot take: the answer is kept, the files are left out.
  const host = fakeHost([{ stdout: 'ok\n', files: [{ name: 5, size: 3, bytes: new Uint8Array([1, 2, 3]) }] }]);
  const problems = [];
  let round = 0;
  const result = await executeReply({
    spec: specFor(),
    secrets,
    userId: USER,
    sandboxHost: host,
    files: fakeFiles(),
    onProblem: (what, error) => problems.push([what, error.message]),
    fetchImpl: async () => {
      round += 1;
      return streamResponse(round === 1 ? sse(toolCall('call_1', 'run_python', { code: 'print("ok")' })) : sse(content('Here is the answer.')));
    }
  });
  assert.equal(result.status, 'done');
  assert.equal(result.parts.length, 1);
  assert.equal(result.parts[0].text, 'Here is the answer.');
  assert.equal(result.artifacts.decks.size, 0);
  assert.equal(problems.length, 1);
  assert.equal(problems[0][0], 'finish_failed');
});

test('documents handed to the design system become file blocks after the answer; a block the model also wrote is dropped', async () => {
  const run = { status: 'done', steps: [{ title: '', code: '', stdout: '', stderr: '', files: [], outputs: [{ name: '.noureon/報告.docx', bytes: new TextEncoder().encode('# Title\n\nBody') }] }] };
  const out = await finishAdvancedReply({ result: { text: 'See it below.\n\n````file 報告.docx\n````\n' }, run, userId: USER, files: fakeFiles() });
  const { text } = liftSandboxRunBlock(out.text);
  assert.match(text, /^See it below\./);
  assert.match(text, /````file 報告\.docx\n# Title\n\nBody\n````$/);
  assert.equal(text.match(/file 報告\.docx/g).length, 1);
});

test('the program as it is written is told at most every 150 ms, and always before what follows it', () => {
  let clock = 0;
  const timers = [];
  const sent = [];
  const steps = createStepEvents({ send: (event) => sent.push(event), now: () => clock, setTimer: (fn, wait) => { timers.push({ fn, wait }); return timers.length; }, clearTimer: () => {} });
  steps.event({ type: 'code', text: 'a' });
  clock = 10;
  steps.event({ type: 'code', text: 'ab' });
  steps.event({ type: 'code', text: 'abc' });
  assert.deepEqual(sent.map((event) => event.text), ['a'], 'the next versions wait');
  assert.equal(timers.length, 1);
  steps.event({ type: 'step', n: 1, title: 't', code: 'abc' });
  assert.deepEqual(sent.map((event) => event.text || event.type), ['a', 'abc', 'step'], 'the latest version comes first, then the step');
});

test('a reply with Python and a briefing: the search is made first on its own, and Python\'s round is given what it found', async () => {
  const bodies = [];
  const live = [];
  let round = 0;
  const result = await executeReply({
    spec: specFor({ webSearch: 'briefing' }),
    secrets,
    userId: USER,
    sandboxHost: fakeHost([]),
    files: fakeFiles(),
    onLive: (event) => live.push(event),
    fetchImpl: async (url, options) => {
      bodies.push(JSON.parse(options.body));
      round += 1;
      return streamResponse(round === 1 ? sse(content('The price is 42 euros (source: shop.example).')) : sse(content('Answer using the briefing.')));
    }
  });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].tools, undefined, 'the search round has no tools');
  assert.match(JSON.stringify(bodies[1].messages), /Web search packet/);
  assert.match(JSON.stringify(bodies[1].messages), /The price is 42 euros/);
  assert.ok(bodies[1].tools.some((tool) => tool.function.name === 'run_python'), 'Python\'s round has its tool');
  assert.ok(live.some((event) => event.ev?.type === 'searching'));
  assert.equal(liftSandboxRunBlock(result.parts[0].text).text, 'Answer using the briefing.', 'the briefing is not part of the answer');
});

const lostHost = () => ({ configured: true, getSandbox: () => ({ prepare: async () => { throw new Error('The Python sandbox could not be reached.'); }, dispose: async () => {} }) });
const callsPython = (round) => (round === 1 ? sse(toolCall('c', 'run_python', { code: 'print(1)' })) : sse(content('Answer without Python.')));

test('the sandbox is lost for good before there is an answer, and a page is watching: the reply ends so the page can make it with its own Python', async () => {
  let round = 0;
  await assert.rejects(() => executeReply({
    spec: specFor(), secrets, userId: USER, sandboxHost: lostHost(), files: fakeFiles(), watching: () => true,
    fetchImpl: async () => { round += 1; return streamResponse(callsPython(round)); }
  }), (error) => error instanceof ReplyError && error.code === 'sandbox_unavailable');
  assert.equal(round, 1, 'the model is not asked again to answer without Python');
});

test('the same with nobody watching: the model finishes without Python, so the reply is not lost', async () => {
  let round = 0;
  const result = await executeReply({
    spec: specFor(), secrets, userId: USER, sandboxHost: lostHost(), files: fakeFiles(), watching: () => false,
    fetchImpl: async () => { round += 1; return streamResponse(callsPython(round)); }
  });
  assert.equal(liftSandboxRunBlock(result.parts[0].text).text, 'Answer without Python.');
});

test('once an answer has been written the page cannot take over without showing it twice: the model finishes without Python', async () => {
  let round = 0;
  const result = await executeReply({
    spec: specFor(), secrets, userId: USER, sandboxHost: lostHost(), files: fakeFiles(), watching: () => true,
    fetchImpl: async () => { round += 1; return streamResponse(round === 1 ? sse(content('Let me check. '), toolCall('c', 'run_python', { code: 'print(1)' })) : sse(content('Done without it.'))); }
  });
  assert.match(liftSandboxRunBlock(result.parts[0].text).text, /Let me check\..*Done without it\./s);
});

test('a stop is a stop, not a lost sandbox', async () => {
  const controller = new AbortController();
  const result = await executeReply({
    spec: specFor(), secrets, userId: USER, signal: controller.signal, files: fakeFiles(), watching: () => true,
    sandboxHost: { configured: true, getSandbox: () => ({ prepare: async () => { controller.abort(); throw new Error('stopped'); }, dispose: async () => {} }) },
    fetchImpl: async () => streamResponse(sse(content('Starting. '), toolCall('c', 'run_python', { code: 'print(1)' })))
  });
  assert.equal(result.status, 'stopped');
});
