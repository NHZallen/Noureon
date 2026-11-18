// The part that really runs `docker`: it turns the calls of the session manager into the command lines of docker-args.mjs and runs them with execFile-style
// arguments (no shell). `run` is replaceable, so the tests use a fake. Docker's own words are never passed on to callers beyond the first line of its error.
import { spawn } from 'node:child_process';
import { HostError } from './session-manager.mjs';
import {
  browserRunArgs, sidecarArgs, sidecarServiceArgs, sidecarRemoveArgs, checkActionSize, STDIN_ACTIONS, profileLoadArgs, profileSaveArgs, volumeCreateArgs, holderRunArgs, holderRemoveArgs, ipArgs, screenMmArgs, squareMm, stopArgs, removeArgs, volumeRemoveArgs, healthArgs, orphanContainersArgs, orphanVolumesArgs
} from './docker-args.mjs';

/** Runs `docker <args>`. Resolves { code, stdout: Buffer, stderr: string, truncated }; never rejects. code -1: output too large, -2: timed out, -3: could not run docker. */
export function dockerRun(args, { input, timeoutMs = 60_000, maxBytes = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] }); } catch { resolve({ code: -3, stdout: Buffer.alloc(0), stderr: 'could not run docker', truncated: false }); return; }
    const chunks = []; let size = 0; let stderr = ''; let done = false; let truncated = false;
    const finish = (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, stdout: Buffer.concat(chunks), stderr: stderr.slice(0, 2000), truncated }); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(-2); }, timeoutMs);
    child.stdout.on('data', (chunk) => { size += chunk.length; if (size > maxBytes) { truncated = true; child.kill('SIGKILL'); finish(-1); return; } chunks.push(chunk); });
    child.stderr.on('data', (chunk) => { if (stderr.length < 2000) stderr += chunk.toString('utf8'); });
    child.on('error', () => finish(-3));
    child.on('close', (code) => finish(code ?? -3));
    child.stdin.on('error', () => {});
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}

/**
 * Runs `docker <args>` and keeps it running (the long-lived sidecar): `write(text)` goes to its standard input, `onLine(callback)` gets each line of its standard output, `onExit(callback)` is told
 * (code, stderr) once, `kill()` ends it. An answer line larger than `maxLineBytes` ends it (code -1). It never throws.
 */
export function dockerService(args, { maxLineBytes = 40 * 1024 * 1024 } = {}) {
  let lineCallback = () => {}; let exitCallback = () => {};
  let child; let stderr = ''; let exited = false; let pending = []; let pendingSize = 0;
  const exit = (code) => { if (exited) return; exited = true; exitCallback(code, stderr.slice(0, 2000)); };
  try { child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] }); } catch { child = null; queueMicrotask(() => exit(-3)); }
  if (child) {
    child.stdout.on('data', (chunk) => {
      let start = 0;
      for (let at = chunk.indexOf(10, start); at !== -1; at = chunk.indexOf(10, start)) {
        const whole = Buffer.concat([...pending, chunk.subarray(start, at)]);
        pending = []; pendingSize = 0; start = at + 1;
        if (whole.length > maxLineBytes) { child.kill('SIGKILL'); exit(-1); return; }
        if (whole.length) lineCallback(whole.toString('utf8'));
      }
      if (start < chunk.length) {
        pending.push(chunk.subarray(start)); pendingSize += chunk.length - start;
        if (pendingSize > maxLineBytes) { child.kill('SIGKILL'); exit(-1); }
      }
    });
    child.stderr.on('data', (chunk) => { if (stderr.length < 2000) stderr += chunk.toString('utf8'); });
    child.on('error', () => exit(-3));
    child.on('close', (code) => exit(code ?? -3));
    child.stdin.on('error', () => {});
  }
  return {
    write: (text) => { try { return child ? child.stdin.write(text) : false; } catch { return false; } },
    onLine: (callback) => { lineCallback = callback; },
    onExit: (callback) => { exitCallback = callback; if (exited) callback(-3, stderr); },
    kill: () => { try { child?.kill('SIGKILL'); } catch { /* already gone */ } }
  };
}

