// The sandbox sessions: one container per reply, started when the reply first needs Python and removed when it ends (or when nobody has
// used it for a while). Inside, the program in repl.py keeps the variables between steps. See docker-args.js for how it is started.

import { spawn as nodeSpawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, chownSync, copyFileSync, linkSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { LIMITS } from '../../public/sandbox/protocol.js';
import { containerName, dockerRunArgs } from './docker-args.js';
import { createCliCache } from './cli-cache.js';
import { collectOutput, snapshotOutput } from './output.js';

export class RunnerError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'RunnerError';
    this.code = code;
    this.status = status;
  }
}

/** A name the user's file keeps inside /input: no folders or characters a file system cannot hold, "(2)" when taken. */
export function safeFileName(name, taken = new Set()) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim().replace(/^\.+/, '') || 'file';
  const clipped = base.length > 180 ? base.slice(base.length - 180) : base;
  if (!taken.has(clipped)) return clipped;
  const dot = clipped.lastIndexOf('.');
  const stem = dot > 0 ? clipped.slice(0, dot) : clipped;
  const extension = dot > 0 ? clipped.slice(dot) : '';
  for (let index = 2; ; index += 1) {
    const candidate = `${stem} (${index})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

const emptyFolder = (directory) => {
  try {
    for (const name of readdirSync(directory)) rmSync(join(directory, name), { recursive: true, force: true });
  } catch {
    // Nothing there.
  }
};

const CLI_ID = /^[a-z][a-z0-9-]{1,39}$/;
const CLI_FILE = /^[A-Za-z0-9._-]{1,60}$/;
const MAX_CLI_TOOLS = 8;

export function createSessionManager({ config, spawn = nodeSpawn, now = Date.now, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, randomId = () => randomBytes(12).toString('hex'), fetchImpl = fetch }) {
  const sessions = new Map();
  const cliCache = createCliCache({ dir: config.cliCacheDir, hosts: config.cliHosts, maxBytes: config.cliMaxBytes, fetchImpl, log });

  const makeDirs = (id) => {
    const root = join(config.dataDir, id);
    const dirs = { root, input: join(root, 'input'), output: join(root, 'output'), cli: join(root, 'cli') };
    mkdirSync(dirs.input, { recursive: true });
    mkdirSync(dirs.output, { recursive: true });
    // Held by the runner, read (and run) by the container.
    mkdirSync(dirs.cli, { recursive: true });
    chmodSync(dirs.cli, 0o755);
    // The container's user writes to the output folder and reads the input one.
    try {
      const [uid, gid] = config.owner.split(':').map(Number);
      chownSync(dirs.output, uid, gid);
      chownSync(dirs.input, uid, gid);
    } catch {
      chmodSync(dirs.output, 0o777);
    }
    return dirs;
  };

  /** Starts the container and waits until its program says it is ready. */
  const startContainer = (session) => new Promise((resolve, reject) => {
    const child = spawn(config.dockerBin, dockerRunArgs({ config, sessionId: session.id, dirs: session.dirs, language: session.language }), { stdio: ['pipe', 'pipe', 'pipe'] });
    const state = { child, pending: new Map(), alive: true, exitCode: null, killedBy: null, stderr: '' };
    session.state = state;
    child.stderr.on('data', (chunk) => { state.stderr = (state.stderr + chunk.toString()).slice(-2000); });
    const lines = createInterface({ input: child.stdout });
    let ready = false;
    const timer = setTimer(() => {
      if (!ready) {
        killContainer(session, 'start-timeout');
        reject(new RunnerError('start_failed', 'The sandbox did not start in time.', 503));
      }
    }, config.startTimeoutMs);
    lines.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.type === 'ready' && !ready) {
        ready = true;
        clearTimer(timer);
        resolve();
        return;
      }
      const entry = state.pending.get(message.id);
      if (!entry) return;
      if (message.type === 'progress') entry.onProgress?.(message);
      else if (message.type === 'result') {
        state.pending.delete(message.id);
        entry.resolve(message);
      }
    });
    child.on('error', (error) => {
      state.alive = false;
      clearTimer(timer);
      for (const entry of state.pending.values()) entry.reject(new RunnerError('sandbox_gone', 'The sandbox could not be started.', 503));
      state.pending.clear();
      if (!ready) reject(new RunnerError('start_failed', `The sandbox could not be started (${error.code || 'error'}).`, 503));
    });
    child.on('exit', (code) => {
      state.alive = false;
      state.exitCode = code;
      clearTimer(timer);
      const reason = state.killedBy || (code === 137 ? 'memory' : 'exit');
      for (const entry of state.pending.values()) entry.reject(new RunnerError('sandbox_gone', reason, 200));
      state.pending.clear();
      if (!ready) reject(new RunnerError('start_failed', `The sandbox stopped while starting (${code}). ${state.stderr.trim().split('\n').pop() || ''}`.trim(), 503));
    });
  });

  const killContainer = (session, reason = 'stopped') => {
    const state = session.state;
    if (!state?.alive) return;
    state.killedBy = reason;
    // The container is killed by name (the process of `docker run` then ends too).
    try {
      spawn(config.dockerBin, ['kill', containerName(session.id)], { stdio: 'ignore' }).on('error', () => {});
    } catch {
      // The kill of the child below still ends it.
    }
    try {
      state.child.kill('SIGKILL');
    } catch {
      // Already gone.
    }
  };

  const request = (session, message, { onProgress, timeoutMs }) => new Promise((resolve, reject) => {
    const state = session.state;
    if (!state?.alive) {
      reject(new RunnerError('sandbox_gone', 'The sandbox is not running.', 409));
      return;
    }
    const id = randomId();
    let timer = null;
    const done = (fn) => (value) => {
      clearTimer(timer);
      fn(value);
    };
    state.pending.set(id, { onProgress, resolve: done(resolve), reject: done(reject) });
    if (timeoutMs) {
      // The program stops itself at its own limit; this is for the one that does not.
      timer = setTimer(() => {
        killContainer(session, 'time-limit');
      }, timeoutMs + config.killGraceMs);
    }
    state.child.stdin.write(`${JSON.stringify({ ...message, id })}\n`);
  });

  /** A container that is not running (killed by a stop or a limit) is started again, empty, before the next step. */
  const ensureRunning = async (session) => {
    if (session.state?.alive) return;
    emptyFolder(session.dirs.output);
    await startContainer(session);
    await request(session, { type: 'init', language: session.language }, { timeoutMs: 20_000 });
    session.fresh = true;
  };

  const get = (id) => {
    const session = sessions.get(id);
    if (!session) throw new RunnerError('not_found', 'No such sandbox.', 404);
    session.lastUsed = now();
    return session;
  };

  // One request at a time per session (the steps of a reply are one after the other).
  const serialized = (session, work) => {
    const next = (session.queue || Promise.resolve()).then(work, work);
    session.queue = next.catch(() => {});
    return next;
  };

  const manager = {
    get count() { return sessions.size; },

    async create({ language = 'zh-TW' } = {}) {
      if (sessions.size >= config.maxSessions) throw new RunnerError('busy', 'All sandboxes are in use.', 429);
      const id = randomId();
      const session = { id, language, dirs: makeDirs(id), createdAt: now(), lastUsed: now(), state: null, queue: null };
      sessions.set(id, session);
      try {
        await startContainer(session);
        await request(session, { type: 'init', language }, { timeoutMs: 20_000 });
      } catch (error) {
        await manager.destroy(id);
        throw error;
      }
      return { id };
    },

    /** Replaces the files in /input. Returns the names used and the ones left out for the size limit. */
    async mount(id, files = []) {
      const session = get(id);
      return serialized(session, async () => {
        emptyFolder(session.dirs.input);
        const taken = new Set();
        const mounted = [];
        const skipped = [];
        let total = 0;
        for (const file of files) {
          const bytes = Buffer.from(String(file?.data || ''), 'base64');
          if (total + bytes.byteLength > LIMITS.inputTotalBytes) {
            skipped.push(String(file?.name || ''));
            continue;
          }
          const name = safeFileName(file?.name, taken);
          taken.add(name);
          const path = join(session.dirs.input, name);
          writeFileSync(path, bytes);
          chmodSync(path, 0o644);
          total += bytes.byteLength;
          mounted.push({ name, size: bytes.byteLength });
        }
        return { mounted, skippedInputs: skipped };
      });
    },

    /**
     * Puts the programs of CLI tools in /opt/cli: [{ id, file, url, sha256, size }]. Each is fetched (and checked) when this machine does not
     * have it yet, then linked in under its file name.
     */
    async mountCli(id, tools = []) {
      const session = get(id);
      const list = Array.isArray(tools) ? tools.slice(0, MAX_CLI_TOOLS) : [];
      for (const tool of list) {
        if (!CLI_ID.test(String(tool?.id || '')) || !CLI_FILE.test(String(tool?.file || ''))) throw new RunnerError('bad_request', 'A tool has no valid id or file name.', 400);
      }
      // Fetched before the session's queue is taken: a long download must not hold up a step of this session.
      const paths = [];
      for (const tool of list) {
        try {
          paths.push(await cliCache.ensure({ url: tool.url, sha256: tool.sha256, size: tool.size }));
        } catch (error) {
          if (error?.name === 'CliCacheError') throw new RunnerError(error.code, error.message, error.status);
          throw error;
        }
      }
      return serialized(session, async () => {
        emptyFolder(session.dirs.cli);
        const mounted = [];
        list.forEach((tool, index) => {
          const target = join(session.dirs.cli, tool.file);
          try {
            linkSync(paths[index], target);
          } catch {
            // Another file system than the cache's: a copy.
            copyFileSync(paths[index], target);
          }
          chmodSync(target, 0o755);
          mounted.push({ id: tool.id, file: tool.file });
        });
        return { mounted };
      });
    },

    /**
     * Runs a step: Python code, or (`command`) a command line of a CLI tool. `onProgress` hears what it prints as it runs. Resolves what the
     * step printed, its error and its files.
     */
    async run(id, { code, command, env, timeoutMs }, onProgress = () => {}) {
      const session = get(id);
      return serialized(session, async () => {
        const limit = Math.max(1000, Math.min(Number(timeoutMs) || 60_000, LIMITS.maxRunTimeoutMs));
        await ensureRunning(session);
        const before = snapshotOutput(session.dirs.output);
        try {
          const message = command === undefined || command === null
            ? { type: 'run', code: String(code || ''), timeoutMs: limit }
            : { type: 'command', command: String(command), env: env && typeof env === 'object' ? env : {}, timeoutMs: limit };
          const result = await request(session, message, { onProgress, timeoutMs: limit });
          const output = collectOutput(session.dirs.output, before);
          return { ...result, type: 'result', files: output.files, skippedFiles: output.skipped };
        } catch (error) {
          if (!(error instanceof RunnerError) || error.code !== 'sandbox_gone') throw error;
          // The container ended under the step: a stop, the time limit or the memory limit.
          const reasons = {
            'time-limit': 'The code ran longer than its time limit.',
            memory: 'The code used more memory than a step may.',
            stopped: null
          };
          const stopped = error.message === 'stopped';
          return {
            type: 'result',
            stopped,
            error: stopped ? null : (reasons[error.message] || 'The sandbox stopped while the code was running.'),
            stdout: { text: '', dropped: 0 },
            stderr: { text: '', dropped: 0 },
            files: [],
            skippedFiles: [],
            restarted: true
          };
        }
      });
    },

    /** Starts over for a new reply: no variables, empty /output and /work. */
    async clear(id) {
      const session = get(id);
      return serialized(session, async () => {
        await ensureRunning(session);
        emptyFolder(session.dirs.output);
        await request(session, { type: 'clear' }, { timeoutMs: 20_000 });
        return { cleared: true };
      });
    },

    /** Stops what is running at once (the container is killed; the next step starts a new one). */
    async stop(id) {
      const session = get(id);
      killContainer(session, 'stopped');
      return { stopped: true };
    },

    async destroy(id) {
      const session = sessions.get(id);
      if (!session) return { destroyed: false };
      sessions.delete(id);
      killContainer(session, 'destroyed');
      // Folders go once the container has let go of them.
      setTimer(() => {
        try {
          rmSync(session.dirs.root, { recursive: true, force: true });
        } catch {
          log('cleanup_failed', { id });
        }
      }, 500).unref?.();
      return { destroyed: true };
    },

    /** Removes the sessions nobody uses any more. Run now and then. */
    async sweep() {
      const removed = [];
      for (const session of [...sessions.values()]) {
        if (now() - session.lastUsed > config.idleMs || now() - session.createdAt > config.maxAgeMs) {
          await manager.destroy(session.id);
          removed.push(session.id);
        }
      }
      return removed;
    },

    async shutdown() {
      for (const id of [...sessions.keys()]) await manager.destroy(id);
    }
  };
  return manager;
}
