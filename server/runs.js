// The replies the server is running: accepting one, running it in the background, keeping its record alive, stopping it, and
// taking up the ones that lost their process (a restart, an update, a crash). See the design, §3, §6 and §6a.

import { executeReply, ReplyError, scrubMessage } from './executor.js';
import { errorText } from './error-texts.js';
import { createMessageWriter } from './message-writer.js';
import { ERROR_CODES, LIMITS } from './protocol.js';
import { runStartErrorCode } from './run-store.js';

const HEARTBEAT_MS = 15_000;
// A run whose heartbeat is older than this has no process: the next sweep takes it up.
const STALE_SECONDS = 45;
const SWEEP_MS = 30_000;
const RESTART = Symbol('restart');
// Pages open on the same account (tabs, devices) may watch replies live; not more than this many at once.
const MAX_WATCHERS_PER_USER = 12;

export class RunError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunError';
    this.code = code;
  }
}

export function createRunManager({
  store,
  db,
  vault,
  limits = LIMITS,
  fetchImpl = fetch,
  log = () => {},
  now = Date.now,
  execute = executeReply,
  heartbeatMs = HEARTBEAT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  setRepeating = setInterval,
  clearRepeating = clearInterval
}) {
  const active = new Map();
  const watchers = new Map();
  let draining = false;
  let sweeper = null;

  /** What a person is told when a reply cannot be made: a code and a message with no key in it. */
  const failureOf = (error, secrets) => {
    if (error instanceof ReplyError) return { code: error.code, message: scrubMessage(error.message, secrets) };
    return { code: ERROR_CODES.internal, message: 'The reply could not be made on the server.' };
  };

  // What those watching a reply live are given: every small piece as it comes. The mirror is what a page that comes in late is
  // given first, so it sees the reply as it is now (see executor.js for the events).
  const applyLive = (live, event) => {
    if (event.r) {
      live.answer = String(event.r.answer || '');
      live.thought = { text: String(event.r.thought?.text || ''), kind: event.r.thought?.kind || 'model', ended: Boolean(event.r.thought?.ended), ms: Number(event.r.thought?.ms) || 0, first: null };
      live.sources = Array.isArray(event.r.sources) ? event.r.sources : [];
      live.elapsedFrom = Number(event.r.elapsedMs) || 0;
      live.elapsedAt = now();
    } else if (typeof event.a === 'string') live.answer += event.a;
    else if (typeof event.th === 'string') {
      live.thought.text += event.th;
      live.thought.first ??= now();
      if (event.k) live.thought.kind = event.k;
    } else if (typeof event.te === 'number') {
      live.thought.ended = true;
      live.thought.ms = event.te;
    } else if (Array.isArray(event.src)) live.sources = event.src;
  };
  // What a page that comes in late is given first: the reply as it is now, with the times as they are now.
  const snapshot = (live) => ({
    r: {
      answer: live.answer,
      thought: { text: live.thought.text, kind: live.thought.kind, ended: live.thought.ended, ms: live.thought.ended ? live.thought.ms : (live.thought.first ? now() - live.thought.first : live.thought.ms) },
      sources: live.sources,
      elapsedMs: live.elapsedFrom + (now() - live.elapsedAt)
    }
  });
  const fan = (live, event) => {
    for (const watcher of [...live.subscribers]) {
      try {
        watcher.send(event);
      } catch {
        live.subscribers.delete(watcher);
      }
    }
  };
  const closeWatchers = (live) => {
    for (const watcher of [...live.subscribers]) {
      try {
        watcher.close();
      } catch {
        // Gone already.
      }
    }
    live.subscribers.clear();
  };

  async function run({ runId, userId, spec, secrets, resume }) {
    const controller = new AbortController();
    const live = { answer: '', thought: { text: '', kind: 'model', ended: false, ms: 0, first: null }, sources: [], elapsedFrom: 0, elapsedAt: now(), subscribers: new Set() };
    active.set(runId, { controller, userId, live });
    let finalStatus = 'error';
    const writer = createMessageWriter({
      store: db,
      userId,
      conversationId: spec.conversationId,
      messageId: spec.assistantMessageId,
      sequence: spec.sequence,
      metadata: spec.request.messageMetadata || null,
      onError: (error) => log('message_write_failed', { runId, code: error?.code || '', message: String(error?.message || '').slice(0, 160) })
    });
    let beat = null;
    let limit = null;
    let ended = false;
    const abort = (reason) => {
      if (!controller.signal.aborted) controller.abort(reason);
    };
    try {
      await store.markRunning(runId);
      beat = setRepeating(async () => {
        try {
          if (await store.heartbeat(runId)) abort('stopped');
        } catch (error) {
          log('heartbeat_failed', { runId, message: String(error?.message || '').slice(0, 160) });
        }
      }, heartbeatMs);
      limit = setTimer(() => abort('time_limit'), limits.maxRunMs);

      const result = await execute({
        spec,
        secrets,
        signal: controller.signal,
        resume,
        fetchImpl,
        now,
        onUpdate: (parts) => writer.update(parts),
        onLive: (event) => {
          applyLive(live, event);
          if (!event.r) fan(live, event);
        },
        onCheckpoint: async (checkpoint) => {
          try {
            await store.saveCheckpoint(runId, checkpoint);
          } catch (error) {
            log('checkpoint_failed', { runId, message: String(error?.message || '').slice(0, 160) });
          }
        }
      });
      if (controller.signal.reason === RESTART) return;
      ended = true;
      if (controller.signal.reason === 'time_limit') {
        await writer.finish(result.parts, 'error', { serverError: { code: ERROR_CODES.timeLimit, message: 'The reply took too long.' } });
        await store.finish(runId, { status: 'failed', errorCode: ERROR_CODES.timeLimit, usage: { toolCalls: result.toolCalls } });
        return;
      }
      await writer.finish(result.parts, 'complete');
      finalStatus = 'complete';
      await store.finish(runId, { status: result.status === 'stopped' ? 'stopped' : 'done', usage: { toolCalls: result.toolCalls, elapsedMs: result.run?.elapsedMs } });
    } catch (error) {
      if (controller.signal.reason === RESTART) return;
      const failure = failureOf(error, secrets);
      log('run_failed', { runId, code: failure.code });
      try {
        await writer.finish([{ text: errorText(spec.request.language, failure) }], 'error', { serverError: failure });
      } catch (writeError) {
        log('final_write_failed', { runId, message: String(writeError?.message || '').slice(0, 160) });
      }
      try {
        await store.finish(runId, { status: 'failed', errorCode: failure.code });
      } catch (storeError) {
        log('finish_failed', { runId, message: String(storeError?.message || '').slice(0, 160) });
      }
    } finally {
      // Those watching are told it is over only once the finished message is written, so what they read then is whole.
      if (controller.signal.reason === RESTART) closeWatchers(live);
      else {
        fan(live, { done: finalStatus });
        closeWatchers(live);
      }
      if (beat) clearRepeating(beat);
      if (limit) clearTimer(limit);
      active.delete(runId);
      if (!ended && controller.signal.reason !== RESTART && !controller.signal.aborted) log('run_left_open', { runId });
    }
  }

  return {
    get activeCount() { return active.size; },
    get draining() { return draining; },

    /** Accepts a reply: seals its keys, records it (the limit and the conversation are checked in the database), and starts it. */
    async start({ userId, spec }) {
      if (draining) throw new RunError(ERROR_CODES.runsUnavailable, 'The server is restarting; try again in a moment.');
      const { secrets, ...rest } = spec;
      const { envelope, keyVersion } = vault.seal(secrets, { userId, messageId: spec.assistantMessageId });
      let runId;
      try {
        runId = await store.start({ userId, conversationId: spec.conversationId, messageId: spec.assistantMessageId, model: spec.model, envelope, keyVersion });
      } catch (error) {
        const code = runStartErrorCode(error);
        if (code === ERROR_CODES.internal) log('start_failed', { message: String(error?.message || '').slice(0, 160) });
        throw new RunError(code, code === ERROR_CODES.internal ? 'The reply could not be started.' : String(error.message || code));
      }
      try {
        // What a run needs to be taken up again (everything but the keys).
        await db.update('server_runs', { id: `eq.${runId}` }, { spec: rest });
      } catch (error) {
        log('spec_save_failed', { runId, message: String(error?.message || '').slice(0, 160) });
      }
      void run({ runId, userId, spec: rest, secrets, resume: null });
      return runId;
    },

    /** A person's request to stop their own reply. Returns whether there was one live. */
    async stop({ userId, runId }) {
      const found = await store.requestStop({ userId, runId });
      const local = active.get(runId);
      if (local && local.userId === userId && !local.controller.signal.aborted) local.controller.abort('stopped');
      return found;
    },

    get: (args) => store.get(args),

    /** Whether this person's reply is being made by this process (so it can be watched live). */
    isLive: ({ userId, runId }) => active.get(runId)?.userId === userId,

    /**
     * Watches a reply live: `send(event)` is given the reply as it is now, then every small piece as it comes, then { done }; `close()`
     * when it is over. Returns a function that stops watching, or null (not live here, or too many watchers on the account).
     */
    watch({ userId, runId, send, close }) {
      const entry = active.get(runId);
      if (!entry || entry.userId !== userId) return null;
      if ((watchers.get(userId) || 0) >= MAX_WATCHERS_PER_USER) return null;
      const watcher = { send, close };
      entry.live.subscribers.add(watcher);
      watchers.set(userId, (watchers.get(userId) || 0) + 1);
      send(snapshot(entry.live));
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        entry.live.subscribers.delete(watcher);
        watchers.set(userId, Math.max(0, (watchers.get(userId) || 1) - 1));
      };
    },

    /** Takes up the runs that lost their process; also deletes keys past their time. Run at start and every half minute. */
    async sweep() {
      if (draining) return 0;
      try {
        await store.purgeExpiredKeys();
      } catch (error) {
        log('purge_failed', { message: String(error?.message || '').slice(0, 160) });
      }
      let taken = [];
      try {
        taken = await store.claimStale({ staleSeconds: STALE_SECONDS, maxAttempts: limits.maxResumes, limit: 5 });
      } catch (error) {
        log('claim_failed', { message: String(error?.message || '').slice(0, 160) });
        return 0;
      }
      for (const claimed of Array.isArray(taken) ? taken : []) {
        try {
          const rows = await db.select('server_runs', { filters: { id: `eq.${claimed.id}` }, select: 'spec', limit: 1 });
          const spec = rows?.[0]?.spec;
          if (!spec) throw new Error('no request was kept for this run');
          const secrets = vault.open(claimed.key_envelope, claimed.key_version, { userId: claimed.user_id, messageId: claimed.message_id });
          const checkpoint = claimed.checkpoint && typeof claimed.checkpoint === 'object' ? claimed.checkpoint : null;
          log('run_resumed', { runId: claimed.id, attempts: claimed.attempts, fromCheckpoint: Boolean(checkpoint) });
          void run({ runId: claimed.id, userId: claimed.user_id, spec, secrets, resume: checkpoint });
        } catch (error) {
          log('resume_failed', { runId: claimed.id, message: String(error?.message || '').slice(0, 160) });
          try {
            await store.finish(claimed.id, { status: 'failed', errorCode: ERROR_CODES.serverRestarted });
          } catch {
            // The next sweep tries again.
          }
        }
      }
      return Array.isArray(taken) ? taken.length : 0;
    },

    /** Starts the periodic sweep (and one now). */
    startSweeping() {
      void this.sweep();
      sweeper = setRepeating(() => { void this.sweep(); }, SWEEP_MS);
      sweeper?.unref?.();
    },

    /**
     * The process is ending (an update, a restart): no new replies; the running ones are put down where they are, with their
     * last checkpoint, and handed over at once for the next process to take up.
     */
    async shutdown() {
      draining = true;
      if (sweeper) clearRepeating(sweeper);
      const ids = [...active.keys()];
      for (const [, entry] of active) entry.controller.abort(RESTART);
      if (ids.length) {
        try {
          await store.release(ids);
        } catch (error) {
          log('release_failed', { message: String(error?.message || '').slice(0, 160) });
        }
      }
      return ids.length;
    }
  };
}
