// The tidy of the notes on this page (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.7; the running is src/data/memory-consolidate.js). It is tried after each
// turn that was read for the memory and does nothing unless it is due (a week since the last one, or twenty notes changed, or the notebook nearly full); the settings can also ask for
// it at once. The program tidies without a model; a cheap model reads the few groups that may say the same or disagree when the person lets the memory learn. It never throws, and
// what it changed is one event that can be undone for thirty days.

import { runConsolidation, pickTidyModel } from '../../../data/memory-consolidate.js';
import { memoryProjectName } from '../projects/project-instructions.js';
import { consolidatedAtOf, consolidatedPatch, scopedView, scopesOfNotes } from '../memory-notes/scope.js';

let running = false;

/**
 * `store` is the memory store, `getRunner()` gives `runMemoryModel` (or null), `force` ignores the schedule. Resolves the result of runConsolidation (`{ ran, skipped?, ... }`).
 */
export async function tidyNotes({ store: wholeStore, getConfig, getRunner = () => null, models = [], getApiKeyForProvider = () => '', force = false, isProject = (id) => Boolean(memoryProjectName(id)), createId = () => globalThis.crypto.randomUUID(), now = () => new Date().toISOString(), logger = console }) {
  if (running) return { ran: false, skipped: 'busy' };
  running = true;
  try {
    // Each scope is tidied on its own: the memory of the account, and the notes of every project that keeps its own; a model only ever sees the notes of one of them (memory-notes/scope.js).
    const store = wholeStore;
    if (!store?.isLoaded()) return { ran: false, skipped: 'not_loaded' };
    const settings = store.getSettings();
    if (!settings.use || settings.paused) return { ran: false, skipped: 'off' };
    const runner = getRunner();
    const model = typeof runner === 'function' && settings.learn
      ? pickTidyModel({ settingsId: settings.curatorModelId, currentId: getConfig?.()?.memoryModelId || '', models, hasKey: (provider) => Boolean(getApiKeyForProvider(provider)) })
      : null;
    let result = { ran: false, skipped: 'not_due' };
    for (const scopeId of scopesOfNotes(store.getNotes(), isProject)) {
      const view = scopedView(store, scopeId);
      const done = await runConsolidation({
        notes: view.getNotes(),
        settings: { ...store.getSettings(), consolidatedAt: consolidatedAtOf(store.getSettings(), scopeId) },
        callModel: model ? (prompt) => runner({ modelId: model.id, prompt }) : null,
        claim: (at) => store.setSettings(consolidatedPatch(store.getSettings(), scopeId, at)),
        commit: async ({ notes, events }) => {
          const [first, ...rest] = events;
          await view.commitWrite({ notes, events: first ? [first] : [] });
          for (const event of rest) await view.commitWrite({ notes, events: [event] });
        },
        createId,
        now,
        force
      });
      // The account's own result is the one reported; a project's counts when the account had nothing to do.
      if (!scopeId || (!result.ran && done.ran)) result = done;
    }
    await store.pruneEvents().catch(() => 0);
    return result;
  } catch (error) {
    logger.warn?.('The memory could not be tidied.', error);
    return { ran: false, skipped: 'failed' };
  } finally {
    running = false;
  }
}
