import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createSandboxHost, SandboxHostError } from '../../server/sandbox-client.js';

const TOKEN = 'a'.repeat(40);
const ID = 'abcdef0123456789abcdef01';

// A runner as the sandbox host's HTTP interface describes it (sandbox-host/runner/http.js), with scripted answers.
async function fakeRunner(script = {}) {
  const calls = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) : {};
    const path = new URL(request.url, 'http://x').pathname;
    calls.push({ method: request.method, path, body, auth: request.headers.authorization });
    const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (path === '/healthz') return json(200, { ok: true });
    if (request.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { error: { code: 'unauthorized', message: 'Not allowed.' } });
    if (request.method === 'POST' && path === '/v1/sessions') {
      if (script.busyTimes > 0) { script.busyTimes -= 1; return json(429, { error: { code: 'busy', message: 'All sandboxes are in use.' } }); }
      return json(201, { id: ID });
    }
    if (request.method === 'POST' && path.endsWith('/mount')) return json(200, { mounted: body.files.map((file) => ({ name: file.name })) });
    if (request.method === 'POST' && path.endsWith('/clear')) return json(200, {});
    if (request.method === 'POST' && path.endsWith('/stop')) { script.stopped?.(); return json(200, { stopped: true }); }
    if (request.method === 'DELETE') return json(200, {});
    if (request.method === 'POST' && path.endsWith('/run')) {
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      await script.run?.({ body, write: (line) => response.write(`${JSON.stringify(line)}\n`), end: () => response.end(), response });
      return undefined;
    }
    return json(404, {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => { server.closeAllConnections(); server.close(); } };
}

test('a step: files go over as base64, the output is told as it runs, and the result is the browser sandbox\'s', async (t) => {
  const runner = await fakeRunner({
    run: ({ write, end }) => {
      write({ type: 'progress', stage: 'output', stream: 'stdout', text: 'working\n' });
      write({ type: 'result', stdout: { text: 'working\n', dropped: 0 }, stderr: { text: '', dropped: 0 }, error: null, elapsedMs: 42, files: [{ name: 'a.txt', size: 2, data: Buffer.from('hi').toString('base64') }], skippedFiles: [{ name: 'x.exe', reason: 'blocked-type' }] });
      end();
    }
  });
  t.after(runner.close);
  const host = createSandboxHost({ url: runner.url, token: TOKEN });
  const heard = [];
  const sandbox = host.getSandbox({ onProgress: (message) => heard.push(message) });
  await sandbox.prepare();
  await sandbox.clear();
  await sandbox.mount([{ name: 'in.csv', type: 'text/csv', bytes: Promise.resolve(new Uint8Array([97, 44, 98])) }]);
  const result = await sandbox.run('print("working")', { timeoutMs: 5000 });
  await sandbox.dispose();

  const mount = runner.calls.find((call) => call.path.endsWith('/mount'));
  assert.deepEqual(mount.body.files, [{ name: 'in.csv', type: 'text/csv', data: Buffer.from('a,b').toString('base64') }]);
  assert.deepEqual(heard, [{ type: 'progress', stage: 'output', stream: 'stdout', text: 'working\n' }]);
  assert.equal(result.stdout.text, 'working\n');
  assert.equal(result.elapsedMs, 42);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].name, 'a.txt');
  assert.deepEqual([...result.files[0].bytes], [104, 105], 'bytes, not base64');
  assert.deepEqual(result.skippedFiles, [{ name: 'x.exe', reason: 'blocked-type' }]);
  assert.equal(runner.calls.at(-1).method, 'DELETE', 'the container is removed at the end');
  assert.equal(runner.calls.every((call) => call.path === '/healthz' || call.auth === `Bearer ${TOKEN}`), true);
});

