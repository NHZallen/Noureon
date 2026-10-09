// The Python sandbox as the server reaches it: the runner on the sandbox host (sandbox-host/README.md), over its HTTP interface. It gives
// runSandboxReply the same object the browser's sandbox does (prepare, clear, mount, run, dispose), so the reply is made by the same
// code. Files go over as base64 and come back as bytes; what the code prints is told as it runs.
//
// The secret of the runner is only ever sent to it; it is never in an error message, a log line or anything written to a person.

export class SandboxHostError extends Error {
  constructor(message, { stage = '', code = 'sandbox-load-failed', status = 0 } = {}) {
    super(message);
    this.name = 'SandboxHostError';
    this.stage = stage;
    this.code = code;
    this.status = status;
  }
}

// A step may run for at most two minutes (the runner's own limit); this is the time the server waits for the runner over that.
const RUN_EXTRA_WAIT_MS = 45_000;
const MAX_RUN_MS = 120_000;
const SHORT_CALL_MS = 60_000;
const MOUNT_CALL_MS = 180_000;
// Installing a Python tool on the host the first time (pip-cache.js stops it after four minutes).
const PIP_CALL_MS = 270_000;
// All the host's sandboxes may be in use (it holds a few at a time): a reply waits for one, this long at most.
const BUSY_WAIT_MS = 5 * 60_000;
const BUSY_RETRY_MS = 3000;
// A host lost while a step runs: waited for this long, and the step is made again (this many tries in all).
const RECOVER_WAIT_MS = 6000;
const RECOVER_ATTEMPTS = 3;
// How long what `ready` found is trusted: a host that works, and one that does not (asked again sooner, to notice it is back).
const READY_OK_MS = 30_000;
const READY_FAILED_MS = 10_000;

const bytesOf = (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(0);
};

