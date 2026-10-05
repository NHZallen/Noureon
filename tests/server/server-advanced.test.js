import assert from 'node:assert/strict';
import test from 'node:test';

import { collectInputFiles, createStepEvents, finishAdvancedReply } from '../../server/advanced-reply.js';
import { executeReply, ReplyError } from '../../server/executor.js';
import { liftSandboxRunBlock } from '../../src/app/ui/sandbox/sandbox-run-block.js';
import { OFFICIAL_CLI_CATALOG, validateCliManifest } from '../../src/data/cli-catalog.js';
import { validateRunSpec } from '../../server/run-spec.js';

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

// ----- CLI tools (命令工具)

function fakeCliHost({ commandResult = { stdout: 'created\n' }, failMount = '', commandFor = null, pip = null } = {}) {
  const record = { mountedCli: null, net: null, commands: [], disposed: 0, answers: [], mountedPip: [] };
  return {
    record,
    configured: true,
    getSandbox: (options) => ({
      prepare: async () => ({}),
      clear: async () => ({}),
      mount: async () => ({}),
      mountCli: async (tools, opts = {}) => {
        if (failMount) throw new Error(failMount);
        record.mountedCli = tools;
        record.net = opts.net || null;
        return {};
      },
      command: async (line, run) => {
        record.commands.push({ line, env: run.env, files: run.files, plain: run.plain });
        // A step may be scripted (what it prints, what the proxy asks) by commandFor(line, run) -> { stdout, stderr, error, progress: [...] }.
        const outcome = { ...commandResult, ...(commandFor?.(line, run) || {}) };
        for (const message of outcome.progress || []) options.onProgress?.(message);
        if (outcome.stdout) options.onProgress?.({ stage: 'output', stream: 'stdout', text: outcome.stdout });
        return { stdout: { text: outcome.stdout || '', dropped: 0 }, stderr: { text: outcome.stderr || '', dropped: 0 }, error: outcome.error || '', elapsedMs: 80, files: outcome.files || [], skippedFiles: [] };
      },
      answerNet: async (askId, decision) => { record.answers.push([askId, decision]); return { answered: true }; },
      // The host's cache of the Python tools (`pip`: 'cached' | 'failed' | 'throws'); without it the sandbox has no such method.
      ...(pip ? {
        mountPip: async (tools) => {
          record.mountedPip.push(...tools);
          if (pip === 'throws') throw new Error('The host could not be reached.');
          return pip === 'cached' ? { cached: tools.map((tool) => tool.id), failed: [] } : { cached: [], failed: tools.map((tool) => ({ id: tool.id, reason: 'install_failed' })) };
        }
      } : {}),
      run: async () => ({ stdout: { text: '', dropped: 0 }, stderr: { text: '', dropped: 0 }, error: '', elapsedMs: 1, files: [], skippedFiles: [] }),
      dispose: async () => { record.disposed += 1; }
    })
  };
}

test('every tool of the store is a well formed manifest', () => {
  assert.ok(OFFICIAL_CLI_CATALOG.length >= 1);
  for (const tool of OFFICIAL_CLI_CATALOG) assert.deepEqual(validateCliManifest(tool), [], tool.id);
  assert.ok(validateCliManifest({ ...OFFICIAL_CLI_CATALOG[0], artifacts: { 'linux-x64': { ...OFFICIAL_CLI_CATALOG[0].artifacts['linux-x64'], url: 'https://evil.example/x' } } }).some((problem) => /url/.test(problem)), 'a host that is not allowed');
  assert.ok(validateCliManifest({ ...OFFICIAL_CLI_CATALOG[0], artifacts: { 'linux-x64': { ...OFFICIAL_CLI_CATALOG[0].artifacts['linux-x64'], sha256: 'abc' } } }).some((problem) => /sha256/.test(problem)));
});

