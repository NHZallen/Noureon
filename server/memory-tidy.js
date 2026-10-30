// The tidy of a person's notes at the end of a reply (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.7; the running is src/data/memory-consolidate.js). When the page is
// closed nobody else will tidy, so the server does it after a reply is written, if it is due: the first layer without a model, and the cheap model of the reply's own provider
// (the only key it holds) for the few groups that may say the same or disagree. It reads the table fresh, claims the time of the tidy first so that a page open at the same moment does
// not start one too, and may not run longer than a few seconds of model time. A failure is the caller's to log; nothing here changes a reply.

import { CONSOLIDATE, pickTidyModel, runConsolidation } from '../src/data/memory-consolidate.js';

/**
 * Returns `tidy()`. `replyModel` is the reply's model, `provider` the provider the server holds a key for, `models` all models, `makeRunner(model)` gives the function that asks a
 * model (`({ modelId, prompt, signal }) => text`), `now()` is the clock in milliseconds.
 */
export function createServerTidy({ memory, userId, replyModel, provider, models, makeRunner, signal, now = Date.now, createId = () => globalThis.crypto.randomUUID() }) {
  return async function tidy() {
    const fresh = await memory.load(userId, { conversationId: '' });
    const settings = fresh.settings;
    if (!settings.use || settings.paused) return null;
    const model = settings.learn ? pickTidyModel({ settingsId: settings.curatorModelId, currentId: replyModel?.id, models, hasKey: (name) => name === provider }) : null;
    const run = model ? makeRunner(model) : null;
    const result = await runConsolidation({
      notes: fresh.notes,
      settings,
      callModel: run ? (prompt) => run({ modelId: model.id, prompt, signal }) : null,
      claim: (at) => memory.saveSettings(userId, { consolidatedAt: at }),
      commit: ({ notes, events }) => memory.saveWrite(userId, { before: fresh, result: { notes, events } }),
      createId,
      now: () => new Date(now()).toISOString(),
      deadlineAt: now() + CONSOLIDATE.serverMs,
      clock: now
    });
    await memory.pruneEvents(userId).catch(() => 0);
    return result;
  };
}