/** What the runner reports as one file, in the shape the browser's sandbox reports it: { name, size, bytes }. */
const outputFile = (file) => {
  const bytes = Buffer.from(String(file?.data || ''), 'base64');
  return { name: String(file?.name || ''), size: bytes.byteLength, bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
};

export function createSandboxHost({ url, token, fetchImpl = fetch, inputLimitBytes = 100 * 1024 * 1024, language = 'zh-TW', wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now } = {}) {
  const base = String(url || '').replace(/\/+$/, '');
  const configured = Boolean(base && token);

  const headers = (extra = {}) => ({ Authorization: `Bearer ${token}`, ...extra });

  // One call to the runner that answers with JSON.
  async function call(method, path, { body, timeoutMs = SHORT_CALL_MS, signal, stage = '' } = {}) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: headers(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw new SandboxHostError('The Python sandbox could not be reached.', { stage, code: 'sandbox-unreachable' });
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new SandboxHostError(String(data?.error?.message || `The Python sandbox answered ${response.status}.`).slice(0, 200), { stage, code: data?.error?.code || 'sandbox-load-failed', status: response.status });
    }
    return data || {};
  }

  /** Whether the runner answers and takes the secret: it starts a sandbox and removes it at once. Resolves { ok, reason }. */
  async function check() {
    if (!configured) return { ok: false, reason: 'not_configured' };
    try {
      const health = await fetchImpl(`${base}/healthz`, { signal: AbortSignal.timeout(8000) });
      if (!health.ok) return { ok: false, reason: 'unreachable' };
    } catch {
      return { ok: false, reason: 'unreachable' };
    }
    try {
      const made = await call('POST', '/v1/sessions', { body: { language }, timeoutMs: 60_000, stage: 'check' });
      await call('DELETE', `/v1/sessions/${made.id}`, { stage: 'check' }).catch(() => {});
      return { ok: true, reason: '' };
    } catch (error) {
      // Every sandbox in use is a busy host, not a broken one: the reply waits its turn.
      if (error.status === 429) return { ok: true, reason: 'busy' };
      return { ok: false, reason: error.status === 401 || error.status === 403 ? 'refused' : 'failed' };
    }
  }

  // check(), remembered for a short while (and shared by the replies asking at the same time): a reply with Python asks before it is
  // taken, so that when the host is down the browser makes it instead.
  let remembered = null;
  function ready() {
    if (remembered && now() - remembered.at < (remembered.state.ok ? READY_OK_MS : READY_FAILED_MS)) return remembered.promise;
    const promise = check().then((state) => {
      if (remembered?.promise === promise) remembered.state = state;
      return state;
    });
    remembered = { at: now(), state: { ok: true }, promise };
    return promise;
  }

  /** A sandbox for one reply. `onProgress({ stage: 'output', stream, text })` hears what the code prints. */
  function getSandbox({ onProgress = () => {}, language: replyLanguage = language, signal: replySignal } = {}) {
    let id = null;
    let starting = null;
    let stopped = false;
    let mountedFiles = [];
    let mountedCli = [];
    let mountedPip = [];
    let mountedSkills = [];
    let mountedNet = null;

    const ensure = () => {
      starting ||= (async () => {
        const waitingSince = now();
        let made;
        let lost = 0;
        for (;;) {
          try {
            made = await call('POST', '/v1/sessions', { body: { language: replyLanguage }, timeoutMs: 90_000, stage: 'prepare' });
            break;
          } catch (error) {
            if (replySignal?.aborted) throw error;
            // The host cannot be reached for a moment (it restarted): it is waited for a few times.
            if (error.code === 'sandbox-unreachable' && (lost += 1) < RECOVER_ATTEMPTS) {
              await wait(RECOVER_WAIT_MS);
              continue;
            }
            // Every sandbox of the host is in use: wait for one to be free.
            if (error.status !== 429 || now() - waitingSince > BUSY_WAIT_MS) throw error;
            onProgress({ stage: 'runtime' });
            await wait(BUSY_RETRY_MS);
          }
        }
        if (!/^[0-9a-f]{24}$/.test(String(made.id || ''))) throw new SandboxHostError('The Python sandbox gave no id.', { stage: 'prepare' });
        id = made.id;
        return id;
      })();
      starting.catch(() => { starting = null; });
      return starting;
    };

    const sandbox = {
      async prepare() {
        await ensure();
        return {};
      },
      // A new reply starts clean: the container is new, so there is nothing to clear; the call is kept for the same interface.
      async clear() {
        await ensure();
        return call('POST', `/v1/sessions/${id}/clear`, { stage: 'clear' });
      },
      /** Replaces /input with these files: [{ name, type, bytes }]. */
      async mount(files = []) {
        await ensure();
        const prepared = [];
        let total = 0;
        for (const file of files) {
          const bytes = bytesOf(await file.bytes);
          if (total + bytes.byteLength > inputLimitBytes) continue;
          total += bytes.byteLength;
          prepared.push({ name: String(file.name || 'file'), type: String(file.type || ''), data: Buffer.from(bytes).toString('base64') });
        }
        // Kept, to give a new sandbox the same files if the host is lost and the step is made again.
        mountedFiles = prepared;
        return call('POST', `/v1/sessions/${id}/mount`, { body: { files: prepared }, timeoutMs: MOUNT_CALL_MS, stage: 'mount' });
      },
      /**
       * Puts the programs of CLI tools in the sandbox: [{ id, file, url, sha256, size }]. The host fetches (and checks) them; this can take a
       * while the first time.
       */
      async mountCli(tools = [], { net = null } = {}) {
        await ensure();
        mountedCli = tools;
        mountedNet = net;
        return call('POST', `/v1/sessions/${id}/cli`, { body: { tools, ...(net ? { net } : {}) }, timeoutMs: MOUNT_CALL_MS, stage: 'cli' });
      },
      /**
       * Puts the folders of skills in /skills (read only): [{ name, files: [{ path, data (base64) }] }]. They replace what was there, so this is every skill the reply has loaded
       * so far. Kept, to give a new sandbox the same folders if the host is lost and the step is made again.
       */
      async mountSkills(skills = []) {
        await ensure();
        mountedSkills = skills;
        return call('POST', `/v1/sessions/${id}/skills`, { body: { skills }, timeoutMs: MOUNT_CALL_MS, stage: 'skills' });
      },
      /**
       * Gives the sandbox the Python tools it needs, from the host's cache of them (installed there the first time; this can take a while):
       * [{ id, pip: { package, version, command, commands } }]. Resolves { cached: [ids], failed: [{ id, reason }] }.
       */
      async mountPip(tools = []) {
        await ensure();
        const result = await call('POST', `/v1/sessions/${id}/pip`, { body: { tools }, timeoutMs: PIP_CALL_MS, stage: 'pip' });
        // Kept for a new sandbox made in this one's place (the host restarted): its scripts are made again.
        const cached = new Set(Array.isArray(result?.cached) ? result.cached : []);
        mountedPip = [...mountedPip.filter((entry) => !cached.has(entry.id)), ...tools.filter((tool) => cached.has(tool.id))];
        return result;
      },
      /** The person's answer to a question about a site that a running step put (`onProgress` heard it as `stage: 'net'`): 'once', 'always' or 'deny'. */
      async answerNet(askId, decision) {
        if (!id) return { answered: false };
        return call('POST', `/v1/sessions/${id}/net/answer`, { body: { askId, decision }, stage: 'net' });
      },
      /** Runs a command line of a CLI tool (in /output, the tools on the path); resolves what `run` resolves. `env`: what its tools need. */
      async command(commandLine, options = {}) {
        return sandbox.run('', { ...options, command: String(commandLine || '') });
      },
      /**
       * Runs code; resolves what the browser's sandbox resolves ({ stdout, stderr, error, files, elapsedMs, … }), or { stopped: true }. When the
       * host cannot be reached while the step runs (it restarted, the network blinked), it is waited for, a new sandbox is made with the same
       * files, and the step is run again there: `restarted` tells the model that what earlier steps left in variables is gone.
       */
      async run(code, options = {}) {
        for (let attempt = 1; ; attempt += 1) {
          try {
            const result = await sandbox.runStep(code, options);
            return attempt > 1 && !result.stopped ? { ...result, restarted: true } : result;
          } catch (error) {
            const lost = error instanceof SandboxHostError && error.code === 'sandbox-unreachable';
            if (!lost || attempt >= RECOVER_ATTEMPTS || options.signal?.aborted || stopped) throw error;
            await wait(RECOVER_WAIT_MS);
            // A new sandbox on the host (the one that was is gone with it), with the same files.
            id = null;
            starting = null;
            await ensure();
            if (mountedFiles.length) await call('POST', `/v1/sessions/${id}/mount`, { body: { files: mountedFiles }, timeoutMs: MOUNT_CALL_MS, stage: 'mount' });
            if (mountedCli.length || mountedNet) await call('POST', `/v1/sessions/${id}/cli`, { body: { tools: mountedCli, ...(mountedNet ? { net: mountedNet } : {}) }, timeoutMs: MOUNT_CALL_MS, stage: 'cli' });
            if (mountedSkills.length) await call('POST', `/v1/sessions/${id}/skills`, { body: { skills: mountedSkills }, timeoutMs: MOUNT_CALL_MS, stage: 'skills' });
            if (mountedPip.length) await call('POST', `/v1/sessions/${id}/pip`, { body: { tools: mountedPip }, timeoutMs: PIP_CALL_MS, stage: 'pip' });
          }
        }
      },
      /** One attempt at a step (see `run`). */
      async runStep(code, { timeoutMs = 60_000, signal, command, env, files: commandFiles } = {}) {
        await ensure();
        if (signal?.aborted || stopped) return { stopped: true };
        const limit = Math.max(1000, Math.min(Number(timeoutMs) || 60_000, MAX_RUN_MS));
        const controller = new AbortController();
        // The wait for the runner does not run while the person is being asked about a site (the runner stops its own clock then too).
        let timer = null;
        const open = new Set();
        const arm = () => {
          clearTimeout(timer);
          timer = open.size ? null : setTimeout(() => controller.abort(), limit + RUN_EXTRA_WAIT_MS);
        };
        arm();
        const onAbort = () => {
          stopped = true;
          // The runner ends the step and answers; the connection is let go if it does not.
          void call('POST', `/v1/sessions/${id}/stop`, { stage: 'stop' }).catch(() => {});
          setTimeout(() => controller.abort(), 5000).unref?.();
        };
        signal?.addEventListener?.('abort', onAbort, { once: true });
        try {
          let response;
          try {
            response = await fetchImpl(`${base}/v1/sessions/${id}/run`, {
              method: 'POST',
              headers: headers({ 'Content-Type': 'application/json' }),
              body: JSON.stringify(command === undefined ? { code: String(code || ''), timeoutMs: limit } : { command: String(command), env: env || {}, ...(commandFiles?.length ? { files: commandFiles } : {}), timeoutMs: limit }),
              signal: controller.signal
            });
          } catch {
            if (stopped) return { stopped: true };
            throw new SandboxHostError('The Python sandbox could not be reached.', { stage: 'run', code: 'sandbox-unreachable' });
          }
          if (!response.ok || !response.body) {
            const data = await response.json().catch(() => null);
            throw new SandboxHostError(String(data?.error?.message || `The Python sandbox answered ${response.status}.`).slice(0, 200), { stage: 'run', status: response.status });
          }
          let result = null;
          let failure = null;
          const handle = (line) => {
            let message;
            try {
              message = JSON.parse(line);
            } catch {
              return;
            }
            if (message.type === 'progress') {
              if (message.stage === 'net') {
                if (message.event === 'ask') open.add(message.id);
                else if (message.event === 'answer') open.delete(message.id);
                arm();
              }
              onProgress(message);
            }
            else if (message.type === 'result') result = message;
            else if (message.type === 'failure') failure = message;
          };
          try {
            const decoder = new TextDecoder();
            let buffer = '';
            for await (const chunk of response.body) {
              buffer += decoder.decode(chunk, { stream: true });
              for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
                const line = buffer.slice(0, end).trim();
                buffer = buffer.slice(end + 1);
                if (line) handle(line);
              }
            }
            buffer += decoder.decode();
            if (buffer.trim()) handle(buffer.trim());
          } catch {
            if (stopped) return { stopped: true };
            throw new SandboxHostError('The Python sandbox stopped answering.', { stage: 'run', code: 'sandbox-unreachable' });
          }
          if (failure) throw new SandboxHostError(String(failure.message || 'The step could not be run.').slice(0, 200), { stage: 'run', code: failure.code || 'sandbox-load-failed' });
          if (!result) {
            if (stopped) return { stopped: true };
            throw new SandboxHostError('The Python sandbox gave no result.', { stage: 'run', code: 'sandbox-unreachable' });
          }
          if (result.stopped) return { stopped: true };
          return {
            stdout: result.stdout || { text: '', dropped: 0 },
            stderr: result.stderr || { text: '', dropped: 0 },
            error: result.error || '',
            elapsedMs: Number(result.elapsedMs) || 0,
            files: (result.files || []).map(outputFile),
            skippedFiles: result.skippedFiles || [],
            ...(result.restarted ? { restarted: true } : {}),
            ...(result.timedOut ? { timedOut: true } : {}),
            ...(result.crashed ? { crashed: true } : {}),
            ...(result.packageError ? { packageError: result.packageError } : {})
          };
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener?.('abort', onAbort);
        }
      },
      // The reply is over: the container is removed (a reply that gives its sandbox up late is also removed by the runner's own
      // time limit on idle sandboxes).
      async dispose() {
        const current = id;
        id = null;
        starting = null;
        if (current) await call('DELETE', `/v1/sessions/${current}`, { stage: 'dispose' }).catch(() => {});
      }
    };
    return sandbox;
  }

  return { configured, check, ready, getSandbox };
}
