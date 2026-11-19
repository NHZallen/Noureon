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
const TAB_ID = /^[A-Za-z0-9_-]{1,100}$/;
/** The host action for what the person asked with the tabs; anything else is refused. */
export function tabActionOf(request) {
  const op = String(request?.op || '');
  const tabId = typeof request?.tabId === 'string' && TAB_ID.test(request.tabId) ? request.tabId : undefined;
  const url = typeof request?.url === 'string' && request.url.length <= 2000 ? request.url : undefined;
  if (op === 'list') return { type: 'tabs', op: 'list' };
  if (op === 'new') return { type: 'tabs', op: 'new', ...(url ? { url } : {}) };
  if (op === 'close' || op === 'activate' || op === 'reload') {
    if (!tabId) throw new BrowserSessionError('Say which tab.', 'bad_request');
    return { type: 'tabs', op, tabId };
  }
  if (op === 'back') return { type: 'back', ...(tabId ? { tabId } : {}) };
  if (op === 'navigate') {
    if (!url) throw new BrowserSessionError('Give an address.', 'bad_request');
    return { type: 'navigate', url, ...(tabId ? { tabId } : {}) };
  }
  throw new BrowserSessionError('That is not something to do with the tabs.', 'bad_request');
}

const HOLD_GRACE_MS = 60_000;