const firstLine = (text) => String(text || '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 160) || 'no message';

/**
 * paths: { conf, policies, seccomp, cdpScript } (absolute). options: { network, image, memory, shmSize, pidsLimit, cgroupParent, volumeMb, maxProfileBytes }
 * injected for tests: run, sleep, now
 */
export function createDockerAdapter({ run = dockerRun, paths, options = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, startService = dockerService }) {
  const must = (result, what) => { if (result.code !== 0) throw new Error(`${what} failed: ${firstLine(result.stderr)}`); return result; };
  const tolerant = async (args) => { const r = await run(args, { timeoutMs: 30_000 }); return r.code === 0 || /No such (container|volume)/i.test(r.stderr); };

  // The actions of a browser go through one long-lived sidecar (cdp-service.mjs) when the settings allow (`options.persistentSidecar` and `paths.cdpService`); otherwise each action has a container
  // of its own, as before. The sidecar is started when the browser is ready, ends with the browser, and is started again by the next action when it died.
  const persistent = Boolean(options.persistentSidecar && paths.cdpService);
  const services = new Map();
  function ensureService(s) {
    const known = services.get(s.sessionId);
    if (known) return known;
    const handle = startService(sidecarServiceArgs({ sessionId: s.sessionId, actionsPath: paths.cdpScript, servicePath: paths.cdpService }));
    const service = { handle, pending: new Map(), nextId: 1 };
    handle.onLine((line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      const waiting = service.pending.get(message?.id);
      if (!waiting) return;
      service.pending.delete(message.id); clearTimeout(waiting.timer); waiting.resolve(message.result);
    });
    handle.onExit((code, stderr) => {
      if (services.get(s.sessionId) === service) services.delete(s.sessionId);
      for (const waiting of service.pending.values()) { clearTimeout(waiting.timer); waiting.reject({ code, stderr }); }
      service.pending.clear();
    });
    services.set(s.sessionId, service);
    return service;
  }
  function callService(s, request, timeoutMs) {
    return new Promise((resolve, reject) => {
      const service = ensureService(s);
      const id = service.nextId++;
      const timer = setTimeout(() => { service.pending.delete(id); service.handle.kill(); reject({ code: -2, stderr: '' }); }, timeoutMs);
      service.pending.set(id, { resolve, reject, timer });
      if (service.handle.write(`${JSON.stringify({ id, action: request })}\n`) === false && !services.has(s.sessionId)) { service.pending.delete(id); clearTimeout(timer); reject({ code: -3, stderr: '' }); }
    });
  }
  async function closeService(s) {
    const service = services.get(s.sessionId);
    if (!service) return;
    services.delete(s.sessionId);
    service.handle.kill();
    await tolerant(sidecarRemoveArgs(s.sessionId));
  }

  return {
    async createVolume(s) {
      must(await run(volumeCreateArgs({ sessionId: s.sessionId, sizeMb: options.volumeMb }), { timeoutMs: 20_000 }), 'creating the profile volume');
      // The volume is in memory and lives only while a container has it: the holder keeps it until removeVolume.
      must(await run(holderRunArgs({ sessionId: s.sessionId }), { timeoutMs: 60_000 }), 'keeping the profile volume');
    },
    async loadProfile(s, buffer) { must(await run(profileLoadArgs({ sessionId: s.sessionId }), { input: buffer, timeoutMs: 120_000 }), 'unpacking the login state'); },
    async startContainer(s) {
      must(await run(browserRunArgs({
        sessionId: s.sessionId, screen: s.screen, userPassword: s.userPassword, adminPassword: s.adminPassword,
        live: s.live ? { apiToken: s.live.apiToken, udpPort: s.live.udpPort, publicIp: s.live.publicIp, bindIp: s.live.bindIp } : undefined,
        confPath: paths.conf, policiesPath: paths.policies, seccompPath: paths.seccomp,
        network: options.network, image: options.image, memory: options.memory, shmSize: options.shmSize, pidsLimit: options.pidsLimit, cgroupParent: options.cgroupParent
      }), { timeoutMs: 60_000 }), 'starting the browser');
    },
    async waitReady(s, timeoutMs) {
      const deadline = now() + timeoutMs;
      for (;;) {
        const r = await run(healthArgs(s.sessionId), { timeoutMs: 10_000 });
        const text = r.stdout.toString('utf8').trim();
        if (/^running (healthy|nohealth)$/.test(text)) return;
        if (/^(exited|dead|removing)/.test(text)) throw new Error('the browser stopped while starting');
        if (now() >= deadline) throw new Error('the browser did not become ready in time');
        await sleep(250);
      }
    },
    /** Starts the long-lived sidecar of a browser that is ready, so that the first action does not wait for it (an error is not a failure: the first action starts it again). */
    prepareActions(s) { if (persistent) { try { ensureService(s); } catch { /* the first action tries again */ } } },
    /** The container's address on the isolated network. */
    async containerIp(s) {
      const r = must(await run(ipArgs(s.sessionId), { timeoutMs: 10_000 }), 'finding the browser address');
      const ip = r.stdout.toString('utf8').trim();
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error('the browser has no address');
      return ip;
    },
    /** Square pixels on the screen (see screenMmArgs); never throws: { ok, why?, px?, mm? }, `why` a short fixed text with no page content. */
    async squarePixels(s, screen) {
      let args; let want;
      try { args = screenMmArgs({ sessionId: s.sessionId, screen }); want = squareMm(screen); } catch { return { ok: false, why: 'bad screen size' }; }
      const r = await run(args, { timeoutMs: 10_000 });
      if (r.code !== 0) return { ok: false, why: r.code === -2 ? 'no answer in 10 s' : `exit ${r.code}` };
      const n = r.stdout.toString('utf8').trim().split(/\s+/).map(Number);
      if (n.length !== 4 || !n.every(Number.isInteger)) return { ok: false, why: 'nothing read back' };
      const px = { w: n[0], h: n[1] }; const mm = { w: n[2], h: n[3] };
      return mm.w === want.w && mm.h === want.h ? { ok: true, px, mm } : { ok: false, why: `read back ${mm.w}x${mm.h} mm, wanted ${want.w}x${want.h}`, px, mm };
    },
    async exportProfile(s) {
      const r = await run(profileSaveArgs({ sessionId: s.sessionId }), { timeoutMs: 120_000, maxBytes: options.maxProfileBytes ?? 150 * 1024 * 1024 });
      if (r.truncated) throw new HostError(413, 'too_large', 'the login state is too large');
      must(r, 'packing the login state');
      // A real profile is hundreds of kilobytes (the browser writes many files at its first start); a few dozen bytes is an empty folder, and must never replace a login state that was kept.
      if (r.stdout.length < 2048) throw new HostError(500, 'empty_profile', 'the login state is empty');
      return r.stdout;
    },
    async stopContainer(s) { await closeService(s); if (!(await tolerant(stopArgs(s.sessionId)))) throw new Error('stopping the browser failed'); },
    async removeContainer(s) { await closeService(s); if (!(await tolerant(removeArgs(s.sessionId)))) throw new Error('removing the browser failed'); },
    async removeVolume(s) {
      if (!(await tolerant(holderRemoveArgs(s.sessionId)))) throw new Error('removing the profile volume failed');
      if (!(await tolerant(volumeRemoveArgs(s.sessionId)))) throw new Error('removing the profile volume failed');
    },
    async action(s, request) {
      let parsed = null;
      const failed = (code, stderr) => new HostError(502, 'action_failed', `the browser did not answer (${code === -2 ? 'no answer in 60 s' : code === -1 ? 'the answer was too large' : `exit ${code}`}${String(stderr || '').trim() ? `: ${firstLine(stderr)}` : ''})`);
      if (persistent) {
        checkActionSize(request);
        try { parsed = await callService(s, request, 60_000); } catch (failure) { throw failed(failure?.code, failure?.stderr); }
        if (!parsed || typeof parsed !== 'object') throw failed(-3, '');
      } else {
        const secret = STDIN_ACTIONS.includes(request?.type);
        const r = await run(sidecarArgs({ sessionId: s.sessionId, scriptPath: paths.cdpScript, action: request }), { timeoutMs: 60_000, maxBytes: 40 * 1024 * 1024, ...(secret ? { input: Buffer.from(JSON.stringify(request)) } : {}) });
        try { parsed = JSON.parse(r.stdout.toString('utf8').trim().split('\n').pop()); } catch { /* not JSON */ }
        if (!parsed) throw failed(r.code, r.stderr);
      }
      if (!parsed.ok) throw new HostError(400, 'action_failed', String(parsed.error || 'the action failed').slice(0, 300));
      return parsed;
    },
    async listOrphans() {
      const lines = (r) => (r.code === 0 ? r.stdout.toString('utf8').split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean) : []);
      return { containers: lines(await run(orphanContainersArgs())), volumes: lines(await run(orphanVolumesArgs())) };
    }
  };
}
