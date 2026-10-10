import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadConfig } from '../../sandbox-host/runner/config.js';
import { containerName, dockerRunArgs } from '../../sandbox-host/runner/docker-args.js';
import { addressAllowed, createHandler } from '../../sandbox-host/runner/http.js';
import { createCliCache } from '../../sandbox-host/runner/cli-cache.js';
import { PipCacheError } from '../../sandbox-host/runner/pip-cache.js';
import { RunnerError, createSessionManager, safeFileName, safeSkillPath } from '../../sandbox-host/runner/session.js';

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
  const args = dockerRunArgs({ config, sessionId: 'a1b2c3d4e5f6a1b2c3d4e5f6', dirs: { input: '/data/x/input', output: '/data/x/output', cli: '/data/x/cli', skills: '/data/x/skills', net: '/data/x/net' }, language: 'zh-TW; rm -rf /' });
  const joined = args.join(' ');
  for (const wanted of ['--network none', '--read-only', '--cap-drop ALL', '--security-opt no-new-privileges', '--pids-limit 256', '--memory 2g', '--memory-swap 2g', '--cpus 2', '--user 65534:65534', '-v /data/x/input:/input:ro', '-v /data/x/output:/output:rw', '-v /data/x/cli:/opt/cli:ro', '-v /data/x/skills:/skills:ro', '-v /data/x/net:/run/noureon-net:ro', '--tmpfs /opt/pip:rw,exec,nosuid,nodev,size=512m,uid=65534']) {
    assert.ok(joined.includes(wanted), wanted);
  }
  assert.equal(args.at(-1), 'noureon-sandbox:1', 'the image is the runner\'s');
  assert.equal(args.includes('--privileged'), false);
  assert.equal(args.filter((arg) => arg === '-v').length, 6, 'nothing else is mounted (the programs of the CLI tools, the folders of skills, the Python tools installed once and the socket of the proxy are read only)');
  assert.ok(joined.includes(`-v ${config.pipCacheDir}:/opt/pip-cache:ro`), 'the Python tools of the machine are seen, never changed');
  assert.equal(args.includes('host'), false, 'the container never shares the host\'s network');
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

// ----- the CLI tools

const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');
const TOOL_BYTES = Buffer.from('#!/bin/sh\necho "tool says $1 $GREETING"\nexit ${EXIT:-0}\n');
/** A fetch that serves one program, the way GitHub does: the first address sends on to another host. */
function toolFetch(bytes = TOOL_BYTES, calls = []) {
  return async (address, options = {}) => {
    calls.push(String(address));
    assert.equal(options.redirect, 'manual', 'the runner follows redirects itself, to check each address');
    if (String(address).startsWith('https://github.com/')) return new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/file?sig=abc' } });
    if (String(address).startsWith('https://release-assets.githubusercontent.com/')) return new Response(bytes, { status: 200 });
    return new Response('no', { status: 404 });
  };
}
const toolSpec = (overrides = {}) => ({ id: 'mytool', file: 'mytool', url: 'https://github.com/o/r/releases/download/v1/mytool', sha256: sha256Of(TOOL_BYTES), size: TOOL_BYTES.length, ...overrides });

