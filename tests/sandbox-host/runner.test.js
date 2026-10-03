import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadConfig } from '../../sandbox-host/runner/config.js';
import { containerName, dockerRunArgs } from '../../sandbox-host/runner/docker-args.js';
import { addressAllowed, createHandler } from '../../sandbox-host/runner/http.js';
import { RunnerError, createSessionManager, safeFileName } from '../../sandbox-host/runner/session.js';

// These start the container program (repl.py) as an ordinary process, so they need Python 3.
const sandboxTest = spawnSync('python3', ['--version']).status === 0 ? test : test.skip;
const SECRET = 'a'.repeat(40);
const fakeDocker = join(process.cwd(), 'tests', 'sandbox-host', 'fake-docker.mjs');

function harness(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'noureon-runner-'));
  const state = join(root, 'state');
  process.env.FAKE_DOCKER_STATE = state;
  const config = loadConfig({ RUNNER_TOKEN: SECRET, DOCKER_BIN: fakeDocker, SANDBOX_DATA_DIR: join(root, 'data'), RUNNER_ALLOW: '127.0.0.1/32', SANDBOX_KILL_GRACE_MS: '1500', ...overrides });
  const clock = { time: 1_000_000 };
  const manager = createSessionManager({ config, now: () => clock.time });
  return {
    root, state, config, manager, clock,
    done: async () => {
      await manager.shutdown();
      await new Promise((resolve) => setTimeout(resolve, 700));
      // A program of a sandbox that was not ended (a test that failed half way, a machine too busy to keep the times) must not outlive the test:
      // it would keep the pipes of the test run open for ever.
      for (const name of existsSync(state) ? readdirSync(state).filter((entry) => entry.endsWith('.pid')) : []) {
        try {
          process.kill(Number(readFileSync(join(state, name), 'utf8')), 'SIGKILL');
        } catch {
          // Gone already.
        }
      }
      rmSync(root, { recursive: true, force: true });
    }
  };
}
const b64 = (text) => Buffer.from(text).toString('base64');

test('the settings need a real secret and have safe defaults: only the machine itself and its pods may ask', () => {
  assert.throws(() => loadConfig({}), /at least 32 characters/);
  assert.throws(() => loadConfig({ RUNNER_TOKEN: 'short' }), /at least 32 characters/);
  const config = loadConfig({ RUNNER_TOKEN: SECRET });
  assert.equal(config.host, '127.0.0.1');
  assert.deepEqual([...config.allow], ['10.42.0.0/16', '127.0.0.1/32']);
  assert.equal(config.maxSessions, 2);
});

test('a container is started one way: no network, no rights, limited, with only its folders; nothing of a request can change that', () => {
  const config = loadConfig({ RUNNER_TOKEN: SECRET });
  const args = dockerRunArgs({ config, sessionId: 'a1b2c3d4e5f6a1b2c3d4e5f6', dirs: { input: '/data/x/input', output: '/data/x/output' }, language: 'zh-TW; rm -rf /' });
  const joined = args.join(' ');
  for (const wanted of ['--network none', '--read-only', '--cap-drop ALL', '--security-opt no-new-privileges', '--pids-limit 256', '--memory 2g', '--memory-swap 2g', '--cpus 2', '--user 65534:65534', '-v /data/x/input:/input:ro', '-v /data/x/output:/output:rw']) {
    assert.ok(joined.includes(wanted), wanted);
  }
  assert.equal(args.at(-1), 'noureon-sandbox:1', 'the image is the runner\'s');
  assert.equal(args.includes('--privileged'), false);
  assert.equal(args.filter((arg) => arg === '-v').length, 2, 'nothing else is mounted');
  assert.ok(args.some((arg) => arg === 'LANGUAGE=zh-TWrm-rf'), 'a language is only letters and dashes');
  assert.equal(containerName('a1b2c3d4e5f6a1b2c3d4e5f6'), 'nsb-a1b2c3d4e5f6a1b2c3d4e5f6');
  assert.throws(() => containerName('../../etc'), /Not a session id/);
});

