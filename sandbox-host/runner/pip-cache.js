// The Python tools of the CLI tools (twitter-cli, csvkit, ...): installed once on this machine and kept here, so a reply that uses one does not
// install it again (that was about fifteen seconds every time). A tool is a folder `<package>-<version>` made by `pip install --target`;
// a sandbox sees the whole cache read-only at /opt/pip-cache and is given a small script for each command of the tool that points into
// its folder (session.js, mountPip). The folders hold public software only: nothing of any person is ever put in them.
//
// How a tool gets here: in a container of its own (read-only, no rights, limited memory), which has the network that pip needs and nothing else to speak of,
// from wheels only (`--only-binary :all:`: a wheel is unpacked, no code of the package runs while it is installed). The machine's network (host)
// is used because Docker on it is set not to touch the network rules; the container has no rights and no way to write anything but its one folder. A package with no wheel is
// refused here and installed the old way, inside the sandbox, by the reply that needs it. The cache is kept to a size: the tools nobody has used
// for the longest go first.

import { spawn as nodeSpawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const VERSION = /^\d+(?:\.\d+){0,3}$/;
const COMMAND = /^[A-Za-z0-9._-]{1,60}$/;
const MAX_COMMANDS = 30;
const MARK = '.ok';

export class PipCacheError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'PipCacheError';
    this.code = code;
    this.status = status;
  }
}

/** The folder name of a tool in the cache. */
export const pipToolName = (pkg, version) => `${String(pkg).toLowerCase().replace(/[^a-z0-9.]+/g, '-')}-${version}`;

/** The commands a tool is called by: its own list, else its one command. */
export const pipCommandsOf = (pip) => {
  const list = Array.isArray(pip?.commands) && pip.commands.length ? pip.commands : [pip?.command];
  return [...new Set(list.filter((name) => typeof name === 'string' && COMMAND.test(name)))].slice(0, MAX_COMMANDS);
};

const sizeOf = (path) => {
  let total = 0;
  const walk = (current) => {
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try {
          total += statSync(full).size;
        } catch {
          // Gone while it was being counted.
        }
      }
    }
  };
  walk(path);
  return total;
};

/**
 * The installer that uses Docker: `install({ package, version, target })` fills the (empty, writable) folder `target`. The container is the image
 * of the sandbox (it has pip) with its entry point set to python.
 */
export function createDockerPipInstaller({ dockerBin = 'docker', image, owner = '65534:65534', spawn = nodeSpawn, timeoutMs = 240_000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  return ({ package: pkg, version, target }) => new Promise((resolve, reject) => {
    const name = `nsb-pip-${randomBytes(6).toString('hex')}`;
    const args = [
      // The machine's own network: Docker here is set not to touch the network rules, so a container on its own network would have none (the images
      // are built the same way). Only pip runs in it, and only unpacks wheels.
      'run', '--rm', '--name', name, '--network', 'host',
      '--user', owner, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--pids-limit', '256', '--memory', '1g', '--memory-swap', '1g', '--cpus', '2',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=512m',
      '-e', 'HOME=/tmp', '-e', 'PIP_DISABLE_PIP_VERSION_CHECK=1', '-e', 'PIP_NO_INPUT=1',
      '-v', `${target}:/target:rw`,
      '--entrypoint', 'python', image,
      '-m', 'pip', 'install', '--quiet', '--no-input', '--no-cache-dir', '--only-binary', ':all:', '--target', '/target', `${pkg}==${version}`
    ];
    const child = spawn(dockerBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-1500); });
    const timer = setTimer(() => {
      try {
        spawn(dockerBin, ['kill', name], { stdio: 'ignore' });
      } catch {
        // Already gone.
      }
      reject(new PipCacheError('install_timeout', 'The tool took too long to install.'));
    }, timeoutMs);
    child.on('error', (error) => { clearTimer(timer); reject(new PipCacheError('install_failed', String(error.message || error).slice(0, 200))); });
    child.on('exit', (code) => {
      clearTimer(timer);
      if (code === 0) resolve();
      else reject(new PipCacheError('install_failed', (stderr.trim().split('\n').filter(Boolean).pop() || `pip exited with code ${code}`).slice(0, 240)));
    });
  });
}

export function createPipCache({ dir, maxBytes = 3 * 1024 * 1024 * 1024, install, now = Date.now, idleMs = 10 * 60_000, log = () => {} }) {
  const inflight = new Map();

  const touch = (path) => {
    try {
      const at = new Date(now());
      utimesSync(join(path, MARK), at, at);
    } catch {
      // A tool that is being removed.
    }
  };

  /** Removes what is over the size, the tools unused for longest first (never one used in the last `idleMs`, nor `keep`), and left-over partial installs. */
  function trim(keep) {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      return;
    }
    const tools = [];
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.name.includes('.part-')) {
        // A partial install of an earlier run (a crash): gone once it is old enough not to be one being made.
        try {
          if (now() - statSync(path).mtimeMs > 3_600_000) rmSync(path, { recursive: true, force: true });
        } catch {
          // Gone.
        }
        continue;
      }
      let usedAt = 0;
      try {
        usedAt = statSync(join(path, MARK)).mtimeMs;
      } catch {
        // No mark: not a finished tool.
      }
      tools.push({ name: entry.name, path, usedAt, size: sizeOf(path) });
    }
    let total = tools.reduce((sum, tool) => sum + tool.size, 0);
    for (const tool of tools.sort((a, b) => a.usedAt - b.usedAt)) {
      if (total <= maxBytes) break;
      if (tool.name === keep || now() - tool.usedAt < idleMs || inflight.has(tool.name)) continue;
      rmSync(tool.path, { recursive: true, force: true });
      total -= tool.size;
      log('pip_cache_evicted', { tool: tool.name, bytes: tool.size });
    }
  }

  /**
   * The tool `{ package, version, command, commands }` as a folder of the cache: installed when this machine does not have it yet. Resolves
   * { name, path }. Throws a PipCacheError when it cannot be had (the reply then installs it itself).
   */
  async function ensure(pip) {
    const pkg = String(pip?.package || '');
    const version = String(pip?.version || '');
    const commands = pipCommandsOf(pip);
    if (!PACKAGE.test(pkg) || !VERSION.test(version) || !commands.length) throw new PipCacheError('bad_request', 'The tool is not valid.', 400);
    const name = pipToolName(pkg, version);
    const path = join(dir, name);
    mkdirSync(dir, { recursive: true });
    if (existsSync(join(path, MARK))) {
      touch(path);
      return { name, path };
    }
    if (inflight.has(name)) return inflight.get(name);
    const work = (async () => {
      const part = join(dir, `${name}.part-${process.pid}-${now()}`);
      try {
        // Written by the container's user, moved into place by the runner.
        mkdirSync(part, { recursive: true });
        chmodSync(part, 0o777);
        await install({ package: pkg, version, target: part });
        if (!existsSync(join(part, 'bin', commands[0]))) throw new PipCacheError('no_program', `The installed tool has no "${commands[0]}" command.`);
        chmodSync(part, 0o755);
        writeFileSync(join(part, MARK), `${new Date(now()).toISOString()}\n`);
        touch(part);
        rmSync(path, { recursive: true, force: true });
        renameSync(part, path);
        log('pip_cached', { tool: name });
        trim(name);
        return { name, path };
      } finally {
        rmSync(part, { recursive: true, force: true });
        inflight.delete(name);
      }
    })();
    inflight.set(name, work);
    return work;
  }

  return { ensure, trim };
}