test('a stop ends the step and says so; the runner is told to stop', async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const runner = await fakeRunner({
    run: async ({ write, end }) => { await gate; write({ type: 'result', stopped: true, error: null, stdout: { text: '', dropped: 0 }, stderr: { text: '', dropped: 0 }, files: [], skippedFiles: [], restarted: true }); end(); },
    stopped: () => release()
  });
  t.after(runner.close);
  const sandbox = createSandboxHost({ url: runner.url, token: TOKEN }).getSandbox();
  await sandbox.prepare();
  const controller = new AbortController();
  const running = sandbox.run('while True: pass', { signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  assert.deepEqual(await running, { stopped: true });
  assert.ok(runner.calls.some((call) => call.path.endsWith('/stop')));
  assert.deepEqual(await sandbox.run('print(1)', { signal: controller.signal }), { stopped: true }, 'nothing runs after a stop');
});

test('a step that fails to run, or a runner that answers nothing, is a failure the reply can fall back from', async (t) => {
  const runner = await fakeRunner({ run: ({ write, end }) => { write({ type: 'failure', code: 'start_failed', message: 'The sandbox stopped while starting (1).' }); end(); } });
  t.after(runner.close);
  const sandbox = createSandboxHost({ url: runner.url, token: TOKEN }).getSandbox();
  await sandbox.prepare();
  await assert.rejects(() => sandbox.run('print(1)'), (error) => error instanceof SandboxHostError && error.code === 'start_failed');

  const silent = await fakeRunner({ run: ({ end }) => end() });
  t.after(silent.close);
  const quiet = createSandboxHost({ url: silent.url, token: TOKEN, wait: async () => {} }).getSandbox();
  await quiet.prepare();
  await assert.rejects(() => quiet.run('print(1)'), (error) => error instanceof SandboxHostError && error.code === 'sandbox-unreachable');
});

test('when every sandbox of the host is in use, the reply waits for one', async (t) => {
  const runner = await fakeRunner({ busyTimes: 2 });
  t.after(runner.close);
  const waits = [];
  const heard = [];
  const host = createSandboxHost({ url: runner.url, token: TOKEN, wait: async (ms) => { waits.push(ms); } });
  const sandbox = host.getSandbox({ onProgress: (message) => heard.push(message.stage) });
  await sandbox.prepare();
  assert.equal(waits.length, 2);
  assert.deepEqual(heard, ['runtime', 'runtime'], 'the page is told it is preparing');
  assert.equal(runner.calls.filter((call) => call.path === '/v1/sessions').length, 3);

  const full = await fakeRunner({ busyTimes: 1000 });
  t.after(full.close);
  let clock = 0;
  const giveUp = createSandboxHost({ url: full.url, token: TOKEN, wait: async () => { clock += 100_000; }, now: () => clock });
  await assert.rejects(() => giveUp.getSandbox().prepare(), (error) => error.status === 429, 'after five minutes it gives up');
});

test('check: reachable and accepted, a wrong secret, an unreachable host, and nothing set', async (t) => {
  const runner = await fakeRunner();
  t.after(runner.close);
  assert.deepEqual(await createSandboxHost({ url: runner.url, token: TOKEN }).check(), { ok: true, reason: '' });
  assert.deepEqual(await createSandboxHost({ url: runner.url, token: 'b'.repeat(40) }).check(), { ok: false, reason: 'refused' });
  assert.deepEqual(await createSandboxHost({ url: 'http://127.0.0.1:1', token: TOKEN }).check(), { ok: false, reason: 'unreachable' });
  const none = createSandboxHost({});
  assert.equal(none.configured, false);
  assert.deepEqual(await none.check(), { ok: false, reason: 'not_configured' });
});

test('the secret is not in what an error says', async (t) => {
  const runner = await fakeRunner();
  t.after(runner.close);
  const wrong = createSandboxHost({ url: runner.url, token: `${TOKEN}-wrong` }).getSandbox();
  await assert.rejects(() => wrong.prepare(), (error) => !JSON.stringify({ message: error.message, stage: error.stage }).includes(TOKEN));
});

test('ready: a host that works is remembered for a while, one that does not is asked again sooner, and a busy host is a working one', async (t) => {
  const runner = await fakeRunner();
  t.after(runner.close);
  let clock = 0;
  const host = createSandboxHost({ url: runner.url, token: TOKEN, now: () => clock });
  const asked = () => runner.calls.filter((call) => call.method === 'POST' && call.path === '/v1/sessions').length;
  const [first, second] = await Promise.all([host.ready(), host.ready()]);
  assert.deepEqual([first.ok, second.ok], [true, true]);
  assert.equal(asked(), 1, 'asked at the same time, asked once');
  clock = 20_000;
  await host.ready();
  assert.equal(asked(), 1, 'remembered for 30 seconds');
  clock = 31_000;
  await host.ready();
  assert.equal(asked(), 2);

  const down = createSandboxHost({ url: 'http://127.0.0.1:1', token: TOKEN, now: () => clock });
  assert.equal((await down.ready()).ok, false);
  clock += 5000;
  const again = await down.ready();
  assert.equal(again.ok, false, 'still down');
  clock += 6000;
  assert.equal((await down.ready()).ok, false, 'asked again after 10 seconds');

  const busy = await fakeRunner({ busyTimes: 1 });
  t.after(busy.close);
  assert.deepEqual(await createSandboxHost({ url: busy.url, token: TOKEN }).check(), { ok: true, reason: 'busy' });
});

test('a host lost while a step runs: it is waited for, a new sandbox gets the same files, and the step is run again (told as restarted)', async (t) => {
  let runs = 0;
  const runner = await fakeRunner({
    run: ({ write, end, response }) => {
      runs += 1;
      if (runs === 1) { response.destroy(); return; }
      write({ type: 'result', stdout: { text: 'second try\n', dropped: 0 }, stderr: { text: '', dropped: 0 }, error: null, elapsedMs: 3, files: [], skippedFiles: [] });
      end();
    }
  });
  t.after(runner.close);
  const waits = [];
  const sandbox = createSandboxHost({ url: runner.url, token: TOKEN, wait: async (ms) => { waits.push(ms); } }).getSandbox();
  await sandbox.prepare();
  await sandbox.mount([{ name: 'in.txt', type: 'text/plain', bytes: new TextEncoder().encode('hi') }]);
  const result = await sandbox.run('print("second try")');
  assert.equal(result.stdout.text, 'second try\n');
  assert.equal(result.restarted, true, 'the model is told the variables of earlier steps are gone');
  assert.equal(waits.length, 1);
  const sessions = runner.calls.filter((call) => call.method === 'POST' && call.path === '/v1/sessions').length;
  assert.equal(sessions, 2, 'a new sandbox');
  const mounts = runner.calls.filter((call) => call.path.endsWith('/mount'));
  assert.equal(mounts.length, 2);
  assert.deepEqual(mounts[1].body.files, mounts[0].body.files, 'with the same files');
});

test('a host that does not come back: after the tries the step fails (the reply goes on without Python)', async (t) => {
  const runner = await fakeRunner({ run: ({ response }) => { response.destroy(); } });
  t.after(runner.close);
  const sandbox = createSandboxHost({ url: runner.url, token: TOKEN, wait: async () => {} }).getSandbox();
  await sandbox.prepare();
  await assert.rejects(() => sandbox.run('print(1)'), (error) => error.code === 'sandbox-unreachable');
  assert.equal(runner.calls.filter((call) => call.path.endsWith('/run')).length, 3);
});

test('a stop is not mistaken for a lost host', async (t) => {
  const runner = await fakeRunner({ run: ({ response }) => { response.destroy(); } });
  t.after(runner.close);
  const controller = new AbortController();
  const sandbox = createSandboxHost({ url: runner.url, token: TOKEN, wait: async () => {} }).getSandbox();
  await sandbox.prepare();
  controller.abort();
  assert.deepEqual(await sandbox.run('print(1)', { signal: controller.signal }), { stopped: true });
  assert.equal(runner.calls.filter((call) => call.path.endsWith('/run')).length, 0);
});
