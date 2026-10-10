import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createInterface } from 'node:readline';

// The program that runs in the sandbox container (sandbox-host/repl.py), run here for real as a plain process with its folders in a temporary place
// (the walls of the container are not tested here, but how the supervisor and the worker keep the steps away from the commands is).
const python = spawnSync('python3', ['--version']).status === 0 ? 'python3' : null;
const REPL = process.env.REPL_UNDER_TEST || new URL('../../sandbox-host/repl.py', import.meta.url).pathname;
const skip = python ? false : 'python3 is not installed';

function startRepl() {
  const root = mkdtempSync(join(tmpdir(), 'repl-'));
  const dirs = { input: join(root, 'input'), output: join(root, 'output'), work: join(root, 'work'), pip: join(root, 'pip'), cli: join(root, 'cli') };
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });
  const child = spawn(python, ['-u', REPL], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NOUREON_INPUT: dirs.input, NOUREON_OUTPUT: dirs.output, NOUREON_WORK: dirs.work, NOUREON_PIP: dirs.pip, NOUREON_CLI: dirs.cli, NOUREON_NET_SOCKET: join(root, 'p.sock') }
  });
  const waiting = new Map();
  const frames = [];
  let ready;
  const readyPromise = new Promise((resolve) => { ready = resolve; });
  createInterface({ input: child.stdout }).on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    frames.push(message);
    if (message.type === 'ready') ready();
    const entry = waiting.get(message.id);
    if (entry && message.type === 'result') { waiting.delete(message.id); entry(message); }
  });
  let counter = 0;
  const request = (message, ms = 20000) => new Promise((resolve, reject) => {
    const id = `r${++counter}`;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`no answer to ${message.type} in ${ms} ms`)); }, ms);
    waiting.set(id, (result) => { clearTimeout(timer); resolve(result); });
    child.stdin.write(`${JSON.stringify({ id, ...message })}\n`);
  });
  const stop = () => { child.kill('SIGKILL'); rmSync(root, { recursive: true, force: true }); };
  return { child, dirs, frames, request, ready: readyPromise, stop, run: (code, timeoutMs = 10000) => request({ type: 'run', code, timeoutMs }), command: (command, extra = {}) => request({ type: 'command', command, timeoutMs: 20000, ...extra }) };
}

const withRepl = (name, fn) => test(name, { skip }, async () => {
  const repl = startRepl();
  try {
    await repl.ready;
    await fn(repl);
  } finally {
    repl.stop();
  }
});

withRepl('steps run in one namespace that lasts, and a clear starts again', async (repl) => {
  assert.equal((await repl.run('x = 41\nprint("hi")')).stdout.text, 'hi\n');
  assert.equal((await repl.run('print(x + 1)')).stdout.text, '42\n');
  assert.equal((await repl.run('1/0')).error.includes('ZeroDivisionError'), true);
  await repl.request({ type: 'clear' });
  assert.match((await repl.run('print(x)')).error, /NameError/, 'the variables went with the clear');
});

withRepl('a step that ends the process, or runs too long, gets an answer, and the next step starts clean', async (repl) => {
  await repl.run('kept = 1');
  const ended = await repl.run('import os\nos._exit(3)');
  assert.match(ended.error, /Python process ended/);
  assert.match((await repl.run('print(kept)')).error, /NameError/, 'a new worker, so no variables');
  assert.equal((await repl.run('print(2)')).stdout.text, '2\n');
  const slow = await repl.run('while True:\n    pass', 1000);
  assert.match(slow.error, /time limit/);
  assert.equal((await repl.run('print(3)')).stdout.text, '3\n', 'and the worker goes on');
});

