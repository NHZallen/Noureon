// The tidy of the notes on this page (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.7; the running is src/data/memory-consolidate.js). It is tried after each
// turn that was read for the memory and does nothing unless it is due (a week since the last one, or twenty notes changed, or the notebook nearly full); the settings can also ask for
// it at once. The program tidies without a model; a cheap model reads the few groups that may say the same or disagree when the person lets the memory learn. It never throws, and
// what it changed is one event that can be undone for thirty days.

import { runConsolidation, pickTidyModel } from '../../../data/memory-consolidate.js';
import { scopedView } from '../memory-notes/scope.js';

let running = false;

/**
 * `store` is the memory store, `getRunner()` gives `runMemoryModel` (or null), `force` ignores the schedule. Resolves the result of runConsolidation (`{ ran, skipped?, ... }`).
 */
export async function tidyNotes({ store: wholeStore, getConfig, getRunner = () => null, models = [], getApiKeyForProvider = () => '', force = false, createId = () => globalThis.crypto.randomUUID(), now = () => new Date().toISOString(), logger = console }) {
  if (running) return { ran: false, skipped: 'busy' };
  running = true;
  try {
    // Only the memory of the account is tidied: the notes of a project that keeps its notes for itself are not looked at together with it (memory-notes/scope.js).
    const store = scopedView(wholeStore, '');
    if (!store?.isLoaded()) return { ran: false, skipped: 'not_loaded' };
    const settings = store.getSettings();
    if (!settings.use || settings.paused) return { ran: false, skipped: 'off' };
    const runner = getRunner();
    const model = typeof runner === 'function' && settings.learn
      ? pickTidyModel({ settingsId: settings.curatorModelId, currentId: getConfig?.()?.memoryModelId || '', models, hasKey: (provider) => Boolean(getApiKeyForProvider(provider)) })
      : null;
    const result = await runConsolidation({
      notes: store.getNotes(),
      settings,
      callModel: model ? (prompt) => runner({ modelId: model.id, prompt }) : null,
      claim: (at) => store.setSettings({ consolidatedAt: at }),
      commit: async ({ notes, events }) => {
        const [first, ...rest] = events;
        await store.commitWrite({ notes, events: first ? [first] : [] });
        for (const event of rest) await store.commitWrite({ notes, events: [event] });
      },
      createId,
      now,
      force
    });
    await store.pruneEvents().catch(() => 0);
    return result;
  } catch (error) {
    logger.warn?.('The memory could not be tidied.', error);
    return { ran: false, skipped: 'failed' };
  } finally {
    running = false;
  }
}
