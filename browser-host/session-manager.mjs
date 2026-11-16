// Which browsers run, who waits, and when one is taken away. Pure logic: Docker comes in as an `adapter`, time as `now`, so everything here is tested without either.
// Design doc §4.2 and §2.3: at most `maxSessions` at once on the machine, one per user, the rest queue; a browser nobody touched for `idleMs` or that has run for
// `taskMaxMs` is stopped. States: queued -> awaiting_profile (only when a login state is coming) -> starting -> ready -> stopping -> stopped, or failed.
//
// adapter: createVolume(s) loadProfile(s, buffer) startContainer(s) waitReady(s, ms) exportProfile(s) -> Buffer stopContainer(s) removeContainer(s) removeVolume(s)
//          action(s, action) -> result   listOrphans() -> { containers: [sessionId], volumes: [sessionId] }      (s = { sessionId, screen, userPassword, adminPassword })
import crypto from 'node:crypto';
import { checkSessionId, checkScreen } from './docker-args.mjs';

export class HostError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
const LIVE = new Set(['awaiting_profile', 'starting', 'ready', 'stopping']); // these hold a place on the machine
const randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex');

export function createSessionManager({ adapter, config = {}, now = Date.now, log = () => {}, makeSecret = () => randomHex(12) }) {
  const cfg = {
    enabled: true, maxSessions: 2, maxQueue: 10, idleMs: 3_600_000, taskMaxMs: 7_200_000, startTimeoutMs: 90_000, profileWaitMs: 60_000,
    collectMs: 600_000, forgetMs: 3_600_000, maxProfileBytes: 150 * 1024 * 1024, ...config
  };
  const sessions = new Map();
  const queue = []; // session ids, oldest first

  const live = () => [...sessions.values()].filter((s) => LIVE.has(s.state));
  const need = (id) => { const s = sessions.get(id); if (!s) throw new HostError(404, 'not_found', 'no such session'); return s; };
  const view = (s) => ({
    sessionId: s.sessionId, state: s.state, position: s.state === 'queued' ? queue.indexOf(s.sessionId) + 1 : undefined,
    createdAt: s.createdAt, startedAt: s.startedAt, lastActionAt: s.lastActionAt, stoppedReason: s.stoppedReason,
    idleMsLeft: s.state === 'ready' ? Math.max(0, cfg.idleMs - (now() - s.lastActionAt)) : undefined,
    taskMsLeft: s.state === 'ready' ? Math.max(0, cfg.taskMaxMs - (now() - s.startedAt)) : undefined,
    profileAvailable: s.state === 'stopped' && s.volumeKept === true, error: s.error
  });

  async function quietly(promise, what, s) { try { await promise; } catch (error) { log({ ev: 'cleanup_failed', what, sessionId: s.sessionId, why: String(error?.message || error).slice(0, 120) }); } }
  async function cleanup(s, { keepVolume = false } = {}) {
    await quietly(adapter.stopContainer(s), 'stop', s);
    await quietly(adapter.removeContainer(s), 'remove', s);
    if (!keepVolume) await quietly(adapter.removeVolume(s), 'volume', s);
  }

  function promote() {
    while (queue.length && live().length < cfg.maxSessions) {
      const s = sessions.get(queue.shift());
      if (s && s.state === 'queued') begin(s);
    }
  }

  function begin(s) {
    if (s.hasProfile) {
      s.state = 'awaiting_profile';
      s.profileDeadline = now() + cfg.profileWaitMs;
    } else {
      void run(s);
    }
  }

  async function run(s) {
    s.state = 'starting';
    try {
      await adapter.createVolume(s);
      if (s.profile) { const archive = s.profile; s.profile = null; await adapter.loadProfile(s, archive); }
      if (s.state !== 'starting') throw new Error('stopped while starting');
      await adapter.startContainer(s);
      await adapter.waitReady(s, cfg.startTimeoutMs);
      if (s.state !== 'starting') throw new Error('stopped while starting');
      s.state = 'ready'; s.startedAt = now(); s.lastActionAt = s.startedAt;
      log({ ev: 'ready', sessionId: s.sessionId });
    } catch (error) {
      if (s.state === 'stopping' || s.state === 'stopped') return;
      s.state = 'failed'; s.error = String(error?.message || error).slice(0, 160); s.endedAt = now(); s.profile = null;
      log({ ev: 'start_failed', sessionId: s.sessionId, why: s.error });
      await cleanup(s);
      promote();
    }
  }

  function create({ sessionId, userId, screen, hasProfile = false }) {
    if (!cfg.enabled) throw new HostError(503, 'disabled', 'browsers are switched off');
    checkSessionId(sessionId);
    if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw new HostError(400, 'bad_request', 'bad user id');
    let size;
    try { size = checkScreen(screen); } catch { throw new HostError(400, 'bad_request', 'bad screen size'); }
    const existing = sessions.get(sessionId);
    if (existing && (LIVE.has(existing.state) || existing.state === 'queued')) throw new HostError(409, 'exists', 'that session already exists');
    for (const other of sessions.values()) {
      if (other.userId === userId && (LIVE.has(other.state) || other.state === 'queued')) throw new HostError(409, 'user_has_session', 'this user already has a browser');
    }
    const s = {
      sessionId, userId, screen: size, hasProfile: Boolean(hasProfile), state: 'queued', createdAt: now(), startedAt: undefined, lastActionAt: undefined,
      userPassword: makeSecret(), adminPassword: makeSecret(), profile: null, volumeKept: false
    };
    if (live().length >= cfg.maxSessions) {
      if (queue.length >= cfg.maxQueue) throw new HostError(429, 'queue_full', 'too many waiting');
      sessions.set(sessionId, s); queue.push(sessionId);
      return view(s);
    }
    sessions.set(sessionId, s);
    begin(s);
    return view(s);
  }

  function putProfile(sessionId, buffer) {
    const s = need(sessionId);
    if (s.state !== 'awaiting_profile') throw new HostError(409, 'not_waiting', 'this session is not waiting for a profile');
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new HostError(400, 'bad_request', 'empty profile');
    if (buffer.length > cfg.maxProfileBytes) throw new HostError(413, 'too_large', 'the profile is too large');
    s.profile = buffer;
    void run(s);
    return view(s);
  }

  const get = (sessionId) => view(need(sessionId));

  async function action(sessionId, request) {
    const s = need(sessionId);
    if (s.state !== 'ready') throw new HostError(409, 'not_ready', `the browser is ${s.state}`);
    s.lastActionAt = now();
    return adapter.action(s, request);
  }

  async function save(sessionId) {
    const s = need(sessionId);
    if (s.state !== 'ready') throw new HostError(409, 'not_ready', `the browser is ${s.state}`);
    s.lastActionAt = now();
    return adapter.exportProfile(s);
  }

  /** Stops one browser. With `save` the login state is packed and returned in the same call and the volume is removed; otherwise it is removed too.
   *  An automatic stop (idle, time) keeps the volume for `collectMs` so the main server can fetch the login state with collectProfile(). */
  async function stop(sessionId, { save: wantSave = false, reason = 'requested', keepVolume = false } = {}) {
    const s = need(sessionId);
    if (s.state === 'queued') { queue.splice(queue.indexOf(sessionId), 1); s.state = 'stopped'; s.stoppedReason = reason; s.endedAt = now(); return { profile: null }; }
    if (s.state === 'stopped' || s.state === 'failed') return { profile: null };
    if (s.state === 'stopping') throw new HostError(409, 'stopping', 'already stopping');
    const wasReady = s.state === 'ready';
    s.state = 'stopping'; s.stoppedReason = reason; s.profile = null;
    await quietly(adapter.stopContainer(s), 'stop', s);        // a clean stop first: Chromium closes its files before they are packed
    await quietly(adapter.removeContainer(s), 'remove', s);
    let profile = null;
    if (wasReady && wantSave) profile = await adapter.exportProfile(s).catch((error) => { log({ ev: 'save_failed', sessionId, why: String(error?.message || error).slice(0, 120) }); return null; });
    const kept = wasReady && keepVolume && !wantSave;
    if (!kept) await quietly(adapter.removeVolume(s), 'volume', s);
    s.volumeKept = kept; s.state = 'stopped'; s.endedAt = now();
    log({ ev: 'stopped', sessionId, reason, kept });
    promote();
    return { profile };
  }

  /** The login state of a browser that was stopped by the clock, fetched once; the volume goes away afterwards. */
  async function collectProfile(sessionId) {
    const s = need(sessionId);
    if (s.state !== 'stopped' || !s.volumeKept) throw new HostError(404, 'no_profile', 'nothing to collect');
    const profile = await adapter.exportProfile(s);
    await quietly(adapter.removeVolume(s), 'volume', s);
    s.volumeKept = false;
    return profile;
  }

  /** Called every few seconds. */
  async function tick() {
    const at = now();
    for (const s of [...sessions.values()]) {
      if (s.state === 'ready') {
        if (at - s.startedAt >= cfg.taskMaxMs) await stop(s.sessionId, { reason: 'task_max', keepVolume: true });
        else if (at - s.lastActionAt >= cfg.idleMs) await stop(s.sessionId, { reason: 'idle', keepVolume: true });
      } else if (s.state === 'awaiting_profile' && at >= s.profileDeadline) {
        s.state = 'failed'; s.error = 'the login state did not arrive in time'; s.endedAt = at;
        await cleanup(s); promote();
      } else if (s.state === 'stopped' && s.volumeKept && at - s.endedAt >= cfg.collectMs) {
        s.volumeKept = false; await quietly(adapter.removeVolume(s), 'volume', s);
      } else if ((s.state === 'stopped' || s.state === 'failed') && !s.volumeKept && at - s.endedAt >= cfg.forgetMs) {
        sessions.delete(s.sessionId);
      }
    }
  }

  /** When the service starts: anything of ours that is still on the machine has no owner any more and is removed. */
  async function recover() {
    const { containers, volumes } = await adapter.listOrphans();
    for (const id of new Set([...containers, ...volumes])) {
      const s = { sessionId: id, screen: { w: 1024, h: 768 } };
      await cleanup(s);
      log({ ev: 'orphan_removed', sessionId: id });
    }
    return containers.length + volumes.length;
  }

  async function shutdown() { for (const s of live()) await stop(s.sessionId, { reason: 'shutdown' }).catch(() => {}); }

  const summary = () => ({ sessions: live().length, queued: queue.length, maxSessions: cfg.maxSessions });
  return { create, putProfile, get, action, save, stop, collectProfile, tick, recover, shutdown, summary, config: cfg };
}