test('a request names CLI tools of the store, for a reply with Python only', () => {
  const base = { protocol: 1, clientVersion: '17.6.0', conversationId: '123e4567-e89b-12d3-a456-426614174000', assistantMessageId: '223e4567-e89b-12d3-a456-426614174001', sequence: 0, model: { provider: 'openrouter', id: 'm', info: modelInfo }, request: { history: [], currentMessage: { parts: [{ text: 'x' }] }, systemInstruction: '', language: 'en' }, secrets: { providerKey: KEY } };
  const ok = validateRunSpec({ ...base, tools: { webSearch: 'off', advanced: true, cli: [{ id: 'officecli' }, { id: 'officecli' }] } });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.spec.tools.cli, [{ id: 'officecli', chosen: false }], 'once each');
  assert.deepEqual(validateRunSpec({ ...base, tools: { webSearch: 'off', advanced: true, cli: [{ id: 'officecli', chosen: true }, { id: 'ffmpeg' }] } }).spec.tools.cli, [{ id: 'officecli', chosen: true }, { id: 'ffmpeg', chosen: false }], 'what the person chose with @ is told apart');
  assert.equal(validateRunSpec({ ...base, tools: { webSearch: 'off', advanced: true, cli: [{ id: 'officecli', chosen: 'yes' }] } }).ok, false);
  for (const [cli, advanced, what] of [[[{ id: 'nothing-here' }], true, 'a tool that is not in the store'], [[{ id: 'officecli' }], false, 'a reply without Python'], [{}, true, 'not a list'], [Array.from({ length: 9 }, () => ({ id: 'officecli' })), true, 'too many']]) {
    const bad = validateRunSpec({ ...base, tools: { webSearch: 'off', advanced, cli } });
    assert.equal(bad.ok, false, what);
    assert.ok(bad.errors.every((error) => error.path.startsWith('tools.cli')), what);
  }
  assert.equal(validateRunSpec({ ...base, tools: { webSearch: 'off', advanced: true } }).spec.tools.cli, undefined, 'none when none were chosen');
  assert.equal(validateRunSpec({ ...base, tools: { webSearch: 'off', advanced: true, cli: [{ id: 'pandoc' }, { id: 'sox' }] } }).ok, true, 'Pandoc and SoX are usable now');
  assert.equal(validateRunSpec({ ...base, tools: { webSearch: 'off', advanced: true, cli: [{ id: 'ffmpeg' }, { id: 'officecli' }] } }).ok, true);
});

test('a reply with a CLI tool: the program is mounted, the model gets run_command and the tool\'s usage, and the command runs as a step', async () => {
  const host = fakeCliHost({ commandResult: { stdout: 'created\n', files: [{ name: 'report.docx', size: 3, bytes: new Uint8Array([1, 2, 3]) }] } });
  const files = fakeFiles();
  const events = [];
  const bodies = [];
  let round = 0;
  const result = await executeReply({
    spec: specFor({ cli: [{ id: 'officecli' }] }),
    secrets,
    userId: USER,
    sandboxHost: host,
    files,
    onLive: (event) => { if (event.ev) events.push(event.ev); },
    fetchImpl: async (url, options) => {
      bodies.push(JSON.parse(options.body));
      round += 1;
      return streamResponse(round === 1
        ? sse(toolCall('call_1', 'run_command', { title: 'Create the file', note: 'Creating it.', command: 'officecli create report.docx' }))
        : sse(content('Made report.docx.')));
    }
  });
  assert.equal(result.status, 'done');
  assert.deepEqual(host.record.mountedCli.map((tool) => [tool.id, tool.file, tool.sha256.length, tool.url.startsWith('https://github.com/')]), [['officecli', 'officecli', 64, true]]);
  assert.equal(host.record.commands[0].line, 'officecli create report.docx');
  assert.equal(host.record.commands[0].env.DOTNET_SYSTEM_GLOBALIZATION_INVARIANT, '1', 'the tool\'s environment goes with the command');
  assert.equal(host.record.disposed, 1);

  const first = bodies[0];
  assert.ok(first.tools.some((tool) => tool.function.name === 'run_command'));
  assert.ok(first.tools.some((tool) => tool.function.name === 'run_python'), 'Python stays');
  assert.match(JSON.stringify(first.messages), /CLI tools/);
  assert.match(JSON.stringify(first.messages), /officecli help/, 'the tool\'s own usage is told');

  const { run } = liftSandboxRunBlock(result.parts[0].text);
  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0].command, true, 'the step is a command, shown as shell');
  assert.equal(run.steps[0].code, 'officecli create report.docx');
  assert.deepEqual(result.parts.slice(1).map((part) => part.sandboxFile.name), ['report.docx'], 'a file the tool made is kept like any other');
  const step = events.find((event) => event.type === 'step');
  assert.equal(step.command, true, 'the page is told it is a command');
});

