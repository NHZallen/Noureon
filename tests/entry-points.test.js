import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The two programs that start the server and the sandbox runner are run as the host runs them (`node …/main.js`, settings from the
// environment), because they begin when they are loaded.

const root = new URL('..', import.meta.url).pathname;

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

// Starts a program with only the settings given (no inherited ones), and tells what it logs. `events` are the JSON lines it printed.
const start = (script, env) => {
  const child = spawn(process.execPath, [join(root, script)], { cwd: root, env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const events = [];
  const waiting = [];
  let buffer = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      try { events.push(JSON.parse(line)); } catch { continue; }
      for (const waiter of [...waiting]) waiter();
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const has = (name) => events.some((event) => event.event === name);
  const until = (name, ms = 15_000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${name}" in ${ms} ms: ${JSON.stringify(events)} ${stderr}`)), ms);
    const check = () => {
      if (!has(name)) return;
      clearTimeout(timer);
      waiting.splice(waiting.indexOf(check), 1);
      resolve(events.find((event) => event.event === name));
    };
    waiting.push(check);
    check();
  });
  return { child, events, exited, until, stop: () => child.kill('SIGKILL') };
};

const serverEnv = (port) => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key', PORT: String(port) });

test('the server does not start with settings that are not right, and says what is wrong in its log', async () => {
  const program = start('server/main.js', { PORT: '8080' });
  const { code } = await program.exited;
  assert.equal(code, 1);
  const failure = program.events.find((event) => event.event === 'config_error');
  assert.ok(failure, 'the log names the problem');
  assert.match(failure.message, /SUPABASE_URL/);
});

test('the server starts with the settings for sign-in only, answers its health check, and stops cleanly when asked to', async () => {
  const port = await freePort();
  const program = start('server/main.js', serverEnv(port));
  try {
    const listening = await program.until('listening');
    assert.equal(listening.port, port);
    assert.equal(listening.runs, false, 'replies on the server are off without the service key');
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(response.status, 200);
    program.child.kill('SIGTERM');
    const { code } = await program.exited;
    assert.equal(code, 0);
    assert.ok(program.events.some((event) => event.event === 'stopping' && event.signal === 'SIGTERM'));
    assert.ok(program.events.some((event) => event.event === 'stopped'));
  } finally {
    program.stop();
  }
});

test('a server with only half of the settings for replies refuses to start', async () => {
  const program = start('server/main.js', { ...serverEnv(await freePort()), SUPABASE_SERVICE_KEY: 'service-key' });
  const { code } = await program.exited;
  assert.equal(code, 1);
  assert.match(program.events.find((event) => event.event === 'config_error').message, /go together/);
});

// A stand-in for the docker program: it answers the two questions the runner asks when it starts and does nothing else.
const fakeDocker = () => {
  const dir = mkdtempSync(join(tmpdir(), 'fake-docker-'));
  const file = join(dir, 'docker');
  writeFileSync(file, '#!/bin/sh\nexit 0\n');
  chmodSync(file, 0o755);
  return { file, dispose: () => rmSync(dir, { recursive: true, force: true }) };
};

test('the runner does not start without its secret', async () => {
  const program = start('sandbox-host/runner/main.js', {});
  const { code } = await program.exited;
  assert.equal(code, 1);
  assert.match(program.events.find((event) => event.event === 'config_error').message, /RUNNER_TOKEN/);
});

test('the runner does not start when docker cannot be asked, and says so', async () => {
  const program = start('sandbox-host/runner/main.js', { RUNNER_TOKEN: 'x'.repeat(40), DOCKER_BIN: join(tmpdir(), 'no-such-docker-program') });
  const { code } = await program.exited;
  assert.equal(code, 1);
  assert.ok(program.events.some((event) => event.event === 'docker_unavailable'));
});

test('the runner starts when docker answers, listens only on the address it was given, and stops cleanly when asked to', async () => {
  const docker = fakeDocker();
  const port = await freePort();
  const program = start('sandbox-host/runner/main.js', { RUNNER_TOKEN: 'x'.repeat(40), DOCKER_BIN: docker.file, RUNNER_HOST: '127.0.0.1', RUNNER_PORT: String(port) });
  try {
    assert.equal((await program.until('cleaned')).containers, 0);
    const listening = await program.until('listening');
    assert.equal(listening.host, '127.0.0.1');
    assert.equal(listening.port, port);
    // Nothing is answered without the secret.
    const refused = await fetch(`http://127.0.0.1:${port}/v1/health`);
    assert.ok(refused.status === 401 || refused.status === 403 || refused.status === 404, `status ${refused.status}`);
    program.child.kill('SIGTERM');
    const { code } = await program.exited;
    assert.equal(code, 0);
    assert.ok(program.events.some((event) => event.event === 'stopping'));
  } finally {
    program.stop();
    docker.dispose();
  }
});
