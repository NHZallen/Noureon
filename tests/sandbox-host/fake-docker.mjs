#!/usr/bin/env node
// Stands in for `docker` in the tests: `run` starts the program of the container (repl.py) as an ordinary process whose folders are the
// host folders that were to be mounted, so the runner can be tried end to end where there is no Docker. `kill` ends it.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const state = process.env.FAKE_DOCKER_STATE;
mkdirSync(state, { recursive: true });
const repl = join(dirname(new URL(import.meta.url).pathname), '..', '..', 'sandbox-host', 'repl.py');

if (args[0] === 'run') {
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
    env: { ...process.env, NOUREON_INPUT: hostOf('/input'), NOUREON_OUTPUT: output, NOUREON_WORK: work, NOUREON_MPL_CACHE: join(work, 'no-cache'), MPLCONFIGDIR: join(work, 'mpl') }
  });
  writeFileSync(join(state, `${name}.pid`), String(child.pid));
  child.on('exit', (code, signal) => process.exit(signal === 'SIGKILL' ? 137 : (code ?? 0)));
} else if (args[0] === 'kill') {
  try {
    process.kill(Number(readFileSync(join(state, `${args[1]}.pid`), 'utf8')), 'SIGKILL');
  } catch {
    // Gone already.
  }
} else {
  // ps, rm and the rest: nothing to do.
}