test('without the tool chosen the model has no run_command; programs that cannot be fetched fail the command, not the reply', async () => {
  const none = fakeCliHost();
  const bodies = [];
  await executeReply({ spec: specFor(), secrets, userId: USER, sandboxHost: none, files: fakeFiles(), onLive: () => {}, fetchImpl: async (url, options) => { bodies.push(JSON.parse(options.body)); return streamResponse(sse(content('Hello.'))); } });
  assert.equal(bodies[0].tools.some((tool) => tool.function.name === 'run_command'), false);

  const broken = fakeCliHost({ failMount: 'The program is not the one that was listed (its size or hash differs).' });
  let round = 0;
  const result = await executeReply({
    spec: specFor({ cli: [{ id: 'officecli' }] }),
    secrets,
    userId: USER,
    sandboxHost: broken,
    files: fakeFiles(),
    onLive: () => {},
    fetchImpl: async () => {
      round += 1;
      return streamResponse(round === 1 ? sse(toolCall('c1', 'run_command', { command: 'officecli create a.docx' })) : sse(content('I could not use the tool.')));
    }
  });
  assert.equal(result.status, 'done');
  assert.equal(broken.record.commands.length, 0, 'nothing is run without the program');
  const { run } = liftSandboxRunBlock(result.parts[0].text);
  assert.match(run.steps[0].error, /could not be prepared/);
  assert.match(run.steps[0].error, /hash differs/);
});

// ----- CLI tools that need the network and the person's credentials (the second stage of the store)

const callsCommand = (command) => {
  let round = 0;
  return async () => {
    round += 1;
    return streamResponse(round === 1 ? sse(toolCall('c1', 'run_command', { title: 'Run it', command })) : sse(content('Done.')));
  };
};

test('a tool that is a Python package is installed first, by the manifest\'s own command and with no credentials; the sandbox gets the rules for sites', async () => {
  const host = fakeCliHost({ commandFor: (line) => (line.startsWith('pip install') ? { stdout: '' } : { stdout: 'rows: 3\n' }) });
  const result = await executeReply({
    spec: specFor({ cli: [{ id: 'csvkit' }], net: { mode: 'always', rules: { 'example.org': 'allow', 'pypi.org': 'ask', 'bad.example': 'deny' } } }),
    secrets, userId: USER, sandboxHost: host, files: fakeFiles(), onLive: () => {}, fetchImpl: callsCommand('csvstat /input/data.csv')
  });
  assert.equal(result.status, 'done');
  assert.deepEqual(host.record.mountedCli, [], 'a pip tool has no program to bring');
  assert.equal(host.record.net.mode, 'always');
  assert.equal(host.record.net.rules['example.org'], 'allow');
  assert.equal(host.record.net.rules['bad.example'], 'deny');
  assert.equal(host.record.net.rules['pypi.org'], undefined, '"ask" takes a site that is allowed at first back out');
  assert.equal(host.record.net.rules['files.pythonhosted.org'], 'allow', 'the sites tools are made of are allowed at first');
  const [install, step] = host.record.commands;
  assert.match(install.line, /^pip install .* --target \/opt\/pip csvkit==2\.2\.0 && test -x \/opt\/pip\/bin\/csvstat$/);
  assert.equal(install.plain, true);
  assert.deepEqual(install.env, {}, 'the install gets no environment of the tool and no credential');
  assert.equal(step.line, 'csvstat /input/data.csv');
  assert.equal(liftSandboxRunBlock(result.parts[0].text).run.steps.length, 1, 'only the model\'s own step is a step of the reply');
});

