// The tidy of a person's notes at the end of a reply (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.7; the running is src/data/memory-consolidate.js). When the page is
// closed nobody else will tidy, so the server does it after a reply is written, if it is due: the first layer without a model, and the cheap model of the reply's own provider
// (the only key it holds) for the few groups that may say the same or disagree. It reads the table fresh, claims the time of the tidy first so that a page open at the same moment does
// not start one too, and may not run longer than a few seconds of model time. A failure is the caller's to log; nothing here changes a reply.

import { CONSOLIDATE, pickTidyModel, runConsolidation } from '../src/data/memory-consolidate.js';
import { consolidatedAtOf, consolidatedPatch, scopesOfNotes } from '../src/app/runtime/memory-notes/scope.js';
import { scopedMemory } from './memory-scope.js';

/**
 * Returns `tidy()`. `replyModel` is the reply's model, `provider` the provider the server holds a key for, `models` all models, `makeRunner(model)` gives the function that asks a
 * model (`({ modelId, prompt, signal }) => text`), `now()` is the clock in milliseconds.
 */
export function createServerTidy({ memory, userId, replyModel, provider, models, makeRunner, signal, now = Date.now, createId = () => globalThis.crypto.randomUUID() }) {
  return async function tidy() {
    const everything = await memory.load(userId, { conversationId: '' });
    const settings = everything.settings;
    if (!settings.use || settings.paused) return null;
    const model = settings.learn ? pickTidyModel({ settingsId: settings.curatorModelId, currentId: replyModel?.id, models, hasKey: (name) => name === provider }) : null;
    const run = model ? makeRunner(model) : null;
    // Each scope is tidied on its own (the memory of the account, then every project that keeps its own notes): a model only sees the notes of one of them.
    let result = null;
    // One budget of model time for the whole tidy, however many scopes there are.
    const deadlineAt = now() + CONSOLIDATE.serverMs;
    for (const scopeId of scopesOfNotes(everything.notes)) {
      const view = scopedMemory(memory, scopeId);
      const fresh = await view.load(userId, { conversationId: '' });
      const done = await runConsolidation({
        notes: fresh.notes,
        settings: { ...settings, consolidatedAt: consolidatedAtOf(fresh.settings, scopeId) },
        callModel: run ? (prompt) => run({ modelId: model.id, prompt, signal }) : null,
        claim: async (at) => { await memory.saveSettings(userId, consolidatedPatch(await memory.load(userId, { conversationId: '' }).then((state) => state.settings), scopeId, at)); },
        commit: ({ notes, events }) => view.saveWrite(userId, { before: fresh, result: { notes, events } }),
        createId,
        now: () => new Date(now()).toISOString(),
        deadlineAt,
        clock: now
      });
      if (!scopeId || (!result?.ran && done.ran)) result = done;
      if (signal?.aborted) break;
    }
    await memory.pruneEvents(userId).catch(() => 0);
    return result;
  };
}
