// The curator on this page (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.5): after a reply, for a model that has no memory tools, a small model reads what the person said
// and the program keeps what the check of writes accepts (src/data/memory-curator.js). It waits a moment so the person is not held up, does nothing when learning is off, the chat is
// temporary, or the reply's model wrote its own notes (it had the tools), and never throws: a failure leaves the memory as it was. What it changed is added to the reply's message
// (`memoryUpdated`) and the page is told (`noureon:memory-updated`) so the line under the reply can show it.

import { pickCuratorModel, runCurator } from '../../../data/memory-curator.js';
import { userMessagesOf } from './page-memory-loader.js';
import { toolsOffered } from './memory-trace.js';
import { announceMemoryUpdated } from '../../ui/memory-notes/memory-events.js';
import { tidyNotes } from './page-tidy.js';
import { getPageVectors } from './memory-ref.js';
import { scopedView } from '../memory-notes/scope.js';
import { memoryScopeOf } from '../projects/project-instructions.js';

const DELAY_MS = 2000;

const lastOf = (messages, role) => [...messages].reverse().find((message) => message?.role === role);
const textOf = (message) => (Array.isArray(message?.parts) ? message.parts.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('\n') : '');

async function curateTurn({ conversation, getConfig, getMemory, runMemoryModel, models, getApiKeyForProvider, saveAppData = async () => {}, document = null, createId = () => globalThis.crypto.randomUUID(), now = () => new Date().toISOString(), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), logger = console }) {
  try {
    if (!conversation?.id) return { skipped: 'off' };
    if (conversation.retentionMode === 'ephemeral') return { skipped: 'temporary' };
    if (toolsOffered(conversation.id)) return { skipped: 'wrote_itself' };
    const memory = getMemory();
    const held = await memory?.ready();
    if (!held?.isLoaded()) return { skipped: 'not_loaded' };
    // The notes of a chat of a project that keeps its notes for itself are kept in that project (memory-notes/scope.js).
    const store = scopedView(held, memoryScopeOf(conversation));
    const settings = store.getSettings();
    if (!settings.use || !settings.learn || settings.paused) return { skipped: 'learning_off' };
    const users = userMessagesOf(conversation);
    const current = users[users.length - 1];
    if (!current) return { skipped: 'nothing' };
    const current_model = models.find((model) => model.id === conversation.model);
    const model = pickCuratorModel({ settingsId: settings.curatorModelId, current: current_model || models.find((entry) => entry.id === getConfig().memoryModelId), models, hasKey: (provider) => Boolean(getApiKeyForProvider(provider)) });
    if (!model) {
      logger.warn?.('The memory has no model to learn with (no key for any usable one).');
      return { skipped: 'no_model' };
    }
    const excerpt = textOf(lastOf(conversation.messages || [], 'model')).slice(0, 400);
    await wait(DELAY_MS);
    const events = [];
    const result = await runCurator({
      notes: store.getNotes(),
      turn: { messages: users.slice(-6), current, assistantExcerpt: excerpt },
      callModel: (prompt) => runMemoryModel({ modelId: model.id, prompt }),
      commit: (written) => store.commitWrite(written, { conversationId: conversation.id }),
      onWrite: (written) => { if (written.event?.id) events.push(written.event.id); },
      conversationId: conversation.id,
      appliedOps: store.getCursor(conversation.id).appliedOps,
      createId,
      now
    });
    if (events.length) {
      const message = lastOf(conversation.messages || [], 'model');
      if (message) {
        message.metadata = { ...(message.metadata || {}), memoryUpdated: [...new Set([...(message.metadata?.memoryUpdated || []), ...events])].slice(0, 20) };
        await saveAppData();
        announceMemoryUpdated(document, { conversationId: conversation.id, events });
      }
    }
    return result;
  } catch (error) {
    logger.warn?.('The memory could not learn from this turn.', error);
    return { skipped: 'failed' };
  }
}

/** Learns from the turn (above), then tidies the notes if that is due (page-tidy.js): the page is open and in use, which is when a tidy is cheap to make. Never throws. */
export async function curateNotesTurn(args) {
  const result = await curateTurn(args);
  try {
    const store = await args.getMemory()?.ready();
    await tidyNotes({ store, getConfig: args.getConfig, getRunner: () => args.runMemoryModel, models: args.models, getApiKeyForProvider: args.getApiKeyForProvider, logger: args.logger });
    // The new messages of this conversation get their vectors too, if the search by meaning is on.
    void getPageVectors()?.sync();
  } catch (error) {
    (args.logger || console).warn?.('The memory could not be tidied after the turn.', error);
  }
  return result;
}