withRepl('the code of a step cannot say what it likes to the runner: only its output and its result get through, and only for its own request', async (repl) => {
  const result = await repl.run(`import __main__, json
__main__.send({"id": "someone-else", "type": "result", "stdout": {"text": "FORGED"}})
__main__.send({"type": "ready"})
__main__.send({"id": "x", "type": "progress", "stage": "net-question", "stream": "stdout", "text": "FORGED"})
print("real")`);
  assert.equal(result.stdout.text, 'real\n');
  assert.equal(repl.frames.some((frame) => JSON.stringify(frame).includes('FORGED')), false, 'nothing forged was passed on');
  assert.equal(repl.frames.filter((frame) => frame.type === 'ready').length, 1, 'one ready, the supervisor\'s own');
});

withRepl('a step that changes subprocess, the environment or the functions of the program cannot reach the commands run after it', async (repl) => {
  const leak = join(repl.dirs.work, 'leak.txt');
  await repl.run(`import os, subprocess, builtins
log = ${JSON.stringify(leak)}
real = subprocess.Popen
class Spy(real):
    def __init__(self, *args, **kwargs):
        open(log, "a").write(repr((args, kwargs.get("env"))))
        super().__init__(*args, **kwargs)
subprocess.Popen = Spy
os.environ["PATH"] = "/work/bin:" + os.environ.get("PATH", "")
os.environ["EVIL"] = "1"
import __main__
__main__.command_environment = lambda extra: {"PATH": "/work/bin"}
__main__.write_command_files = lambda files: open(log, "a").write("files")`);
  const result = await repl.command('echo "$TOKEN"; echo "$PATH"; echo "${EVIL:-none}"', { env: { TOKEN: 's3cret' }, files: [{ path: '.cfg/login', content: 'password=p' }] });
  assert.equal(result.error, null);
  const [token, path, evil] = result.stdout.text.trim().split('\n');
  assert.equal(token, 's3cret', 'the command had its credentials');
  assert.equal(path.includes('/work/bin'), false, 'but not the PATH the step made');
  assert.equal(evil, 'none');
  assert.equal(existsSync(leak), false, 'and the step saw nothing of the command');
});

withRepl('the files of a command are not written through a link that a step planted, a folder, a pipe or a second name', async (repl) => {
  const { work, output } = repl.dirs;
  const outside = join(output, 'outside');
  mkdirSync(outside);
  await repl.run(`import os
os.symlink(${JSON.stringify(outside)}, ${JSON.stringify(join(work, 'cfg'))})
os.symlink(${JSON.stringify(join(output, 'leaked'))}, ${JSON.stringify(join(work, 'leaf'))})
os.mkfifo(${JSON.stringify(join(work, 'pipe'))})
open(${JSON.stringify(join(output, 'victim'))}, "w").write("keep")
os.link(${JSON.stringify(join(output, 'victim'))}, ${JSON.stringify(join(work, 'twin'))})`);
  const result = await repl.command('true', {
    files: [
      { path: 'cfg/token', content: 'secret1' },
      { path: 'leaf', content: 'secret2' },
      { path: 'pipe', content: 'secret3' },
      { path: 'twin', content: 'secret4' },
      { path: '../escape', content: 'secret5' },
      { path: '/abs', content: 'secret6' },
      { path: '.ok/login', content: 'fine' }
    ]
  });
  assert.equal(result.error, null);
  assert.deepEqual(readdirSync(outside), [], 'nothing went through the linked folder');
  assert.equal(existsSync(join(output, 'leaked')), false, 'nor through the linked file');
  assert.equal(readFileSync(join(output, 'victim'), 'utf8'), 'keep', 'nor into a file with a second name');
  assert.equal(existsSync(join(work, '..', 'escape')), false);
});

withRepl('a file of the credentials is there for the command, owner only, and gone after it', async (repl) => {
  const login = join(repl.dirs.work, '.cfg', 'login');
  const result = await repl.command(`cat ${login}; echo; stat -c %a ${login}`, { env: { A_B: '1' }, files: [{ path: '.cfg/login', content: 'user=u' }] });
  assert.equal(result.error, null);
  assert.equal(result.stdout.text.trim().split('\n').join('|'), 'user=u|600');
  assert.equal(existsSync(login), false);
});

