#!/usr/bin/env node
// Stands in for `docker` in the tests: `run` starts the program of the container (repl.py) as an ordinary process whose folders are the
// host folders that were to be mounted, so the runner can be tried end to end where there is no Docker. `kill` ends it.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const state = process.env.FAKE_DOCKER_STATE;
mkdirSync(state, { recursive: true });
const repl = join(dirname(new URL(import.meta.url).pathname), '..', '..', 'sandbox-host', 'repl.py');

if (args[0] === 'run' && process.env.FAKE_DOCKER_FAIL_ONCE && !existsSync(join(state, 'failed-once'))) {
  // The first start is refused, as Docker does when the name of a container that was just killed is not free yet.
  writeFileSync(join(state, 'failed-once'), '1');
  process.stderr.write('docker: Error response from daemon: Conflict. The container name "/nsb-x" is already in use.\n');
  process.exit(125);
} else if (args[0] === 'run' && process.env.FAKE_DOCKER_FAIL) {
  // A start that fails, with the kind of words Docker uses (paths of the machine, names of images).
  process.stderr.write('docker: Error response from daemon: pull access denied for secret-image-name, mount /var/lib/noureon-sandbox/abc/output: permission denied.\n');
  process.exit(125);
} else if (args[0] === 'run') {
  const get = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : null; };
  const name = get('--name');
  const mounts = [];
  const env = [];
  args.forEach((arg, index) => {
    if (arg === '-v') mounts.push(args[index + 1]);
    if (arg === '-e') env.push(args[index + 1]);
  });
  const hostOf = (target) => mounts.map((mount) => mount.split(':')).find((parts) => parts[1] === target)?.[0];
  const output = hostOf('/output');
  const work = join(dirname(output), 'work');
  mkdirSync(work, { recursive: true });
  writeFileSync(join(state, `${name}.args.json`), JSON.stringify(args));
  const child = spawn(process.env.PYTHON_BIN || 'python3', ['-u', repl], {
    stdio: 'inherit',
    env: { ...process.env, NOUREON_INPUT: hostOf('/input'), NOUREON_OUTPUT: output, NOUREON_CLI: hostOf('/opt/cli') || '/opt/cli', NOUREON_SKILLS: hostOf('/skills') || '/skills', NOUREON_NET_SOCKET: join(hostOf('/run/noureon-net') || '/run/noureon-net', 'p.sock'), NOUREON_PIP: join(work, 'pip'), NOUREON_WORK: work, NOUREON_MPL_CACHE: join(work, 'no-cache'), MPLCONFIGDIR: join(work, 'mpl') }
  });
  writeFileSync(join(state, `${name}.pid`), String(child.pid));
  child.on('exit', (code, signal) => process.exit(signal === 'SIGKILL' ? 137 : (code ?? 0)));
} else if (args[0] === 'kill') {
  // Like the real one, it ends the container that is there when it is asked: a container started after this program began (the runner starts
  // the next step's right after a stop) is not the one it was asked about, and the pid file may already be the new one's.
  const startedAt = (pid) => Number(readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[19]);
  try {
    const pid = Number(readFileSync(join(state, `${args[1]}.pid`), 'utf8'));
    if (startedAt(pid) < startedAt(process.pid)) process.kill(pid, 'SIGKILL');
  } catch {
    // Gone already.
  }
} else {
  // ps, rm and the rest: nothing to do.
}
