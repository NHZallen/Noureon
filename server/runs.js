// The replies the server is running: accepting one, running it in the background, keeping its record alive, stopping it, and
// taking up the ones that lost their process (a restart, an update, a crash). See the design, §3, §6 and §6a.

import { executeReply, ReplyError, scrubMessage } from './executor.js';
import { errorText } from './error-texts.js';
import { createMessageWriter } from './message-writer.js';
import { ERROR_CODES, LIMITS } from './protocol.js';
import { createResearchControls, executeResearch } from './research.js';
import { runStartErrorCode } from './run-store.js';
import { executeVisionCheck, visionFiles } from './vision-check.js';

const HEARTBEAT_MS = 15_000;
// A run whose heartbeat is older than this has no process: the next sweep takes it up.
const STALE_SECONDS = 45;
const SWEEP_MS = 30_000;
const RESTART = Symbol('restart');
// Pages open on the same account (tabs, devices) may watch replies live; not more than this many at once.
const MAX_WATCHERS_PER_USER = 12;
// What a page that joins late is told of the steps of a reply with Python (their events, joined where they follow each other).
const MAX_MIRRORED_STEP_CHARS = 600_000;
// The same for the visual check: its pictures (small slides and sheets) make it larger.
const MAX_MIRRORED_VISION_CHARS = 1_500_000;
// A deep research's activity list, as far back as a page that joins late is told.
const MAX_MIRRORED_ACTIVITY = 300;

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
  // Where Python runs and where the files it makes are kept ({ host, files }, see server/sandbox-client.js and file-store.js), or null.
  sandbox = null,
  // The person's secure credentials for CLI tools (server/cli-credentials.js), or null.
  credentials = null,
  // The visual check that follows a reply with a presentation (server/vision-check.js): whether the server can draw slides, and how.
  vision = { available: async () => false, execute: executeVisionCheck, getKit: async () => null },
  limits = LIMITS,
  fetchImpl = fetch,
  log = () => {},
  now = Date.now,
  execute = executeReply,
  executeDeepResearch = executeResearch,
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

  /** What goes to the log when a run fails: where it went wrong, with no key in it (the person is told only the code). */
  const diagnosis = (error, secrets) => ({
    name: String(error?.name || '').slice(0, 60),
    message: scrubMessage(error?.message, secrets),
    at: scrubMessage(String(error?.stack || '').split('\n').slice(1, 5).map((line) => line.trim()).join(' | '), secrets).slice(0, 300),
    ...(error?.cause ? { cause: scrubMessage(error.cause?.message || error.cause, secrets) } : {})
  });

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
    else if (event.ev) mirrorStepEvent(live, event.ev);
    else if (event.vc) mirrorVisionEvent(live, event.vc);
    else if (event.rs) live.research.state = event.rs;
    else if (event.ra) {
      live.research.activity.push(event.ra);
      if (live.research.activity.length > MAX_MIRRORED_ACTIVITY) live.research.activity.splice(0, live.research.activity.length - MAX_MIRRORED_ACTIVITY);
    }
  };
  // The events of the visual check, kept so that a page that joins late draws the same line. The model's thinking is joined, and so are
  // the small pieces of the Python steps of a redoing (see mirrorStepEvent).
  const mirrorVisionEvent = (live, event) => {
    const events = live.vision.events;
    const last = events[events.length - 1];
    if (last && event.m === 'think' && last.m === 'think') {
      last.a = [`${last.a[0]}${event.a[0]}`];
      live.vision.chars += String(event.a[0]).length;
      return;
    }
    if (last && event.m === 'py' && last.m === 'py') {
      const before = last.a[0];
      const next = event.a[0];
      if (next.type === 'code' && before.type === 'code') {
        live.vision.chars += String(next.text || '').length - String(before.text || '').length;
        last.a = [next];
        return;
      }
      if ((next.type === 'thinking' && before.type === 'thinking' && before.kind === next.kind) || (next.type === 'output' && before.type === 'output' && before.n === next.n && before.stream === next.stream)) {
        before.text = `${before.text || ''}${next.text || ''}`;
        live.vision.chars += String(next.text || '').length;
        return;
      }
    }
    const size = JSON.stringify(event).length;
    if (live.vision.chars + size > MAX_MIRRORED_VISION_CHARS) return;
    live.vision.chars += size;
    events.push({ m: event.m, a: structuredClone(event.a), ...(Number.isFinite(event.t) ? { t: event.t } : {}) });
  };
  // The events of the steps, kept so that a page that joins late can draw the same step list. Neighbours of one kind are joined (the
  // thinking and what the code prints arrive in small pieces, and each version of the program replaces the one before).
  const mirrorStepEvent = (live, event) => {
    const events = live.steps.events;
    const last = events[events.length - 1];
    if (event.type === 'code' && last?.type === 'code') {
      live.steps.chars += String(event.text || '').length - String(last.text || '').length;
      events[events.length - 1] = event;
      return;
    }
    if (last && event.type === 'thinking' && last.type === 'thinking' && last.kind === event.kind) {
      last.text = `${last.text || ''}${event.text || ''}`;
      live.steps.chars += String(event.text || '').length;
      return;
    }
    if (last && event.type === 'output' && last.type === 'output' && last.n === event.n && last.stream === event.stream) {
      last.text = `${last.text || ''}${event.text || ''}`;
      live.steps.chars += String(event.text || '').length;
      return;
    }
    const size = JSON.stringify(event).length;
    // Past the limit a late page misses the rest of the steps; pages that were there all along still get everything.
    if (live.steps.chars + size > MAX_MIRRORED_STEP_CHARS) return;
    live.steps.chars += size;
    events.push({ ...event });
  };
  // What a page that comes in late is given first: the reply as it is now, with the times as they are now.
  const snapshot = (live) => ({
    r: {
      answer: live.answer,
      thought: { text: live.thought.text, kind: live.thought.kind, ended: live.thought.ended, ms: live.thought.ended ? live.thought.ms : (live.thought.first ? now() - live.thought.first : live.thought.ms) },
      sources: live.sources,
      elapsedMs: live.elapsedFrom + (now() - live.elapsedAt),
      ...(live.steps.events.length ? { events: live.steps.events } : {}),
      ...(live.vision.events.length ? { vc: live.vision.events } : {}),
      // A deep research: where it stands and what it has done, and the server's clock (the times in them are the server's).
      ...(live.research.state ? { rs: live.research.state, ra: live.research.activity, serverNow: now() } : {})
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

  async function run({ runId, userId, spec, secrets, resume, decks = new Map() }) {
    const isVision = spec.kind === 'vision';
    const isResearch = spec.kind === 'research';
    // How a person's requests reach a deep research that is running (start, pause, stop and the rest).
    const controls = isResearch ? createResearchControls() : null;
    const controller = new AbortController();
    // How the person's answer to a question about a site gets to the sandbox that asked (the reply sets `answer` when it has one).
    const netControl = { answer: null };
    // The same for the window that asks the person for a login a tool needs (executor.js).
    const credentialControl = { answer: null };
    const live = { answer: '', thought: { text: '', kind: 'model', ended: false, ms: 0, first: null }, sources: [], elapsedFrom: 0, elapsedAt: now(), steps: { events: [], chars: 0 }, vision: { events: [], chars: 0 }, research: { state: null, activity: [] }, subscribers: new Set() };
    active.set(runId, { controller, userId, live, controls, netControl, credentialControl });
    let finalStatus = 'error';
    const writer = createMessageWriter({
      store: db,
      userId,
      conversationId: spec.conversationId,
      messageId: spec.assistantMessageId,
      sequence: spec.sequence,
      metadata: spec.request.messageMetadata || null,
      onError: (error) => log('message_write_failed', { runId, code: error?.code || '', message: scrubMessage(error?.message, secrets).slice(0, 200) }),
      onWritten: (status, attempt) => log('message_written', { runId, status, attempt })
    });
    let beat = null;
    let limit = null;
    let ended = false;
    let visionNext = null;
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
      limit = setTimer(() => abort('time_limit'), isResearch ? limits.maxResearchRunMs : limits.maxRunMs);

      const result = isVision ? await runVisionStage({ runId, userId, spec, secrets, controller, live, decks }) : await (isResearch ? executeDeepResearch : execute)({
        spec,
        secrets,
        signal: controller.signal,
        resume,
        userId,
        ...(isResearch ? { controls } : {}),
        sandboxHost: sandbox?.host || null,
        files: sandbox?.files || null,
        credentials,
        netControl,
        credentialControl,
        // A page is watching: it can take over a reply whose Python was lost.
        watching: () => live.subscribers.size > 0,
        fetchImpl,
        now,
        onUpdate: (parts) => writer.update(parts),
        // Something that went wrong without ending the reply: only the log hears of it.
        onProblem: (what, error) => log(what, { runId, ...diagnosis(error, secrets) }),
        onLive: (event) => {
          applyLive(live, event);
          if (!event.r) fan(live, event);
        },
        onCheckpoint: async (checkpoint) => {
          try {
            await store.saveCheckpoint(runId, checkpoint, { progress: isResearch });
          } catch (error) {
            log('checkpoint_failed', { runId, message: String(error?.message || '').slice(0, 160) });
          }
        }
      });
      if (controller.signal.reason === RESTART) return;
      ended = true;
      if (isVision) {
        // The corrected replies were written as they were made; the run only says how it ended.
        finalStatus = 'complete';
        // How each file ended is kept with the run and in the log: the check leaves no other trace when nothing was corrected.
        log('vision_ended', { runId, outcomes: (result.outcomes || []).join(','), details: JSON.stringify(result.details || []).slice(0, 600) });
        await store.finish(runId, { status: controller.signal.aborted ? 'stopped' : 'done', usage: { checked: result.checked, outcomes: result.outcomes || [], details: result.details || [] } });
        return;
      }
      if (controller.signal.reason === 'time_limit') {
        await writer.finish(result.parts, 'error', { serverError: { code: ERROR_CODES.timeLimit, message: 'The reply took too long.' } });
        await store.finish(runId, { status: 'failed', errorCode: ERROR_CODES.timeLimit, usage: { toolCalls: result.toolCalls } });
        return;
      }
      await writer.finish(result.parts, 'complete');
      finalStatus = 'complete';
      await store.finish(runId, { status: result.status === 'stopped' ? 'stopped' : 'done', usage: { toolCalls: result.toolCalls, elapsedMs: result.run?.elapsedMs } });
      // A reply that wrote a presentation is looked at next, as a run of its own (recorded before the page is told this one is over).
      if (result.status === 'done' && !controller.signal.aborted) visionNext = await planVision({ userId, spec, secrets, result }).catch((error) => {
        log('vision_not_started', { runId, message: String(error?.message || '').slice(0, 160) });
        return null;
      });
    } catch (error) {
      if (controller.signal.reason === RESTART) return;
      const failure = failureOf(error, secrets);
      log('run_failed', { runId, code: failure.code, ...diagnosis(error, secrets) });
      if (isVision) {
        // The check could not be made at all: the page is told, and no reply is written.
        applyLive(live, { vc: { m: 'file-end', a: [{ outcome: 'failed', code: 'failed', reason: scrubMessage(failure.message, secrets) }] } });
        fan(live, { vc: { m: 'file-end', a: [{ outcome: 'failed', code: 'failed', reason: scrubMessage(failure.message, secrets) }] } });
      } else try {
        // A research that failed keeps its plan and what it had found on the card (the error carries the message as it stood).
        await writer.finish(isResearch && Array.isArray(error?.parts) ? error.parts : [{ text: errorText(spec.request.language, failure) }], 'error', { serverError: failure });
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
        fan(live, { done: finalStatus, ...(visionNext ? { vision: visionNext.runId } : {}) });
        closeWatchers(live);
      }
      if (beat) clearRepeating(beat);
      if (limit) clearTimer(limit);
      active.delete(runId);
      if (!ended && controller.signal.reason !== RESTART && !controller.signal.aborted) log('run_left_open', { runId });
      if (visionNext && controller.signal.reason !== RESTART) void run(visionNext);
    }
  }

  // The check of the presentations a reply wrote: a run of its own (its own record, its own key), started with what the reply made.
  async function planVision({ userId, spec, secrets, result }) {
    if (!spec.tools.visionCheck || spec.kind === 'vision' || draining || !(await vision.available())) return null;
    const text = result.parts[0]?.text || '';
    const fileParts = result.parts.filter((part) => part.sandboxFile);
    if (!visionFiles({ spec, text, parts: fileParts }).length) return null;
    const { secrets: _keys, ...own } = spec;
    const visionSpec = {
      kind: 'vision',
      protocol: spec.protocol,
      clientVersion: spec.clientVersion,
      conversationId: spec.conversationId,
      assistantMessageId: crypto.randomUUID(),
      sequence: 0,
      model: spec.model,
      request: { history: own.request.history, currentMessage: own.request.currentMessage, systemInstruction: own.request.systemInstruction, language: own.request.language, ...(own.request.generation ? { generation: own.request.generation } : {}), ...(own.request.reasoningEffort ? { reasoningEffort: own.request.reasoningEffort } : {}) },
      tools: own.tools,
      source: { messageId: spec.assistantMessageId, text, parts: fileParts }
    };
    const { envelope, keyVersion } = vault.seal(secrets, { userId, messageId: visionSpec.assistantMessageId });
    const runId = await store.start({ userId, conversationId: spec.conversationId, messageId: visionSpec.assistantMessageId, model: spec.model, envelope, keyVersion, flags: { kind: 'vision' } });
    try {
      await db.update('server_runs', { id: `eq.${runId}` }, { spec: visionSpec });
    } catch (error) {
      log('spec_save_failed', { runId, message: String(error?.message || '').slice(0, 160) });
    }
    return { runId, userId, spec: visionSpec, secrets, resume: null, decks: result.artifacts?.decks || new Map() };
  }

  async function runVisionStage({ runId, userId, spec, secrets, controller, live, decks }) {
    // Every call says when it happened (ms since the check's run began, the clock a page that joins late is given), so every page draws the
    // same seconds, whenever it joined.
    const began = live.elapsedAt;
    const result = await vision.execute({
      spec,
      secrets,
      signal: controller.signal,
      userId,
      files: sandbox?.files || null,
      sandboxHost: sandbox?.host || null,
      decks,
      getKit: vision.getKit,
      fetchImpl,
      now,
      onProblem: (what, error) => log(what, { runId, ...diagnosis(error, secrets) }),
      onLive: (event) => {
        const stamped = event.vc ? { ...event, vc: { ...event.vc, t: Math.max(0, now() - began) } } : event;
        applyLive(live, stamped);
        fan(live, stamped);
      },
      // A reply that goes after everything in the conversation comes with no sequence: the database takes the next place under its lock (the
      // server may call that function but cannot read the message table).
      writeMessage: async ({ id, parts, metadata }) => {
        await db.rpc('server_upsert_workspace_message', {
          p_user_id: userId,
          p_row: { id, conversation_id: spec.conversationId, role: 'model', parts, status: 'complete', ...(metadata ? { metadata } : {}) }
        });
      }
    });
    return result;
  }

  return {
    get activeCount() { return active.size; },
    get draining() { return draining; },
    /** Whether the server can draw slides, so a reply with a presentation gets its visual check here (asked when a reply is accepted). */
    async visionAvailable() {
      try {
        return Boolean(await vision.available());
      } catch {
        return false;
      }
    },
    /** Whether a reply that runs Python can be taken now: the sandbox host is set and answers (it is not asked more than every so often). */
    async advancedAvailable() {
      if (!sandbox?.host?.configured) return false;
      try {
        return (await sandbox.host.ready()).ok === true;
      } catch {
        return false;
      }
    },

    /** Accepts a reply: seals its keys, records it (the limit and the conversation are checked in the database), and starts it. */
    async start({ userId, spec }) {
      if (draining) throw new RunError(ERROR_CODES.runsUnavailable, 'The server is restarting; try again in a moment.');
      const { secrets, ...rest } = spec;
      const { envelope, keyVersion } = vault.seal(secrets, { userId, messageId: spec.assistantMessageId });
      let runId;
      const research = spec.kind === 'research';
      try {
        runId = await store.start({
          userId,
          conversationId: spec.conversationId,
          messageId: spec.assistantMessageId,
          model: spec.model,
          envelope,
          keyVersion,
          // A deep research may wait a day (paused), so its keys are kept longer.
          ...(research ? { keyTtlMs: limits.researchKeyTtlMs } : {}),
          flags: research ? { kind: 'research' } : spec.tools.visionCheck ? { vision: true } : null
        });
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

    /**
     * A person's request to stop their own reply. Returns whether there was one live. A deep research that is asked to write its report from
     * what it has found (`mode: 'report'`) is told so and goes on; any other stop ends it.
     */
    async stop({ userId, runId, mode = null }) {
      const entry = active.get(runId);
      if (mode === 'report' && entry?.controls && entry.userId === userId) return entry.controls.send('stop', { mode }).ok;
      const found = await store.requestStop({ userId, runId });
      const local = active.get(runId);
      if (local && local.userId === userId && !local.controller.signal.aborted) local.controller.abort('stopped');
      return found;
    },

    get: (args) => store.get(args),

    /**
     * A person's request to a deep research of theirs that is running here: start, hold, release, plan {instruction}, pause, resume.
     * Resolves { ok: true }, or { ok: false, reason }: 'not_running' (not run by this process), 'wrong_phase', 'empty', 'ended'.
     */
    control({ userId, runId, action, payload = {} }) {
      const entry = active.get(runId);
      if (!entry?.controls || entry.userId !== userId) return { ok: false, reason: 'not_running' };
      return entry.controls.send(action, payload);
    },

    /**
     * A person's answer ('once', 'always' or 'deny') to the question a tool's command put about a site, in a reply of theirs that is running here.
     * Resolves { ok: true, answered } (answered: false when the question was no longer open), or { ok: false, reason: 'not_running' }.
     */
    async answerNet({ userId, runId, askId, decision }) {
      const entry = active.get(runId);
      if (!entry || entry.userId !== userId || !entry.netControl.answer) return { ok: false, reason: 'not_running' };
      try {
        const result = await entry.netControl.answer(askId, decision);
        return { ok: true, answered: Boolean(result?.answered) };
      } catch (error) {
        log('net_answer_failed', { runId, message: String(error?.message || '').slice(0, 160) });
        return { ok: false, reason: 'not_running' };
      }
    },

    /**
     * A person's answer ('saved', 'cancel') to the window that asked for a login a tool needs, in a reply of theirs that is running here (the
     * values themselves were saved by the person through the credentials endpoint; they never pass here).
     * Resolves { ok: true, answered } or { ok: false, reason: 'not_running' }.
     */
    async answerCredential({ userId, runId, askId, decision }) {
      const entry = active.get(runId);
      if (!entry || entry.userId !== userId || !entry.credentialControl.answer) return { ok: false, reason: 'not_running' };
      return { ok: true, answered: Boolean(entry.credentialControl.answer(askId, decision)?.answered) };
    },

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
