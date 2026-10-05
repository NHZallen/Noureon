// The sandbox sessions: one container per reply, started when the reply first needs Python and removed when it ends (or when nobody has
// used it for a while). Inside, the program in repl.py keeps the variables between steps. See docker-args.js for how it is started.

import { spawn as nodeSpawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, chownSync, copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { LIMITS } from '../../public/sandbox/protocol.js';
import { containerName, dockerRunArgs } from './docker-args.js';
import { createCliCache } from './cli-cache.js';
import { createDockerPipInstaller, createPipCache, pipCommandsOf } from './pip-cache.js';
import { createNetProxy } from './net-proxy.js';
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

const ASK_ID_SHAPE = /^[A-Za-z0-9-]{8,64}$/;
const DECISIONS = new Set(['once', 'always', 'deny']);
const MAX_NET_RULES = 1000;
/** The person's rules as the proxy takes them: { mode, rules } with only the known words, or null when none were given. */
const cleanNet = (net) => {
  if (!net || typeof net !== 'object' || Array.isArray(net)) return null;
  const rules = {};
  if (net.rules && typeof net.rules === 'object' && !Array.isArray(net.rules)) {
    for (const [host, rule] of Object.entries(net.rules).slice(0, MAX_NET_RULES)) if (rule === 'allow' || rule === 'deny') rules[host] = rule;
  }
  return { mode: net.mode === 'always' ? 'always' : 'new', rules };
};

const CLI_ID = /^[a-z][a-z0-9-]{1,39}$/;
const CLI_FILE = /^[A-Za-z0-9._-]{1,60}$/;
const MAX_CLI_TOOLS = 8;

export function createSessionManager({ config, spawn = nodeSpawn, now = Date.now, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, randomId = () => randomBytes(12).toString('hex'), fetchImpl = fetch, proxyOptions = {}, pipCache = null }) {
  const sessions = new Map();
  const cliCache = createCliCache({ dir: config.cliCacheDir, hosts: config.cliHosts, maxBytes: config.cliMaxBytes, fetchImpl, log });
  // The Python tools, installed once on this machine (and kept to a size): a session sees the whole folder read only (docker-args.js).
  const pips = pipCache || createPipCache({ dir: config.pipCacheDir, maxBytes: config.pipCacheBytes, install: createDockerPipInstaller({ dockerBin: config.dockerBin, image: config.image, owner: config.owner, spawn }), log });
  try {
    mkdirSync(config.pipCacheDir, { recursive: true });
    chmodSync(config.pipCacheDir, 0o755);
  } catch {
    // Docker makes the folder when a container is started.
  }

  const makeDirs = (id) => {
    const root = join(config.dataDir, id);
    const dirs = { root, input: join(root, 'input'), output: join(root, 'output'), cli: join(root, 'cli'), net: join(root, 'net') };
    mkdirSync(dirs.input, { recursive: true });
    mkdirSync(dirs.output, { recursive: true });
    // Held by the runner, read (and run) by the container.
    mkdirSync(dirs.cli, { recursive: true });
    chmodSync(dirs.cli, 0o755);
    // The socket of the session's proxy (and a sign that a question to the person is open) lives here: the runner writes, the container only looks.
    mkdirSync(dirs.net, { recursive: true });
    chmodSync(dirs.net, 0o755);
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

  // The time a step may take does not run while the person is being asked about a site (the question may wait for minutes): the clocks of
  // the steps stop when the first question opens and go on when the last is answered.
  const armClock = (session, entry) => {
    clearTimer(entry.timer);
    entry.timer = null;
    if (!entry.timeoutMs || session.asks.size > 0) return;
    entry.armedAt = Date.now();
    // The program stops itself at its own limit; this is for the one that does not.
    entry.timer = setTimer(() => killContainer(session, 'time-limit'), Math.max(100, entry.timeoutMs + config.killGraceMs - entry.spent));
  };
  const pauseClocks = (session) => {
    for (const entry of session.state?.pending.values() || []) {
      if (!entry.timer) continue;
      clearTimer(entry.timer);
      entry.timer = null;
      entry.spent += Date.now() - entry.armedAt;
    }
  };
  const resumeClocks = (session) => {
    for (const entry of session.state?.pending.values() || []) armClock(session, entry);
  };

  const request = (session, message, { onProgress, timeoutMs }) => new Promise((resolve, reject) => {
    const state = session.state;
    if (!state?.alive) {
      reject(new RunnerError('sandbox_gone', 'The sandbox is not running.', 409));
      return;
    }
    const id = randomId();
    const entry = { onProgress, timeoutMs: timeoutMs || 0, spent: 0, armedAt: 0, timer: null };
    const done = (fn) => (value) => {
      clearTimer(entry.timer);
      fn(value);
    };
    entry.resolve = done(resolve);
    entry.reject = done(reject);
    state.pending.set(id, entry);
    armClock(session, entry);
    state.child.stdin.write(`${JSON.stringify({ ...message, id })}\n`);
  });

  // ----- the network of a session: a proxy of the runner on a socket the container sees (net-proxy.js), and the questions it puts to the person
  const waitingMarker = (session) => join(session.dirs.net, 'waiting');
  const emitNet = (session, payload) => {
    try {
      session.emit?.({ type: 'progress', stage: 'net', ...payload });
    } catch {
      // The step's answer is already closed: nobody is there to hear.
    }
  };
  const settleAsk = (session, id, decision) => {
    const entry = session.asks.get(id);
    if (!entry) return false;
    session.asks.delete(id);
    clearTimer(entry.timer);
    emitNet(session, { event: 'answer', id, decision });
    entry.resolve(decision);
    if (session.asks.size === 0) {
      try {
        rmSync(waitingMarker(session), { force: true });
      } catch {
        // The marker is only a hint to the container.
      }
      resumeClocks(session);
    }
    return true;
  };
  const cancelAsks = (session) => {
    for (const id of [...session.asks.keys()]) settleAsk(session, id, 'timeout');
  };
  /** The question the proxy puts when a program reaches for a site with no rule: told to the step that is running, answered by answerNet. */
  const askPerson = (session, { host, port }) => new Promise((resolve) => {
    // No step is running (a program left in the background): nobody can be asked.
    if (!session.emit) {
      resolve('timeout');
      return;
    }
    const id = randomId();
    const entry = { id, host, port, resolve, timer: setTimer(() => settleAsk(session, id, 'timeout'), config.netAskTimeoutMs) };
    const first = session.asks.size === 0;
    session.asks.set(id, entry);
    if (first) {
      try {
        writeFileSync(waitingMarker(session), '1');
      } catch {
        // The marker is only a hint to the container.
      }
      pauseClocks(session);
    }
    emitNet(session, { event: 'ask', id, host, port, waitMs: config.netAskTimeoutMs });
  });
  /** Tells the program in the container to open its end of the socket (after the container starts, and again if it is started anew). */
  const enableNet = async (session) => {
    await request(session, { type: 'net', on: true }, { timeoutMs: 20_000 });
  };

  /** A container that is not running (killed by a stop or a limit) is started again, empty, before the next step. */
  const ensureRunning = async (session) => {
    if (session.state?.alive) return;
    emptyFolder(session.dirs.output);
    await startContainer(session);
    await request(session, { type: 'init', language: session.language }, { timeoutMs: 20_000 });
    if (session.proxy) await enableNet(session);
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
      const session = { id, language, dirs: makeDirs(id), createdAt: now(), lastUsed: now(), state: null, queue: null, proxy: null, asks: new Map(), emit: null };
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
    async mountCli(id, tools = [], net = null) {
      const session = get(id);
      const policy = cleanNet(net);
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
        // The network: with a policy the session gets its proxy (the person's rules for sites); the container itself still has no network.
        if (policy) {
          if (session.proxy) session.proxy.setPolicy(policy);
          else {
            session.proxy = createNetProxy({ socketPath: join(session.dirs.net, 'p.sock'), policy, ask: (question) => askPerson(session, question), log, ...proxyOptions });
            await session.proxy.listen();
            await ensureRunning(session);
            await enableNet(session);
          }
        }
        return { mounted, network: Boolean(session.proxy) };
      });
    },

    /**
     * Gives the session the Python tools it asks for, from the cache of this machine (installed first when it has not got them yet; this can take
     * a while the first time): [{ id, pip: { package, version, command, commands } }]. A small script for each command of a tool, in /opt/cli, runs
     * the tool from its folder in /opt/pip-cache. Resolves { cached: [ids], failed: [{ id, reason }] }: a tool that could not be had is left to the
     * reply to install itself, inside the sandbox.
     */
    async mountPip(id, tools = []) {
      const session = get(id);
      const list = Array.isArray(tools) ? tools.slice(0, MAX_CLI_TOOLS) : [];
      for (const tool of list) {
        if (!CLI_ID.test(String(tool?.id || '')) || !tool.pip || typeof tool.pip !== 'object') throw new RunnerError('bad_request', 'A tool has no valid id or Python package.', 400);
      }
      // Installed before the session's queue is taken: a long install must not hold up a step of this session.
      const ready = [];
      const failed = [];
      for (const tool of list) {
        try {
          ready.push({ tool, entry: await pips.ensure(tool.pip) });
        } catch (error) {
          if (error?.name !== 'PipCacheError') throw error;
          if (error.code === 'bad_request') throw new RunnerError('bad_request', error.message, 400);
          failed.push({ id: tool.id, reason: error.code, message: String(error.message || '').slice(0, 200) });
        }
      }
      return serialized(session, async () => {
        for (const { tool, entry } of ready) {
          for (const command of pipCommandsOf(tool.pip)) {
            // Only a command the tool has. The script sets the path of the tool's own packages for itself, so two tools never see each other's.
            if (!existsSync(join(entry.path, 'bin', command))) continue;
            const script = `#!/bin/sh\nexport PYTHONPATH="/opt/pip-cache/${entry.name}\${PYTHONPATH:+:$PYTHONPATH}"\nexec "/opt/pip-cache/${entry.name}/bin/${command}" "$@"\n`;
            const target = join(session.dirs.cli, command);
            rmSync(target, { force: true });
            writeFileSync(target, script, { mode: 0o755 });
            chmodSync(target, 0o755);
          }
        }
        return { cached: ready.map(({ tool }) => tool.id), failed };
      });
    },

    /** The person's answer to a question about a site ('once', 'always' or 'deny'). Not queued behind the step that is waiting for it. */
    async answerNet(id, askId, decision) {
      const session = get(id);
      if (!DECISIONS.has(decision) || !ASK_ID_SHAPE.test(String(askId || ''))) throw new RunnerError('bad_request', 'Not a valid answer.', 400);
      return { answered: settleAsk(session, askId, decision) };
    },

    /**
     * Runs a step: Python code, or (`command`) a command line of a CLI tool. `onProgress` hears what it prints as it runs. Resolves what the
     * step printed, its error and its files.
     */
    async run(id, { code, command, env, files, timeoutMs }, onProgress = () => {}) {
      const session = get(id);
      return serialized(session, async () => {
        const limit = Math.max(1000, Math.min(Number(timeoutMs) || 60_000, LIMITS.maxRunTimeoutMs));
        await ensureRunning(session);
        const before = snapshotOutput(session.dirs.output);
        // What the network proxy has to ask the person while the step runs is told through the step's own stream.
        session.emit = onProgress;
        try {
          const message = command === undefined || command === null
            ? { type: 'run', code: String(code || ''), timeoutMs: limit }
            : { type: 'command', command: String(command), env: env && typeof env === 'object' ? env : {}, files: Array.isArray(files) ? files : [], timeoutMs: limit };
          const result = await request(session, message, { onProgress, timeoutMs: limit });
          const output = collectOutput(session.dirs.output, before, { outputFileCount: LIMITS.outputFileCount, outputFileBytes: config.outputFileBytes, outputTotalBytes: config.outputTotalBytes });
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
        } finally {
          // A question still open when the step is over (stopped, out of time) has nobody to answer it any more.
          cancelAsks(session);
          session.emit = null;
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
      cancelAsks(session);
      killContainer(session, 'destroyed');
      void session.proxy?.close().catch(() => {});
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