test('files from a person keep a plain name inside /input', () => {
  assert.equal(safeFileName('../../etc/passwd'), 'passwd');
  assert.equal(safeFileName('a:b?c.txt'), 'a_b_c.txt');
  assert.equal(safeFileName('.hidden'), 'hidden');
  assert.equal(safeFileName('x.csv', new Set(['x.csv'])), 'x (2).csv');
  assert.equal(safeFileName(''), 'file');
});

sandboxTest('a step runs in a container: its words, its files, and variables that stay for the next step', async () => {
  const { manager, done } = harness();
  try {
    const { id } = await manager.create({ language: 'en' });
    const mounted = await manager.mount(id, [{ name: 'data.csv', data: b64('a,b\n1,2\n') }, { name: '../evil.txt', data: b64('x') }]);
    assert.deepEqual(mounted.mounted.map((file) => file.name), ['data.csv', 'evil.txt']);
    const progress = [];
    const first = await manager.run(id, { code: [
      'import os',
      'rows = open(os.path.join(os.environ["NOUREON_INPUT"], "data.csv")).read().split()',
      'total = 40',
      'open(os.path.join(os.environ["NOUREON_OUTPUT"], "report.txt"), "w").write("rows: %d" % len(rows))',
      'print("hello", len(rows))'
    ].join('\n') }, (message) => progress.push(message));
    assert.equal(first.error, null);
    assert.equal(first.stdout.text, 'hello 2\n');
    assert.ok(progress.some((message) => message.stage === 'output' && message.text.includes('hello')), 'what it prints is sent as it goes');
    assert.deepEqual(first.files.map((file) => [file.name, Buffer.from(file.data, 'base64').toString()]), [['report.txt', 'rows: 2']]);
    const second = await manager.run(id, { code: 'print(total + 2)\nopen(__import__("os").environ["NOUREON_OUTPUT"] + "/second.txt", "w").write("2")' });
    assert.equal(second.stdout.text, '42\n', 'the variables of the first step are still there');
    assert.deepEqual(second.files.map((file) => file.name), ['second.txt'], 'only what this step made');
    const failing = await manager.run(id, { code: 'raise ValueError("boom")' });
    assert.match(failing.error, /ValueError: boom/);
    const blocked = await manager.run(id, { code: 'open(__import__("os").environ["NOUREON_OUTPUT"] + "/tool.exe", "w").write("x")' });
    assert.deepEqual(blocked.files, []);
    assert.deepEqual(blocked.skippedFiles, [{ name: 'tool.exe', reason: 'blocked-type' }]);
  } finally {
    await done();
  }
});

sandboxTest('a step that runs past its time is ended: by itself, or by the runner when it will not stop, and the next step starts clean', async () => {
  // A long grace: on a busy machine the program may be late in stopping itself, and that must not look like a stubborn one.
  const { manager, state, done } = harness({ SANDBOX_KILL_GRACE_MS: '6000' });
  try {
    const { id } = await manager.create();
    await manager.run(id, { code: 'kept = 1' });
    const slow = await manager.run(id, { code: 'import time\nwhile True:\n    time.sleep(0.05)', timeoutMs: 1000 });
    assert.match(slow.error, /time limit/);
    assert.equal(slow.restarted, undefined, 'it stopped itself, the container stayed');
    assert.equal((await manager.run(id, { code: 'print(kept)' })).stdout.text, '1\n');
    const stubborn = await manager.run(id, { code: 'import signal\nsignal.setitimer(signal.ITIMER_REAL, 0)\nwhile True:\n    pass', timeoutMs: 1000 });
    assert.match(stubborn.error, /time limit/);
    assert.equal(stubborn.restarted, true, 'the container was killed');
    const after = await manager.run(id, { code: 'print("kept" in globals())' });
    assert.equal(after.stdout.text, 'False\n', 'a new, empty environment');
    assert.ok(existsSync(join(state, `${containerName(id)}.args.json`)));
  } finally {
    await done();
  }
});