export function createBrowserSessions({ host, profiles, log = () => {}, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), saveEveryMs = 5 * 60_000, sweepEveryMs = 60 * 60_000, tickMs = 30_000, makeId = () => `b${randomBytes(12).toString('hex')}` }) {
  const byId = new Map();
  const byUser = new Map();
  let timer = null;
  let lastSweep = now();

  // Why the host closed the last browser of a person by itself ('idle', 'task_max'): the card of the next reply says so instead of "not available" (`closedReason`).
  const closedBy = new Map();
  const forget = (session) => { byId.delete(session.id); if (byUser.get(session.userId) === session.id) byUser.delete(session.userId); };
  // The dots are put back on the page (the host is told; nothing waits for the answer).
  const hide = (session) => { try { Promise.resolve(host.action?.(session.id, { type: 'reveal', on: false }, { wait: 15_000 })).catch(() => {}); } catch { /* the dots come back with the next look of the model anyway */ } };
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
      closedBy.delete(userId);
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
    async waitReady(id, userId, { timeoutMs = 150_000, pollMs = 400, onPoll = null, signal = null } = {}) {
      const session = own(id, userId);
      const until = now() + timeoutMs;
      for (;;) {
        if (signal?.aborted) throw new BrowserSessionError('The reply was stopped.', 'aborted');
        const state = await host.get(session.id);
        onPoll?.(state);
        if (state?.state === 'ready') {
          // Sites the person logged out of while no browser was running: their login state goes now, before anything is done in the browser.
          if (session.pendingClear.length) {
            try {
              await host.action(session.id, { type: 'clear-site', sites: session.pendingClear });
              session.pendingClear = [];
              session.cleared = true;
              await profiles.clearPending(session.userId);
            } catch (error) {
              log('browser_clear_failed', { code: error?.code || '', status: error?.status || 0 });
            }
          }
          return state;
        }
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
    async closeViewer(id, userId, viewerId, { reconnecting = false } = {}) {
      const session = own(id, userId);
      if (session.holder && session.holder === viewerId) {
        if (reconnecting) {
          // The stream was lost and a new viewer of the same person comes (it asks for the control again): the browser stays theirs for a minute, so that the model does not go on in between.
          session.holdGraceUntil = now() + HOLD_GRACE_MS;
        } else {
          // The person who held the browser left the screen: the host takes the input back, and so does the model.
          session.holder = null; hide(session);
        }
      }
      return host.closeViewer(session.id, viewerId);
    },
    async control(id, userId, request) {
      const session = own(id, userId);
      const answer = await host.control(session.id, request);
      session.holder = request?.mode === 'user' ? String(request.viewerId || 'viewer') : null;
      session.holdGraceUntil = 0;
      // Given back to the model: what was shown as typed is dots again (a look of the model puts them back first anyway).
      if (!session.holder) hide(session);
      return answer;
    },
    /** The eye of the live screen: shows what is typed into fields that hold a secret as it is typed, and only while the person holds the browser (they ask for the dots again, or give the browser back). */
    async reveal(id, userId, on) {
      const session = own(id, userId);
      const show = on === true && Boolean(session.holder);
      await host.action(session.id, { type: 'reveal', on: show }, { wait: 15_000 });
      return { ok: true, on: show };
    },
    /** True while the person has taken the browser over from the screen (the model waits until it is given back). */
    heldByUser(userId) {
      const session = byId.get(byUser.get(userId));
      // A hold kept for a new viewer that never came (the person left for good): it ends after its minute.
      if (session?.holder && session.holdGraceUntil && now() > session.holdGraceUntil) { session.holder = null; session.holdGraceUntil = 0; hide(session); }
      return Boolean(session?.holder);
    },
    async screen(id, userId, ratio) { return host.setScreen(own(id, userId).id, ratio); },
    /** What the person does with the tabs from the screen (the list, a new tab, switching, closing, reloading, back, an address): only these, only for the owner of the browser. */
    async tabAction(id, userId, request) {
      const action = tabActionOf(request);
      return host.action(own(id, userId).id, action, { wait: 30_000 });
    },
    async cardTicket(id, userId, origin) { return host.cardTicket(own(id, userId).id, origin); },
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
    /** Lets a browser go that was started before it was asked for and never used: nothing was done in it, so nothing is kept (unless sites were logged out in it, then it is closed the ordinary way). */
    async discard(id, userId) {
      const session = own(id, userId);
      if (session.cleared) return this.close(id, userId);
      forget(session);
      await host.stop(session.id, { save: false }).catch(() => {});
      return false;
    },
    /** One round of upkeep: periodic saves, browsers the host stopped by itself, and (once an hour) the login states nobody used for 14 days. */
    async tick() {
      for (const session of [...byId.values()]) {
        try {
          const state = await host.get(session.id);
          if (DONE_STATES.has(state?.state)) {
            // The host stopped it (idle, time limit, or an error). It keeps the volume for ten minutes so the login state can still be collected.
            if (state?.stoppedReason === 'idle' || state?.stoppedReason === 'task_max') closedBy.set(session.userId, { reason: state.stoppedReason, at: now() });
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
    /** For the people in charge: every browser this server opened is closed (the login states are kept); resolves how many. */
    async stopAll() {
      const open = [...byId.values()];
      for (const session of open) await this.close(session.id, session.userId).catch(() => {});
      return open.length;
    },
    /** How many browsers are open (for the health view). */
    count: () => byId.size,
    has: (userId) => byUser.has(userId),
    /**
     * Where the person's browser stands now, for the countdown on the tag of a finished reply: { open, conversationId?, state?, idleMsLeft?, taskMsLeft?, closedReason? }. `closedReason` ('idle', 'task_max')
     * is there when the host closed the last one by itself within the last day. Asks the host once; a host that does not answer says the browser is not known to be open.
     */
    async status(userId) {
      const id = byUser.get(userId);
      const session = id ? byId.get(id) : null;
      if (!session) return { open: false, ...(closedBy.has(userId) && now() - closedBy.get(userId).at < 24 * 3_600_000 ? { closedReason: closedBy.get(userId).reason } : {}) };
      try {
        const state = await host.get(session.id);
        const live = state?.state === 'ready' || state?.state === 'starting' || state?.state === 'queued';
        return {
          open: live, conversationId: session.conversationId || '', state: state?.state || '',
          ...(Number.isFinite(state?.idleMsLeft) ? { idleMsLeft: Math.max(0, Math.round(state.idleMsLeft)) } : {}),
          ...(Number.isFinite(state?.taskMsLeft) ? { taskMsLeft: Math.max(0, Math.round(state.taskMsLeft)) } : {})
        };
      } catch {
        return { open: false };
      }
    },
    /** 'idle' or 'task_max' when the host closed the person's last browser by itself within the last day, else ''. */
    closedReason(userId) {
      const entry = closedBy.get(userId);
      return entry && now() - entry.at < 24 * 3_600_000 ? entry.reason : '';
    }
  };
}
