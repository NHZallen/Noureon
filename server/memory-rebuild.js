// Building the memory from the past conversations on the server (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §15; the reading itself is src/data/memory-rebuild.js, the
// same as the page's), so that it goes on when the page is closed. The page sends the key of the one model that reads (the cheap model of a provider it has a key for); the key lives only in
// this job's memory, is never written anywhere and is dropped when the job ends. The state is written into the person's memory settings (`rebuildJob`), which every page of the person sees;
// a job that stops writing (the server restarted: the key is gone with it) is shown as interrupted after a while and can be started again. One job for a person at a time. The notes are
// only added to (never cleared first: that stays the page's), through the same check of writes as everything else.

import { MODELS } from '../src/app/runtime/shell/model-registry.js';
import { createMemoryModelRunner } from '../src/app/runtime/shell/memory-model-runner.js';
import { normalizeCursor } from '../src/app/runtime/memory-notes/records.js';
import { REBUILD, rebuildFromHistory } from '../src/data/memory-rebuild.js';
import { createModelAccess } from './model-access.js';
import { readConversations } from './memory-history.js';

export const REBUILD_JOB = Object.freeze({ maxMs: 25 * 60_000 });

const isReader = (model) => Boolean(model) && model.category !== 'image_generation' && model.outputModality !== 'image';

export function createRebuildJobs({ memory, db, models = MODELS, fetchImpl = (...args) => globalThis.fetch(...args), now = Date.now, log = () => {}, limits = REBUILD_JOB, createId = () => globalThis.crypto.randomUUID() }) {
  const running = new Map();
  const iso = () => new Date(now()).toISOString();

  async function run({ userId, model, key, language, controller }) {
    const startedAt = iso();
    let state = { status: 'running', done: 0, total: 0, added: 0, startedAt, updatedAt: startedAt, error: '' };
    const write = async (patch, extra = {}) => {
      state = { ...state, ...patch, updatedAt: iso() };
      try {
        await memory.saveSettings(userId, { rebuildJob: state, ...extra });
      } catch (error) {
        log('memory_rebuild_state_failed', { message: String(error?.message || '').slice(0, 120) });
      }
    };
    // The states are written one after the other, in order.
    let queue = Promise.resolve();
    const timer = setTimeout(() => controller.abort(), limits.maxMs);
    timer.unref?.();
    try {
      await write({}, { rebuiltAt: startedAt });
      const spec = { conversationId: '', model: { provider: model.provider, id: model.apiId || model.id, info: model }, request: { language }, tools: { searchProvider: 'tavily', searchDepth: 'basic' }, documents: null };
      const access = createModelAccess({ spec, secrets: { providerKey: key }, fetchImpl, userId, signal: controller.signal });
      const runModel = createMemoryModelRunner({ streamApiCall: access.streamApiCall, models: [model] });
      // The memory of the account is built from the chats outside the projects that keep their notes for themselves.
      const conversations = (await readConversations(db, userId)).filter((conversation) => !conversation.scopeId);
      let loaded = await memory.load(userId, { conversationId: '' });
      const store = {
        getNotes: () => loaded.notes,
        getCursor: (id) => loaded.cursors.get(id) || normalizeCursor(null),
        commitWrite: async (result, { conversationId = '' } = {}) => {
          // Read fresh first: another device or a reply may have changed a note meanwhile (a change that moved on is joined, as everywhere).
          const fresh = await memory.load(userId, { conversationId });
          await memory.saveWrite(userId, { before: fresh, result, conversationId });
          loaded = await memory.load(userId, { conversationId });
        },
        setCursor: async (conversationId, patch) => {
          await memory.setCursor(userId, conversationId, patch);
          loaded = await memory.load(userId, { conversationId });
        },
        // The server only adds to the notes (the page may clear them first).
        clearAll: async () => {}
      };
      const result = await rebuildFromHistory({
        conversations,
        store,
        callModel: (prompt) => runModel({ modelId: model.id, prompt, signal: controller.signal }),
        limit: REBUILD.conversations,
        shouldStop: () => controller.signal.aborted,
        onProgress: (progress) => { queue = queue.then(() => write({ done: progress.done, total: progress.total, added: progress.added })); },
        createId,
        now: iso
      });
      await queue;
      await write({ status: result.error ? 'failed' : result.stopped ? 'stopped' : 'done', done: result.done, total: result.total, added: result.added, error: result.error ? String(result.error).slice(0, 120) : '' });
    } catch (error) {
      log('memory_rebuild_failed', { message: String(error?.message || '').slice(0, 160) });
      await write({ status: 'failed', error: 'server_error' });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** Starts the job for a person. Resolves { ok: true } or { ok: false, code }. The key is held by the job and by nothing else. */
    async start({ userId, modelId, key, language = 'en' }) {
      if (running.has(userId)) return { ok: false, code: 'already_running' };
      const model = models.find((entry) => entry.id === modelId);
      if (!isReader(model)) return { ok: false, code: 'unknown_model' };
      if (typeof key !== 'string' || !key) return { ok: false, code: 'no_key' };
      const settings = (await memory.load(userId, { conversationId: '' })).settings;
      if (!settings.use || !settings.learn || settings.paused) return { ok: false, code: 'memory_off' };
      const controller = new AbortController();
      const job = { controller };
      running.set(userId, job);
      job.done = run({ userId, model, key, language, controller }).finally(() => running.delete(userId));
      return { ok: true };
    },
    /** Asks the job to stop after the conversation it is reading. */
    stop(userId) {
      const job = running.get(userId);
      if (!job) return false;
      job.controller.abort();
      return true;
    },
    isRunning: (userId) => running.has(userId),
    /** Waits for the job of a person to end (for the tests and for a shutdown). */
    async finished(userId) {
      await running.get(userId)?.done;
    }
  };
}
