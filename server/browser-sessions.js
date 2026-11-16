// The browsers this server has opened for people, and the login state that goes in and out of them (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §4.4 and §8.1;
// Linear NOU-204, contract v2). The host (server/browser-host-client.js) runs the browsers and never holds a key; this module is the one that
//   - opens a browser for a person: loads their sealed login state, opens it here, hands the plain archive to the host, and waits until the browser is ready;
//   - keeps the login state: the host's archive is sealed and stored every few minutes, and once more when the browser is closed (after the browser has stopped);
//   - notices a browser the host stopped by itself (idle, time limit): collects the login state the host kept for ten minutes, and forgets the session.
// One browser for each person (the host refuses a second as well). The list of open browsers is in memory: after a restart of this server the browsers the host still
// runs are stopped by the host's own idle and time limits, and their login state is lost for that run (the last periodic save stays).

import { randomBytes } from 'node:crypto';

export class BrowserSessionError extends Error {
  constructor(message, code = 'failed') {
    super(message);
    this.name = 'BrowserSessionError';
    this.code = code;
  }
}

const DONE_STATES = new Set(['stopped', 'failed']);

export function createBrowserSessions({ host, profiles, log = () => {}, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), saveEveryMs = 5 * 60_000, sweepEveryMs = 60 * 60_000, tickMs = 30_000, makeId = () => `b${randomBytes(12).toString('hex')}` }) {
  const byId = new Map();
  const byUser = new Map();
  let timer = null;
  let lastSweep = now();

  const forget = (session) => { byId.delete(session.id); if (byUser.get(session.userId) === session.id) byUser.delete(session.userId); };
  const own = (id, userId) => {
    const session = byId.get(String(id || ''));
    if (!session || session.userId !== userId) throw new BrowserSessionError('There is no such browser.', 'not_found');
    return session;
  };
  // Seals and keeps an archive of the host; a failure is told in the log (the login state of before stays) and returned as false.
  async function keep(session, getArchive, why) {
    if (!session.keepLogin) return false;
    try {
      await profiles.save(session.userId, await getArchive());
      session.savedAt = now();
      log('browser_profile_kept', { why });
      return true;
    } catch (error) {
      log('browser_profile_save_failed', { why, code: error?.code || '', status: error?.status || 0 });
      return false;
    }
  }

  return {
    /**
     * Opens a browser for a person: { sessionId, state }. `keepLogin` false starts empty and keeps nothing. Resolves as soon as the host has taken the order (the browser
     * may still be queued or starting: `waitReady`). A person who has a browser already gets that one.
     */
    async open(userId, { screen = { w: 1024, h: 768 }, keepLogin = true, conversationId = '' } = {}) {
      const existing = byUser.get(userId);
      if (existing) return { sessionId: existing, state: 'open', reused: true };
      let loaded = null;
      if (keepLogin) {
        try {
          loaded = await profiles.load(userId);
        } catch (error) {
          // A stored login state that cannot be read is not a reason to have no browser: it starts empty (and the next save replaces the old one).
          log('browser_profile_unreadable', { code: error?.code || '' });
        }
      }
      const id = makeId();
      const session = { id, userId, keepLogin, conversationId: String(conversationId || ''), openedAt: now(), savedAt: now(), pendingClear: loaded?.pendingClear || [] };
      byId.set(id, session);
      byUser.set(userId, id);
      try {
        const answer = await host.create({ sessionId: id, userId, screen, hasProfile: Boolean(loaded) });
        if (loaded) await host.putProfile(id, loaded.archive);
        return { sessionId: id, state: answer?.state || 'starting' };
      } catch (error) {
        forget(session);
        await host.stop(id).catch(() => {});
        throw error;
      }
    },
    /** Waits until the browser is ready (the host may queue it behind others); throws `failed` or `timeout`. */
    async waitReady(id, userId, { timeoutMs = 150_000, pollMs = 1500, onPoll = null, signal = null } = {}) {
      const session = own(id, userId);
      const until = now() + timeoutMs;
      for (;;) {
        if (signal?.aborted) throw new BrowserSessionError('The reply was stopped.', 'aborted');
        const state = await host.get(session.id);
        onPoll?.(state);
        if (state?.state === 'ready') return state;
        if (DONE_STATES.has(state?.state)) { forget(session); throw new BrowserSessionError('The browser could not be started.', 'failed'); }
        if (now() >= until) throw new BrowserSessionError('The browser did not get ready in time.', 'timeout');
        await sleep(pollMs);
      }
    },
    /** One action of the browser (navigate, screenshot, tabs, text). */
    async action(id, userId, action, options) {
      return host.action(own(id, userId).id, action, options);
    },
    // The live screen. Only the person the browser belongs to may look at it, point and type in it, and change its size; the host never sees who is asking.
    async viewer(id, userId) { return host.createViewer(own(id, userId).id); },
    async closeViewer(id, userId, viewerId) { return host.closeViewer(own(id, userId).id, viewerId); },
    async control(id, userId, request) { return host.control(own(id, userId).id, request); },
    async screen(id, userId, ratio) { return host.setScreen(own(id, userId).id, ratio); },
    /** Keeps the login state now (the browser goes on). Resolves whether it was kept. */
    async saveNow(id, userId) {
      const session = own(id, userId);
      return keep(session, () => host.save(session.id), 'now');
    },
    /** Closes a browser: the host stops it and, after it has stopped, packs the login state, which is sealed and kept. Resolves whether the login state was kept. */
    async close(id, userId) {
      const session = own(id, userId);
      forget(session);
      let archive = null;
      try {
        archive = await host.stop(session.id, { save: session.keepLogin });
      } catch (error) {
        if (error?.code !== 'not_found') throw error;
      }
      if (!archive && session.keepLogin) log('browser_close_no_login_state', {});
      return archive ? keep(session, async () => archive, 'close') : false;
    },
    /** One round of upkeep: periodic saves, browsers the host stopped by itself, and (once an hour) the login states nobody used for 14 days. */
    async tick() {
      for (const session of [...byId.values()]) {
        try {
          const state = await host.get(session.id);
          if (DONE_STATES.has(state?.state)) {
            // The host stopped it (idle, time limit, or an error). It keeps the volume for ten minutes so the login state can still be collected.
            await keep(session, () => host.collect(session.id), 'collect');
            forget(session);
          } else if (state?.state === 'ready' && now() - session.savedAt >= saveEveryMs) {
            await keep(session, () => host.save(session.id), 'periodic');
          }
        } catch (error) {
          if (error?.code === 'not_found') forget(session);
          else log('browser_tick_failed', { code: error?.code || '', status: error?.status || 0 });
        }
      }
      if (now() - lastSweep >= sweepEveryMs) {
        lastSweep = now();
        try {
          const removed = await profiles.sweepExpired();
          if (removed) log('browser_profiles_expired', { removed });
        } catch (error) {
          log('browser_profile_sweep_failed', { code: error?.code || '' });
        }
      }
    },
    start() { if (!timer) { timer = setInterval(() => { void this.tick(); }, tickMs); timer.unref?.(); } },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
    /** The browser a person has open now: { sessionId, conversationId } or null. */
    current(userId) {
      const id = byUser.get(userId);
      const session = id ? byId.get(id) : null;
      return session ? { sessionId: session.id, conversationId: session.conversationId } : null;
    },
    /** Closes every browser this server opened (when it stops), keeping the login states. */
    async closeAll() {
      for (const session of [...byId.values()]) await this.close(session.id, session.userId).catch(() => {});
    },
    /** How many browsers are open (for the health view). */
    count: () => byId.size,
    has: (userId) => byUser.has(userId)
  };
}