withRepl('what a step left running is stopped while a command with credentials runs, and goes on after', async (repl) => {
  const log = join(repl.dirs.work, 'bg.log');
  await repl.run(`import subprocess
subprocess.Popen(["sh", "-c", "while true; do echo x >> ${log}; sleep 0.05; done"])`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const result = await repl.command(`a=$(wc -c < ${log}); sleep 1; b=$(wc -c < ${log}); echo "$a $b"`, { env: { TOKEN: 't' } });
  const [before, after] = result.stdout.text.trim().split(' ').map(Number);
  assert.ok(before > 0, 'it had been running');
  assert.equal(after, before, 'and did not write while the command ran');
  const size = readFileSync(log).length;
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.ok(readFileSync(log).length > size, 'it goes on afterwards');
});

test('which processes are stopped: the others of the container, or the session of the worker, never the program itself', { skip }, () => {
  const proc = mkdtempSync(join(tmpdir(), 'proc-'));
  const fake = (pid, session) => {
    mkdirSync(join(proc, String(pid)));
    writeFileSync(join(proc, String(pid), 'stat'), `${pid} (some (odd) name) S 1 ${pid} ${session} 0 -1 0`);
  };
  fake(1, 1); fake(50, 50); fake(60, 50); fake(70, 70); fake(80, 70);
  mkdirSync(join(proc, 'self'));
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(REPL.replace(/\/repl\.py$/, ''))})
import repl
out = {
  "all": sorted(repl.processes_to_freeze("all", 80, 50, ${JSON.stringify(proc)})),
  "session": sorted(repl.processes_to_freeze("session", 80, 50, ${JSON.stringify(proc)})),
  "none": sorted(repl.processes_to_freeze("session", 80, None, ${JSON.stringify(proc)})),
}
sys.stderr.write(json.dumps(out))
`;
  const run = spawnSync(python, ['-c', script], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  rmSync(proc, { recursive: true, force: true });
  assert.deepEqual(JSON.parse(run.stderr), { all: [1, 50, 60, 70], session: [50, 60], none: [] });
});

withRepl('a command with credentials is run without the folders that the steps write and run: /opt/pip is not on its PATH or PYTHONPATH, and Python does not read the user site', async (repl) => {
  const probe = 'echo "$PATH"; echo "${PYTHONPATH:-unset}"; echo "${PYTHONNOUSERSITE:-unset}"';
  const plain = (await repl.command(probe)).stdout.text.trim().split('\n');
  assert.ok(plain[0].includes(join(repl.dirs.pip, 'bin')), 'a command without credentials has the pip folder (the person’s own installs)');
  assert.ok(plain[1].includes(repl.dirs.pip));
  assert.equal(plain[2], 'unset');
  const withCredentials = (await repl.command(probe, { env: { TOKEN: 't' } })).stdout.text.trim().split('\n');
  assert.equal(withCredentials[0].includes(repl.dirs.pip), false, 'a command with credentials has not');
  assert.equal(withCredentials[1].includes(repl.dirs.pip), false);
  assert.equal(withCredentials[2], '1');
  assert.ok(withCredentials[0].startsWith(repl.dirs.cli), 'the programs of the tools come first');

  // A program a step put in the pip folder is not run by a command with credentials, even under the name of a common program.
  mkdirSync(join(repl.dirs.pip, 'bin'), { recursive: true });
  writeFileSync(join(repl.dirs.pip, 'bin', 'printenv'), '#!/bin/sh\necho PLANTED\n', { mode: 0o755 });
  assert.match((await repl.command('printenv HOME')).stdout.text, /PLANTED/, 'it is found by a command without credentials (the person\'s own)');
  assert.doesNotMatch((await repl.command('printenv TOKEN', { env: { TOKEN: 'secret' } })).stdout.text, /PLANTED/);
});