test('a program is fetched once, from an allowed host, and only kept when it is the listed size and hash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'noureon-clicache-'));
  try {
    const calls = [];
    const cache = createCliCache({ dir, hosts: ['github.com', 'release-assets.githubusercontent.com'], maxBytes: 1024 * 1024, fetchImpl: toolFetch(TOOL_BYTES, calls) });
    const path = await cache.ensure(toolSpec());
    assert.equal(readFileSync(path).toString(), TOOL_BYTES.toString());
    assert.equal(statSync(path).mode & 0o777, 0o755, 'it can be run');
    await cache.ensure(toolSpec());
    assert.equal(calls.length, 2, 'the second time it is already here (one fetch is the address and the host it sent on to)');
    assert.deepEqual(readdirSync(dir), [sha256Of(TOOL_BYTES)], 'nothing else is left in the folder');

    const other = mkdtempSync(join(tmpdir(), 'noureon-clicache-'));
    try {
      const strict = createCliCache({ dir: other, hosts: ['github.com', 'release-assets.githubusercontent.com'], maxBytes: 1024 * 1024, fetchImpl: toolFetch(Buffer.from('something else')) });
      await assert.rejects(() => strict.ensure(toolSpec()), /not the one that was listed/, 'a different file is refused');
      await assert.rejects(() => strict.ensure(toolSpec({ size: 3, sha256: sha256Of('abc') })), /larger than listed/);
      await assert.rejects(() => strict.ensure(toolSpec({ url: 'http://github.com/x' })), /may not be fetched/, 'https only');
      await assert.rejects(() => strict.ensure(toolSpec({ url: 'https://evil.example/x' })), /may not be fetched/, 'allowed hosts only');
      await assert.rejects(() => strict.ensure(toolSpec({ sha256: 'zz' })), /hash/);
      await assert.rejects(() => strict.ensure(toolSpec({ size: 10 * 1024 * 1024 })), /size/);
      const wandering = createCliCache({ dir: other, hosts: ['github.com'], maxBytes: 1024 * 1024, fetchImpl: toolFetch() });
      await assert.rejects(() => wandering.ensure(toolSpec()), /sent on to an address that is not allowed/, 'a redirect to another host is refused');
      assert.deepEqual(readdirSync(other), [], 'a refused file leaves nothing');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

sandboxTest('the Python tools of a session come from the cache of the machine: a script for each command, in /opt/cli, that runs the tool from its own folder; a tool that cannot be had is told', async () => {
  const h = harness();
  const toolDir = join(h.root, 'cache', 'twitter-cli-0.8.5');
  mkdirSync(join(toolDir, 'bin'), { recursive: true });
  writeFileSync(join(toolDir, 'bin', 'twitter'), '#!/usr/bin/python\n');
  const asked = [];
  const pipCache = {
    ensure: async (pip) => {
      asked.push(pip.package);
      if (pip.package === 'no-wheel') throw new PipCacheError('install_failed', 'no wheel');
      if (pip.package.startsWith('..')) throw new PipCacheError('bad_request', 'The tool is not valid.', 400);
      return { name: 'twitter-cli-0.8.5', path: toolDir };
    }
  };
  const manager = createSessionManager({ config: h.config, now: () => h.clock.time, pipCache });
  try {
    const { id } = await manager.create({ language: 'en' });
    const sessionCli = join(h.config.dataDir, id, 'cli');
    const result = await manager.mountPip(id, [
      { id: 'twitter-cli', pip: { package: 'twitter-cli', version: '0.8.5', command: 'twitter', commands: ['twitter', 'twitter-missing'] } },
      { id: 'other-tool', pip: { package: 'no-wheel', version: '1.0', command: 'other' } }
    ]);
    assert.deepEqual(result.cached, ['twitter-cli']);
    assert.deepEqual(result.failed.map((entry) => [entry.id, entry.reason]), [['other-tool', 'install_failed']]);
    assert.deepEqual(readdirSync(sessionCli), ['twitter'], 'a script only for a command the tool has');
    const script = readFileSync(join(sessionCli, 'twitter'), 'utf8');
    assert.match(script, /^#!\/bin\/sh\n/);
    assert.ok(script.includes('export PYTHONPATH="/opt/pip-cache/twitter-cli-0.8.5${PYTHONPATH:+:$PYTHONPATH}"'), 'the tool sees its own packages and no other tool\'s');
    assert.ok(script.includes('exec "/opt/pip-cache/twitter-cli-0.8.5/bin/twitter" "$@"'));
    assert.equal(statSync(join(sessionCli, 'twitter')).mode & 0o111, 0o111, 'it can be run');
    await assert.rejects(() => manager.mountPip(id, [{ id: 'Bad Id', pip: {} }]), /no valid id or Python package/);
    await assert.rejects(() => manager.mountPip(id, [{ id: 'x-tool', pip: { package: '../x', version: '1', command: 'x' } }]), (error) => error instanceof RunnerError && error.status === 400);
    assert.deepEqual(asked, ['twitter-cli', 'no-wheel', '../x']);
  } finally {
    await h.done();
  }
});

sandboxTest('a command of a CLI tool runs in /output with the tool on its path, tells its output, and its failure and time limit are reported', async () => {
  const h = harness();
  const manager = createSessionManager({ config: h.config, now: () => h.clock.time, fetchImpl: toolFetch() });
  try {
    const { id } = await manager.create({ language: 'en' });
    assert.deepEqual((await manager.mountCli(id, [toolSpec()])).mounted, [{ id: 'mytool', file: 'mytool' }]);
    const lines = [];
    const ok = await manager.run(id, { command: 'mytool hello', env: { GREETING: 'there' }, timeoutMs: 20_000 }, (progress) => lines.push(progress.text));
    assert.equal(ok.stdout.text, 'tool says hello there\n');
    assert.equal(ok.error, null);
    assert.ok(lines.join('').includes('tool says hello'), 'the output is told as it comes');

    const failed = await manager.run(id, { command: 'EXIT=3 mytool x', timeoutMs: 20_000 });
    assert.match(failed.error, /exited with code 3/);

    const wrote = await manager.run(id, { command: 'echo made > note.txt', timeoutMs: 20_000 });
    assert.deepEqual(wrote.files.map((file) => file.name), ['note.txt'], 'a file the command writes is an output of the step');

    const blocked = await manager.run(id, { command: 'echo "$PATH|$HOME|$LD_PRELOAD"', env: { PATH: '/evil', LD_PRELOAD: '/evil.so', HOME: '/evil' }, timeoutMs: 20_000 });
    assert.ok(blocked.stdout.text.split('|')[0].startsWith(join(h.root, 'data', id, 'cli')), 'the tools come first on the path and the tool cannot change it');
    assert.doesNotMatch(blocked.stdout.text, /evil/, 'neither the path, the home nor the loader of programs');

    const slow = await manager.run(id, { command: 'sleep 30', timeoutMs: 1500 });
    assert.match(slow.error, /time limit/);
    const left = await manager.run(id, { command: '(sleep 30 &) ; echo started', timeoutMs: 20_000 });
    assert.equal(left.error, null);
    await manager.destroy(id);
  } finally {
    await h.done();
  }
});

test('the programs of the tools are asked for by a plain id and file name, and a request that is not is refused', async () => {
  const h = harness();
  const manager = createSessionManager({ config: h.config, now: () => h.clock.time, fetchImpl: toolFetch() });
  try {
    const { id } = await manager.create({ language: 'en' }).catch(() => ({ id: null }));
    if (!id) return;
    await assert.rejects(() => manager.mountCli(id, [toolSpec({ file: '../x' })]), /no valid id or file name/);
    await assert.rejects(() => manager.mountCli(id, [toolSpec({ id: 'Bad Id' })]), /no valid id or file name/);
    await manager.destroy(id);
  } finally {
    await h.done();
  }
});

// ----- the network: a proxy of the runner on a socket, and the questions it puts to the person while a step runs

/** A web site on this machine, for a command to fetch through the proxy; and a manager whose proxy takes its address for a public one. */
async function networkHarness({ proxyOptions } = {}) {
  const h = harness({ SANDBOX_NET_ASK_MS: '8000' });
  const site = createServer((request, response) => response.end('hello from the site'));
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const port = site.address().port;
  const manager = createSessionManager({
    config: h.config,
    now: () => h.clock.time,
    fetchImpl: toolFetch(),
    proxyOptions: proxyOptions === undefined ? { resolve: async () => [{ address: '127.0.0.1', family: 4 }], isInternal: () => false, ports: [port] } : proxyOptions
  });
  // A command that fetches a page the way a tool does: by the proxy its environment names.
  const fetchCommand = (host, path = '/') => `python3 -c "import os,urllib.request as u; r=u.build_opener(u.ProxyHandler({'http': os.environ['HTTP_PROXY']})); print(r.open('http://${host}:${port}${path}', timeout=20).read().decode())"`;
  return { h, manager, port, fetchCommand, done: async () => { await manager.shutdown(); site.close(); await h.done(); } };
}
const toolNet = { mode: 'new', rules: {} };

sandboxTest('a session with no network policy has none: no proxy in the environment of its commands', async () => {
  const n = await networkHarness();
  try {
    const { id } = await n.manager.create({ language: 'en' });
    await n.manager.mountCli(id, []);
    const answer = await n.manager.run(id, { command: 'echo "[$HTTP_PROXY][$https_proxy]"', timeoutMs: 20_000 });
    // (the test process may have a proxy of its own in its environment; what matters is that none of the session's is added)
    assert.equal(answer.stdout.text, `[${process.env.HTTP_PROXY || ''}][${process.env.https_proxy || ''}]\n`);
    await n.manager.destroy(id);
  } finally {
    await n.done();
  }
});

sandboxTest('a program that reaches for a site with no rule makes the step ask the person; the answer lets it through, and the step\'s own time did not run meanwhile', async () => {
  const n = await networkHarness();
  try {
    const { id } = await n.manager.create({ language: 'en' });
    assert.equal((await n.manager.mountCli(id, [], toolNet)).network, true);
    const heard = [];
    // The step may take 2 seconds; the person takes 3 to answer, and the step still ends well.
    const stepping = n.manager.run(id, { command: n.fetchCommand('news.test'), timeoutMs: 2000 }, (progress) => {
      heard.push(progress);
      if (progress.stage === 'net' && progress.event === 'ask') setTimeout(() => { void n.manager.answerNet(id, progress.id, 'once'); }, 3000);
    });
    const result = await stepping;
    assert.equal(result.error, null, result.stderr?.text);
    assert.equal(result.stdout.text, 'hello from the site\n');
    const asks = heard.filter((message) => message.stage === 'net' && message.event === 'ask');
    assert.equal(asks.length, 1);
    assert.equal(asks[0].host, 'news.test');
    assert.equal(asks[0].port, n.port);
    assert.deepEqual(heard.filter((message) => message.event === 'answer').map((message) => message.decision), ['once']);
    // Answered for this session: the same site is not asked about again.
    const again = await n.manager.run(id, { command: n.fetchCommand('news.test', '/again'), timeoutMs: 20_000 }, (progress) => heard.push(progress));
    assert.equal(again.stdout.text, 'hello from the site\n');
    assert.equal(heard.filter((message) => message.event === 'ask').length, 1);
    await n.manager.destroy(id);
  } finally {
    await n.done();
  }
});

sandboxTest('a refused site is a 403 to the program, a question nobody answers is a refusal, and a stop ends the question', async () => {
  const n = await networkHarness();
  try {
    const { id } = await n.manager.create({ language: 'en' });
    await n.manager.mountCli(id, [], { mode: 'new', rules: { 'blocked.test': 'deny' } });
    const refused = await n.manager.run(id, { command: n.fetchCommand('blocked.test'), timeoutMs: 20_000 });
    assert.match(refused.stderr.text, /403/);
    assert.notEqual(refused.error, null);

    const denied = await n.manager.run(id, { command: n.fetchCommand('asked.test'), timeoutMs: 20_000 }, (progress) => {
      if (progress.stage === 'net' && progress.event === 'ask') void n.manager.answerNet(id, progress.id, 'deny');
    });
    assert.match(denied.stderr.text, /403/);

    // Nobody answers: after the time the question is given (8 seconds here) it counts as a refusal and the step goes on.
    const unanswered = await n.manager.run(id, { command: n.fetchCommand('silent.test'), timeoutMs: 20_000 });
    assert.match(unanswered.stderr.text, /403/);

    // A stop while the person is being asked: the question is over with the step.
    const heard = [];
    const waiting = n.manager.run(id, { command: n.fetchCommand('later.test'), timeoutMs: 60_000 }, (progress) => {
      heard.push(progress);
      if (progress.stage === 'net' && progress.event === 'ask') setTimeout(() => { void n.manager.stop(id); }, 300);
    });
    const stopped = await waiting;
    assert.equal(stopped.stopped, true);
    await n.manager.destroy(id);
  } finally {
    await n.done();
  }
});

sandboxTest('an answer that is not valid, or for a question that is not open, changes nothing', async () => {
  const n = await networkHarness();
  try {
    const { id } = await n.manager.create({ language: 'en' });
    await n.manager.mountCli(id, [], toolNet);
    await assert.rejects(() => n.manager.answerNet(id, 'a'.repeat(24), 'maybe'), /Not a valid answer/);
    assert.deepEqual(await n.manager.answerNet(id, 'a'.repeat(24), 'once'), { answered: false });
    await assert.rejects(() => n.manager.answerNet('f'.repeat(24), 'a'.repeat(24), 'once'), /No such sandbox/);
    await n.manager.destroy(id);
  } finally {
    await n.done();
  }
});

sandboxTest('the real proxy refuses this machine: a program cannot reach 127.0.0.1 even with a rule that says allow, and the person is never asked', async () => {
  const n = await networkHarness({ proxyOptions: {} });
  try {
    const { id } = await n.manager.create({ language: 'en' });
    await n.manager.mountCli(id, [], { mode: 'new', rules: { '127.0.0.1': 'allow', localhost: 'allow' } });
    const heard = [];
    for (const host of ['127.0.0.1', 'localhost']) {
      const result = await n.manager.run(id, { command: `python3 -c "import os,urllib.request as u; r=u.build_opener(u.ProxyHandler({'http': os.environ['HTTP_PROXY']})); r.open('http://${host}:80/', timeout=20)"`, timeoutMs: 20_000 }, (progress) => heard.push(progress));
      assert.match(result.stderr.text, /403/, host);
    }
    assert.equal(heard.filter((message) => message.stage === 'net').length, 0);
    await n.manager.destroy(id);
  } finally {
    await n.done();
  }
});

sandboxTest('a command may be given files for its home (a tool\'s login) that only exist while it runs, and long values for its environment, none of it kept', async () => {
  const n = await networkHarness();
  try {
    const { id } = await n.manager.create({ language: 'en' });
    const long = 'x'.repeat(1500);
    const result = await n.manager.run(id, {
      // (the container's home is /work; here the folder of the stand-in is NOUREON_WORK)
      command: 'cat "$NOUREON_WORK/.config/tool/login.json"; echo; echo ${#SECRET_COOKIE}; ls "$NOUREON_WORK/.config/tool"',
      env: { SECRET_COOKIE: long },
      files: [{ path: '.config/tool/login.json', content: '{"cookie":"abc"}' }, { path: '../escape.txt', content: 'no' }, { path: '/abs.txt', content: 'no' }],
      timeoutMs: 20_000
    });
    assert.equal(result.stdout.text, '{"cookie":"abc"}\n1500\nlogin.json\n');
    const after = await n.manager.run(id, { command: 'ls "$NOUREON_WORK/.config/tool"; ls "$NOUREON_WORK/.." | grep -c escape', timeoutMs: 20_000 });
    assert.doesNotMatch(after.stdout.text, /login\.json/, 'the file is gone when the command is over');
    await n.manager.destroy(id);
  } finally {
    await n.done();
  }
});

sandboxTest('the folders of skills are put in /skills, read only and never run; a script is run by an interpreter; a new list replaces the old; a wrong list writes nothing', async () => {
  const h = harness();
  const manager = createSessionManager({ config: h.config, now: () => h.clock.time });
  try {
    const { id } = await manager.create({ language: 'en' });
    const folder = join(h.root, 'data', id, 'skills');
    const mounted = await manager.mountSkills(id, [{ name: 'sales-report', files: [
      { path: 'SKILL.md', data: b64('# skill') },
      { path: 'scripts/summary.py', data: b64('import sys\nprint("summary", sys.argv[1])\n') },
      { path: 'references/deep/format.md', data: b64('# Format') }
    ] }, { name: 'plain-skill', files: [] }]);
    assert.deepEqual(mounted, { mounted: [{ name: 'sales-report', files: 3 }, { name: 'plain-skill', files: 0 }] });
    assert.equal(readFileSync(join(folder, 'sales-report', 'references', 'deep', 'format.md'), 'utf8'), '# Format');
    for (const path of ['SKILL.md', 'scripts/summary.py', 'references/deep/format.md']) assert.equal(statSync(join(folder, 'sales-report', path)).mode & 0o111, 0, `${path} is not made a program`);
    for (const path of ['', 'scripts', 'references', 'references/deep']) assert.equal(statSync(join(folder, 'sales-report', path)).mode & 0o555, 0o555, `${path || 'the folder'} can be read and entered`);
    const ran = await manager.run(id, { command: 'python3 "$NOUREON_SKILLS/sales-report/scripts/summary.py" ok', timeoutMs: 20_000 });
    assert.equal(ran.stdout.text, 'summary ok\n');
    assert.equal(ran.error, null);

    // A new list replaces the old one.
    await manager.mountSkills(id, [{ name: 'other-skill', files: [{ path: 'a.md', data: b64('a') }] }]);
    assert.deepEqual(readdirSync(folder), ['other-skill']);

    // What is wrong is refused before anything is written.
    const bad = [
      [{ name: 'Bad Name', files: [] }],
      [{ name: 'a-skill', files: [] }, { name: 'a-skill', files: [] }],
      [{ name: 'a-skill', files: [{ path: '../evil.py', data: b64('x') }] }],
      [{ name: 'a-skill', files: [{ path: '/abs.py', data: b64('x') }] }],
      [{ name: 'a-skill', files: [{ path: 'a\\b.py', data: b64('x') }] }],
      [{ name: 'a-skill', files: [{ path: '.hidden/a.md', data: b64('x') }] }],
      [{ name: 'a-skill', files: [{ path: 'A.md', data: b64('x') }, { path: 'a.md', data: b64('y') }] }],
      [{ name: 'a-skill', files: Array.from({ length: 62 }, (_, index) => ({ path: `f${index}.md`, data: b64('x') })) }],
      Array.from({ length: 6 }, (_, index) => ({ name: `skill-${index}`, files: [] }))
    ];
    for (const list of bad) await assert.rejects(() => manager.mountSkills(id, list), (error) => error instanceof RunnerError && error.status === 400, JSON.stringify(list).slice(0, 80));
    await assert.rejects(() => manager.mountSkills(id, [{ name: 'big-skill', files: [{ path: 'big.bin', data: Buffer.alloc(13 * 1024 * 1024).toString('base64') }] }]), (error) => error instanceof RunnerError && error.status === 413);
    assert.deepEqual(readdirSync(folder), ['other-skill'], 'nothing was written by the lists that were refused');
    assert.deepEqual(await manager.mountSkills(id, []), { mounted: [] });
    assert.deepEqual(readdirSync(folder), []);
    assert.equal(safeSkillPath('a/b.md'), 'a/b.md');
    assert.equal(safeSkillPath('a//b.md'), null);
    assert.equal(safeSkillPath(`${'a/'.repeat(120)}b`), null);
  } finally {
    await h.done();
  }
});
