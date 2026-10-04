import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSandboxHost } from '../../server/sandbox-client.js';
import { loadConfig } from '../../sandbox-host/runner/config.js';
import { createHandler } from '../../sandbox-host/runner/http.js';
import { createSessionManager } from '../../sandbox-host/runner/session.js';

// The server's adapter against the real runner (the container's program runs as an ordinary process, see fake-docker.mjs): the two halves
// of the sandbox's HTTP interface stay in step.
const sandboxTest = spawnSync('python3', ['--version']).status === 0 ? test : test.skip;
const SECRET = 'a'.repeat(40);
const fakeDocker = join(process.cwd(), 'tests', 'sandbox-host', 'fake-docker.mjs');

sandboxTest('the server\'s sandbox runs a step on the real runner: input, output, files, variables, and removal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'noureon-adapter-'));
  process.env.FAKE_DOCKER_STATE = join(root, 'state');
  const config = loadConfig({ RUNNER_TOKEN: SECRET, DOCKER_BIN: fakeDocker, SANDBOX_DATA_DIR: join(root, 'data'), RUNNER_ALLOW: '127.0.0.1/32', SANDBOX_KILL_GRACE_MS: '400' });
  const manager = createSessionManager({ config });
  const server = createServer(createHandler({ manager, config }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const host = createSandboxHost({ url: `http://127.0.0.1:${server.address().port}`, token: SECRET });
  try {
    assert.deepEqual(await host.check(), { ok: true, reason: '' });
    const heard = [];
    const sandbox = host.getSandbox({ onProgress: (message) => heard.push(message) });
    await sandbox.prepare();
    await sandbox.clear();
    await sandbox.mount([{ name: 'data.csv', type: 'text/csv', bytes: new TextEncoder().encode('a,b\n1,2\n') }]);
    const first = await sandbox.run('import os\nx = open(os.environ["NOUREON_INPUT"] + "/data.csv").read()\nprint(len(x))\nopen(os.environ["NOUREON_OUTPUT"] + "/out.txt", "w").write(x.upper())', { timeoutMs: 20_000 });
    assert.equal(first.error, '');
    assert.equal(first.stdout.text.trim(), '8');
    assert.deepEqual(first.files.map((file) => [file.name, file.size, Buffer.from(file.bytes).toString()]), [['out.txt', 8, 'A,B\n1,2\n']]);
    assert.ok(heard.some((message) => message.stage === 'output' && /8/.test(message.text)), 'what the code prints is heard as it runs');
    const second = await sandbox.run('print(x[:3])', { timeoutMs: 20_000 });
    assert.equal(second.stdout.text.trim(), 'a,b', 'variables stay between steps');
    await sandbox.dispose();
    assert.equal(manager.activeCount ?? 0, 0);
  } finally {
    server.closeAllConnections();
    server.close();
    await manager.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 700));
    rmSync(root, { recursive: true, force: true });
  }
});

sandboxTest('the server\'s sandbox mounts the program of a CLI tool and runs a command of it, with its environment, on the real runner', async () => {
  const root = mkdtempSync(join(tmpdir(), 'noureon-adapter-'));
  process.env.FAKE_DOCKER_STATE = join(root, 'state');
  const program = Buffer.from('#!/bin/sh\necho "$1-$TOOL_MODE"\necho made > "$2"\n');
  const hash = createHash('sha256').update(program).digest('hex');
  const config = loadConfig({ RUNNER_TOKEN: SECRET, DOCKER_BIN: fakeDocker, SANDBOX_DATA_DIR: join(root, 'data'), RUNNER_ALLOW: '127.0.0.1/32', SANDBOX_KILL_GRACE_MS: '400' });
  const fetches = [];
  const manager = createSessionManager({ config, fetchImpl: async (address) => { fetches.push(String(address)); return new Response(program, { status: 200 }); } });
  const server = createServer(createHandler({ manager, config }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const host = createSandboxHost({ url: `http://127.0.0.1:${server.address().port}`, token: SECRET });
  try {
    const sandbox = host.getSandbox();
    await sandbox.prepare();
    await sandbox.clear();
    await sandbox.mountCli([{ id: 'greeter', file: 'greeter', url: 'https://github.com/o/r/releases/download/v1/greeter', sha256: hash, size: program.length }]);
    const result = await sandbox.command('greeter hi report.txt', { env: { TOOL_MODE: 'fast' }, timeoutMs: 20_000 });
    assert.equal(result.error, '');
    assert.equal(result.stdout.text.trim(), 'hi-fast');
    assert.deepEqual(result.files.map((file) => file.name), ['report.txt'], 'what the tool writes in /output comes back as a file');
    const again = await sandbox.command('greeter again x.txt', { timeoutMs: 20_000 });
    assert.equal(again.stdout.text.trim(), 'again-');
    assert.equal(fetches.length, 1, 'the program is fetched once');
    await sandbox.dispose();
  } finally {
    server.closeAllConnections();
    server.close();
    await manager.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 700));
    rmSync(root, { recursive: true, force: true });
  }
});