sandboxTest('a stop ends the step at once, and the session goes on with a new container', async () => {
  const { manager, config, done } = harness();
  try {
    const { id } = await manager.create();
    const running = manager.run(id, { code: 'import os, time\nopen(os.environ["NOUREON_OUTPUT"] + "/started", "w").write("1")\ntime.sleep(30)' });
    // Stopped once the step is really running (it says so by writing a file).
    for (let waited = 0; !existsSync(join(config.dataDir, id, 'output', 'started')) && waited < 600; waited += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    await manager.stop(id);
    const result = await running;
    assert.equal(result.stopped, true);
    assert.equal((await manager.run(id, { code: 'print("again")' })).stdout.text, 'again\n');
  } finally {
    await done();
  }
});

sandboxTest('clear starts a reply over: no variables, no files', async () => {
  const { manager, done } = harness();
  try {
    const { id } = await manager.create();
    await manager.run(id, { code: 'kept = 1\nopen(__import__("os").environ["NOUREON_OUTPUT"] + "/old.txt", "w").write("x")' });
    await manager.clear(id);
    const result = await manager.run(id, { code: 'import os\nprint("kept" in globals(), os.listdir(os.environ["NOUREON_OUTPUT"]))' });
    assert.equal(result.stdout.text, "False []\n");
  } finally {
    await done();
  }
});

sandboxTest('only a few sandboxes at once, idle ones are removed, and a removed one leaves nothing', async () => {
  const { manager, clock, config, done } = harness({ SANDBOX_MAX_SESSIONS: '2', SANDBOX_IDLE_MS: '60000' });
  try {
    const first = await manager.create();
    const second = await manager.create();
    await assert.rejects(() => manager.create(), (error) => error instanceof RunnerError && error.code === 'busy' && error.status === 429);
    clock.time += 61_000;
    assert.deepEqual(await manager.sweep(), [first.id, second.id]);
    assert.equal(manager.count, 0);
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.equal(existsSync(join(config.dataDir, first.id)), false);
    await assert.rejects(() => manager.run(first.id, { code: 'print(1)' }), (error) => error.code === 'not_found');
  } finally {
    await done();
  }
});

sandboxTest('over HTTP: the secret and the address are needed, a step streams what it prints and then its result', async () => {
  const { manager, config, done } = harness();
  const server = createServer(createHandler({ manager, config }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, path, body, headers = {}) => fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/v1/sessions`, { method: 'POST' })).status, 401);
    assert.equal((await call('POST', '/v1/sessions', {}, { Authorization: 'Bearer wrong' })).status, 401);
    const created = await call('POST', '/v1/sessions', { language: 'en' });
    assert.equal(created.status, 201);
    const { id } = await created.json();
    const mount = await call('POST', `/v1/sessions/${id}/mount`, { files: [{ name: 'in.txt', data: b64('hi') }] });
    assert.deepEqual((await mount.json()).mounted, [{ name: 'in.txt', size: 2 }]);
    const run = await call('POST', `/v1/sessions/${id}/run`, { code: 'print("streamed")\nopen(__import__("os").environ["NOUREON_OUTPUT"] + "/o.txt", "w").write("out")' });
    assert.match(run.headers.get('content-type'), /ndjson/);
    const lines = (await run.text()).trim().split('\n').map((line) => JSON.parse(line));
    assert.ok(lines.some((line) => line.type === 'progress' && line.text.includes('streamed')));
    const result = lines.at(-1);
    assert.equal(result.type, 'result');
    assert.equal(result.stdout.text, 'streamed\n');
    assert.equal(Buffer.from(result.files[0].data, 'base64').toString(), 'out');
    assert.equal((await call('POST', '/v1/sessions/ffffffffffffffffffffffff/run', { code: '1' })).status === 200, true, 'the stream starts');
    assert.equal((await call('GET', '/v1/nothing')).status, 404);
    assert.equal((await call('DELETE', `/v1/sessions/${id}`)).status, 200);
    assert.equal(manager.count, 0);
  } finally {
    server.close();
    await done();
  }
});

test('the address list: the pod network and the machine itself, nothing else', () => {
  const allow = ['10.42.0.0/16', '127.0.0.1/32'];
  assert.equal(addressAllowed('10.42.0.40', allow), true);
  assert.equal(addressAllowed('::ffff:10.42.7.9', allow), true);
  assert.equal(addressAllowed('127.0.0.1', allow), true);
  assert.equal(addressAllowed('84.247.153.81', allow), false);
  assert.equal(addressAllowed('10.43.0.1', allow), false);
  assert.equal(addressAllowed('', allow), false);
  assert.equal(addressAllowed('::1', allow), false);
});