test('Pandoc is mounted from its archive (the archive and the file in it go to the host), and SoX, which is in the image, brings nothing to mount', async () => {
  const host = fakeCliHost({ commandResult: { stdout: 'pandoc 3.12\n' } });
  const bodies = [];
  let round = 0;
  const result = await executeReply({
    spec: specFor({ cli: [{ id: 'pandoc', chosen: true }, { id: 'sox', chosen: true }] }),
    secrets, userId: USER, sandboxHost: host, files: fakeFiles(), onLive: () => {},
    fetchImpl: async (url, options) => {
      bodies.push(JSON.parse(options.body));
      round += 1;
      return streamResponse(round === 1 ? sse(toolCall('c1', 'run_command', { title: 'Convert', command: 'pandoc --version' })) : sse(content('Done.')));
    }
  });
  assert.equal(result.status, 'done');
  assert.equal(host.record.mountedCli.length, 1, 'only Pandoc has a program to bring');
  const [pandoc] = host.record.mountedCli;
  assert.deepEqual([pandoc.id, pandoc.file, pandoc.sha256, pandoc.size], ['pandoc', 'pandoc', '67d7d011fed8c8543306022b985b9b2499ab9b74818df91d8727c7e9ebc5ba06', 35326100]);
  assert.deepEqual({ ...pandoc.archive }, { format: 'tar.gz', member: 'pandoc-3.12/bin/pandoc', size: 165299760 });
  const told = JSON.stringify(bodies[0].messages);
  assert.match(told, /pandoc \/input\/in\.docx/, 'the usage of Pandoc is told');
  assert.match(told, /sox \/input\/in\.wav/, 'and the usage of SoX');
  assert.match(told, /### SoX \(`sox`, version 14\.4\.2\)/, 'SoX is named by its command');
});

test('a sandbox with CLI tools has the sites allowed at first even when the page sent no rules', async () => {
  const host = fakeCliHost();
  await executeReply({ spec: specFor({ cli: [{ id: 'officecli' }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(), onLive: () => {}, fetchImpl: callsCommand('officecli --version') });
  assert.equal(host.record.net.mode, 'new');
  assert.equal(host.record.net.rules['github.com'], 'allow');
});

test('the person\'s credentials go into the environment of the commands, never into what the model reads, and what a command prints is scrubbed of them', async () => {
  const TOKEN = 'auth_token_value_1234567890';
  const CT0 = 'ct0_value_abcdefghij';
  const host = fakeCliHost({ commandFor: (line) => (line.startsWith('pip install') ? {} : { stdout: `token is ${TOKEN} and ct0 ${CT0}\n`, stderr: `oops ${TOKEN}`, error: `failed with ${CT0}` }) });
  const bodies = [];
  const live = [];
  let round = 0;
  const result = await executeReply({
    spec: specFor({ cli: [{ id: 'twitter-cli' }] }),
    secrets, userId: USER, sandboxHost: host, files: fakeFiles(),
    credentials: { values: async (userId, names) => { assert.equal(userId, USER); assert.deepEqual(names.sort(), ['TWITTER_AUTH_TOKEN', 'TWITTER_CT0']); return { TWITTER_AUTH_TOKEN: TOKEN, TWITTER_CT0: CT0 }; } },
    onLive: (event) => { if (event.ev) live.push(event.ev); },
    fetchImpl: async (url, options) => {
      bodies.push(options.body);
      round += 1;
      return streamResponse(round === 1 ? sse(toolCall('c1', 'run_command', { title: 'Look', command: 'twitter feed' })) : sse(content('Done.')));
    }
  });
  const step = host.record.commands.find((command) => command.line === 'twitter feed');
  assert.equal(step.env.TWITTER_AUTH_TOKEN, TOKEN);
  assert.equal(step.env.TWITTER_CT0, CT0);
  const everything = JSON.stringify(bodies) + JSON.stringify(result.parts) + JSON.stringify(live);
  assert.equal(everything.includes(TOKEN), false, 'a credential is nowhere the model, the page or the saved message could read it');
  assert.equal(everything.includes(CT0), false);
  assert.match(everything, /token is ••••/);
  assert.equal(host.record.commands[0].env.TWITTER_AUTH_TOKEN, undefined, 'not into the install');
});

test('a login file a tool needs is made from the credential for the command only', async () => {
  const host = fakeCliHost({ commandFor: (line) => (line.startsWith('pip install') ? {} : { stdout: 'ok\n' }) });
  await executeReply({
    spec: specFor({ cli: [{ id: 'rdt-cli' }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(),
    credentials: { values: async () => ({ REDDIT_SESSION: 'reddit_session_value_xyz' }) },
    onLive: () => {}, fetchImpl: callsCommand('rdt popular --json')
  });
  const step = host.record.commands.find((command) => command.line.startsWith('rdt'));
  assert.equal(step.files.length, 1);
  assert.equal(step.files[0].path, '.config/rdt-cli/credential.json');
  assert.equal(JSON.parse(step.files[0].content).cookies.reddit_session, 'reddit_session_value_xyz');
  assert.deepEqual(host.record.commands[0].files, [], 'none for the install');
});

test('a credential the person has not set is told to the model as missing, with where to add it, and the tool is not given an empty one', async () => {
  const host = fakeCliHost({ commandFor: (line) => (line.startsWith('pip install') ? {} : { stdout: 'not logged in\n' }) });
  const bodies = [];
  let round = 0;
  await executeReply({
    spec: specFor({ cli: [{ id: 'twitter-cli' }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(),
    credentials: { values: async () => ({ TWITTER_CT0: 'only_this_one_value' }) },
    onLive: () => {},
    fetchImpl: async (url, options) => { bodies.push(options.body); round += 1; return streamResponse(round === 1 ? sse(toolCall('c1', 'run_command', { command: 'twitter feed' })) : sse(content('Please add it.'))); }
  });
  assert.match(bodies[0], /Not set yet: TWITTER_AUTH_TOKEN/);
  assert.match(bodies[0], /call request_credentials with tool \\"twitter-cli\\"/, 'a tool the model uses by itself may be asked for through the window');
  assert.equal(host.record.commands.find((command) => command.line === 'twitter feed').env.TWITTER_AUTH_TOKEN, undefined);
});

const SAVED = { TWITTER_AUTH_TOKEN: 'tok_value_123456', TWITTER_CT0: 'ct0_value_123456' };

// The person is asked in a window: `answer` says what they do ('saved' puts the values in the store first, as the page does through /v1/credentials).
function askingSetup({ answer, waitMs } = {}) {
  const events = [];
  const state = { stored: {} };
  const credentialControl = { answer: null };
  return {
    events,
    state,
    credentialControl,
    options: {
      credentials: { values: async () => state.stored },
      credentialControl,
      ...(waitMs ? { credentialWaitMs: waitMs } : {}),
      onLive: ({ ev }) => {
        if (ev?.type !== 'credential') return;
        events.push(ev);
        if (ev.event === 'ask' && answer) {
          if (answer === 'saved') state.stored = SAVED;
          assert.deepEqual(credentialControl.answer(ev.id, answer), { answered: true });
        }
      }
    }
  };
}

test('a tool chosen with "@" whose login is missing asks the person before the model starts, and goes on with what they saved', async () => {
  const host = fakeCliHost({ commandFor: (line) => (line.startsWith('pip install') ? {} : { stdout: 'timeline\n' }) });
  const setup = askingSetup({ answer: 'saved' });
  const bodies = [];
  let round = 0;
  const result = await executeReply({
    spec: specFor({ cli: [{ id: 'twitter-cli', chosen: true }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(), ...setup.options,
    fetchImpl: async (url, options) => { bodies.push(options.body); round += 1; return streamResponse(round === 1 ? sse(toolCall('c1', 'run_command', { command: 'twitter feed' })) : sse(content('Here it is.'))); }
  });
  assert.equal(result.status, 'done');
  assert.deepEqual(setup.events.map((event) => event.event), ['ask', 'answer']);
  assert.equal(setup.events[0].tool.id, 'twitter-cli');
  assert.deepEqual(setup.events[0].fields.map((field) => [field.env, field.type, field.label, field.site]), [['TWITTER_AUTH_TOKEN', 'token', 'auth_token', 'x.com'], ['TWITTER_CT0', 'cookie', 'ct0', 'x.com']]);
  assert.equal(setup.events[1].decision, 'saved');
  assert.doesNotMatch(bodies[0], /Not set yet/, 'what was saved is in place before the model is told about the tool');
  const command = host.record.commands.find((entry) => entry.line === 'twitter feed');
  assert.equal(command.env.TWITTER_AUTH_TOKEN, SAVED.TWITTER_AUTH_TOKEN);
  assert.equal(command.env.TWITTER_CT0, SAVED.TWITTER_CT0);
  assert.ok(!JSON.stringify(setup.events).includes(SAVED.TWITTER_AUTH_TOKEN), 'no value is ever in an event');
});

test('a person who does not answer in time, or says not now, leaves the tool without its login and the model is told so', async () => {
  for (const [answer, decision] of [[null, 'timeout'], ['cancel', 'cancel']]) {
    const host = fakeCliHost();
    const setup = askingSetup({ answer, waitMs: 20 });
    const bodies = [];
    const result = await executeReply({
      spec: specFor({ cli: [{ id: 'twitter-cli', chosen: true }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(), ...setup.options,
      fetchImpl: async (url, options) => { bodies.push(options.body); return streamResponse(sse(content('I could not log in.'))); }
    });
    assert.equal(result.status, 'done');
    assert.equal(setup.events.at(-1).decision, decision);
    assert.match(bodies[0], /Not set yet: TWITTER_AUTH_TOKEN, TWITTER_CT0/);
    assert.match(bodies[0], /did not provide it/);
    assert.equal(setup.credentialControl.answer('11111111-2222', 'saved').answered, false, 'a question that is over cannot be answered');
  }
});

test('a tool the model uses by itself: it asks for the login with request_credentials, waits for the window, and goes on', async () => {
  const host = fakeCliHost({ commandFor: (line) => (line.startsWith('pip install') ? {} : { stdout: 'timeline\n' }) });
  const setup = askingSetup({ answer: 'saved' });
  const bodies = [];
  let round = 0;
  await executeReply({
    spec: specFor({ cli: [{ id: 'twitter-cli' }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(), ...setup.options,
    fetchImpl: async (url, options) => {
      bodies.push(options.body);
      round += 1;
      if (round === 1) return streamResponse(sse(toolCall('c1', 'request_credentials', { tool: 'twitter-cli' })));
      if (round === 2) return streamResponse(sse(toolCall('c2', 'run_command', { command: 'twitter feed' })));
      return streamResponse(sse(content('Done.')));
    }
  });
  assert.match(bodies[0], /"request_credentials"/, 'offered to the model');
  assert.deepEqual(setup.events.map((event) => event.event), ['ask', 'answer']);
  assert.match(bodies[1], /The user provided the login for twitter-cli/);
  assert.equal(host.record.commands.find((entry) => entry.line === 'twitter feed').env.TWITTER_CT0, SAVED.TWITTER_CT0);
});

test('request_credentials is not offered when nothing the model may use by itself is missing a login', async () => {
  const host = fakeCliHost();
  const bodies = [];
  await executeReply({
    spec: specFor({ cli: [{ id: 'twitter-cli' }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(),
    credentials: { values: async () => SAVED }, credentialControl: { answer: null }, onLive: () => {},
    fetchImpl: async (url, options) => { bodies.push(options.body); return streamResponse(sse(content('Hi.'))); }
  });
  assert.doesNotMatch(bodies[0], /request_credentials/);
});

test('a credential store that fails does not end the reply: the tool is told its credentials are not set', async () => {
  const host = fakeCliHost();
  const problems = [];
  const result = await executeReply({
    spec: specFor({ cli: [{ id: 'twitter-cli' }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(),
    credentials: { values: async () => { throw new Error('database down'); } },
    onProblem: (what) => problems.push(what), onLive: () => {}, fetchImpl: callsCommand('twitter feed')
  });
  assert.equal(result.status, 'done');
  assert.deepEqual(problems, ['credentials_failed']);
});

test('a tool that could not be installed is told with the result of the next command, and the others go on', async () => {
  const host = fakeCliHost({ commandFor: (line) => (line.startsWith('pip install') ? { stderr: 'ERROR: No matching distribution\n', error: 'The command exited with code 1.' } : { stdout: 'x\n' }) });
  const bodies = [];
  let round = 0;
  const result = await executeReply({
    spec: specFor({ cli: [{ id: 'csvkit' }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(), onLive: () => {},
    fetchImpl: async (url, options) => { bodies.push(options.body); round += 1; return streamResponse(round === 1 ? sse(toolCall('c1', 'run_command', { command: 'csvstat a.csv' })) : sse(content('It is not installed.'))); }
  });
  assert.equal(result.status, 'done');
  assert.match(bodies[1], /csvkit could not be installed \(ERROR: No matching distribution\)/);
});

test('what the proxy asks the person goes to the page as an event, and the person\'s answer reaches the sandbox that asked', async () => {
  const ask = { stage: 'net', event: 'ask', id: 'ask000000000001', host: 'x.com', port: 443, waitMs: 600000 };
  const host = fakeCliHost({ commandFor: (line) => (line.startsWith('pip install') ? {} : { stdout: 'ok\n', progress: [ask, { stage: 'net', event: 'answer', id: ask.id, decision: 'once' }] }) });
  const events = [];
  const netControl = { answer: null };
  await executeReply({
    spec: specFor({ cli: [{ id: 'twitter-cli' }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(), netControl,
    credentials: { values: async () => ({}) },
    onLive: (event) => { if (event.ev) events.push(event.ev); }, fetchImpl: callsCommand('twitter feed')
  });
  const heard = events.filter((event) => event.type === 'net');
  assert.deepEqual(heard.map((event) => [event.event, event.id, event.host, event.port, event.decision]), [['ask', ask.id, 'x.com', 443, ''], ['answer', ask.id, '', 0, 'once']]);
  assert.equal(typeof netControl.answer, 'function', 'the run manager has the way to answer');
  assert.deepEqual(await netControl.answer(ask.id, 'always'), { answered: true });
  assert.deepEqual(host.record.answers, [[ask.id, 'always']]);
});

test('what the person chose with "@" is told to the model as chosen, what it may use by itself as not chosen, with the rule to leave it alone for ordinary requests', async () => {
  const bodies = [];
  const run = async (cli) => {
    bodies.length = 0;
    await executeReply({
      spec: specFor({ cli }), secrets, userId: USER, sandboxHost: fakeCliHost(), files: fakeFiles(), onLive: () => {},
      fetchImpl: async (url, options) => { bodies.push(options.body); return streamResponse(sse(content('Hello.'))); }
    });
    return bodies[0];
  };
  const chosen = await run([{ id: 'officecli', chosen: true }]);
  assert.match(chosen, /The user chose this CLI tool for this message with \\"@\\": OfficeCLI/);
  assert.doesNotMatch(chosen, /did NOT choose/);
  const own = await run([{ id: 'ffmpeg', chosen: false }, { id: 'yt-dlp', chosen: false }]);
  assert.match(own, /did NOT choose any for this message: FFmpeg, yt-dlp/);
  assert.match(own, /use no CLI tool and do not call run_command/);
  assert.doesNotMatch(own, /The user chose/, 'the words that pushed the model to use every tool are gone');
  const mixed = await run([{ id: 'officecli', chosen: true }, { id: 'ffmpeg', chosen: false }]);
  assert.match(mixed, /Also available, but NOT chosen for this message: FFmpeg/);
});

test('a Python tool is installed when a command first uses it, once, and not for a reply that only has it among its tools', async () => {
  const host = fakeCliHost({ commandFor: (line) => (line.startsWith('pip install') ? {} : { stdout: 'ok\n' }) });
  let round = 0;
  await executeReply({
    spec: specFor({ cli: [{ id: 'csvkit', chosen: false }, { id: 'twitter-cli', chosen: false }, { id: 'ffmpeg', chosen: false }] }),
    secrets, userId: USER, sandboxHost: host, files: fakeFiles(), credentials: { values: async () => ({}) }, onLive: () => {},
    fetchImpl: async () => {
      round += 1;
      if (round === 1) return streamResponse(sse(toolCall('c1', 'run_command', { command: 'ffmpeg -version' })));
      if (round === 2) return streamResponse(sse(toolCall('c2', 'run_command', { command: 'cd /output && csvcut -n /input/a.csv | head' })));
      if (round === 3) return streamResponse(sse(toolCall('c3', 'run_command', { command: 'csvstat /input/a.csv' })));
      return streamResponse(sse(content('Done.')));
    }
  });
  const lines = host.record.commands.map((command) => command.line);
  assert.equal(lines.filter((line) => line.startsWith('pip install')).length, 1, 'csvkit once; twitter-cli never');
  assert.match(lines.find((line) => line.startsWith('pip install')), /csvkit==/);
  assert.deepEqual(lines.map((line) => line.split(' ')[0]), ['ffmpeg', 'pip', 'cd', 'csvstat'], 'installed right before the first command that uses it');
});

test('the time spent waiting for the person to enter a login is not counted: the reply\'s clock is set back, pages are told, the time limit is given back', async () => {
  const host = fakeCliHost({ commandFor: (line) => (line.startsWith('pip install') ? {} : { stdout: 'timeline\n' }) });
  let clock = 1_000_000;
  const setup = askingSetup({ answer: 'saved' });
  const live = [];
  const paused = [];
  const originalOnLive = setup.options.onLive;
  setup.options.onLive = (event) => {
    live.push(event);
    // The person takes a minute and a half to type: the clock of the server moves while the reply waits.
    if (event.ev?.type === 'credential' && event.ev.event === 'ask') clock += 90_000;
    originalOnLive(event);
  };
  let round = 0;
  const result = await executeReply({
    spec: specFor({ cli: [{ id: 'twitter-cli', chosen: true }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(), ...setup.options,
    now: () => clock,
    onPaused: (ms) => paused.push(ms),
    fetchImpl: async () => { round += 1; return streamResponse(round === 1 ? sse(toolCall('c1', 'run_command', { command: 'twitter feed' })) : sse(content('Here it is.'))); }
  });
  assert.deepEqual(paused, [90_000]);
  const set = live.filter((event) => typeof event.tm === 'number');
  assert.deepEqual(set.map((event) => event.tm), [0], 'the reply had gone on for no time when it began waiting, and still has not');
  assert.ok(live.indexOf(set[0]) < live.findIndex((event) => event.ev?.event === 'answer'), 'pages hear the new clock before the answer');
  assert.equal(result.run.elapsedMs, 0, 'the record of the reply leaves the wait out too');
});


test('a Python tool comes from the host\'s cache of it: asked for once, with the package and version of the store, and no install runs in the sandbox', async () => {
  const host = fakeCliHost({ pip: 'cached', commandFor: (line) => ({ stdout: line.startsWith('pip install') ? '' : 'timeline\n' }) });
  let round = 0;
  await executeReply({
    spec: specFor({ cli: [{ id: 'twitter-cli', chosen: true }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(),
    credentials: { values: async () => ({ TWITTER_AUTH_TOKEN: 'tok_value_123456', TWITTER_CT0: 'ct0_value_123456' }) }, onLive: () => {},
    fetchImpl: async () => { round += 1; return streamResponse(round <= 2 ? sse(toolCall(`c${round}`, 'run_command', { command: 'twitter feed' })) : sse(content('Done.'))); }
  });
  assert.deepEqual(host.record.mountedPip, [{ id: 'twitter-cli', pip: { package: 'twitter-cli', version: '0.8.5', command: 'twitter', commands: ['twitter'] } }], 'once for two commands');
  assert.equal(host.record.commands.some((command) => command.line.startsWith('pip install')), false, 'nothing is installed inside the sandbox');
  assert.equal(host.record.commands.filter((command) => command.line === 'twitter feed').length, 2);
});

test('a Python tool the host cannot give (no wheel, the host unreachable) is installed inside the sandbox as before, and the reply goes on', async () => {
  for (const pip of ['failed', 'throws']) {
    const host = fakeCliHost({ pip, commandFor: (line) => ({ stdout: line.startsWith('pip install') ? '' : 'timeline\n' }) });
    let round = 0;
    const result = await executeReply({
      spec: specFor({ cli: [{ id: 'twitter-cli', chosen: true }] }), secrets, userId: USER, sandboxHost: host, files: fakeFiles(),
      credentials: { values: async () => ({ TWITTER_AUTH_TOKEN: 'tok_value_123456', TWITTER_CT0: 'ct0_value_123456' }) }, onLive: () => {},
      fetchImpl: async () => { round += 1; return streamResponse(round === 1 ? sse(toolCall('c1', 'run_command', { command: 'twitter feed' })) : sse(content('Done.'))); }
    });
    assert.equal(result.status, 'done', pip);
    assert.equal(host.record.mountedPip.length, 1, pip);
    assert.equal(host.record.commands.filter((command) => command.line.startsWith('pip install')).length, 1, `${pip}: the old way`);
  }
});
