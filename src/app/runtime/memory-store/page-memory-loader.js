// The loader of the memory tools for a reply made on this page (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.3, §4.5): the notes of the person, the words of their
// messages in this conversation for the check of a write, and the store that saves what is accepted. It gives nothing (null) when the notes are not chosen, the memory is not
// loaded, the person switched the use of memory off, or the chat may not use memory. Writes are offered only when learning is on and the chat is not temporary.

import { createMemoryLoader } from '../../../data/memory-tool.js';
import { scopedView } from '../memory-notes/scope.js';
import { memoryScopeOf, projectIdOf } from '../projects/project-instructions.js';
import { recordEvent, recordHistory, recordUsed } from './memory-trace.js';

// The messages of the person that go with a reply made by the server (server/protocol.js: maxMemoryMessages, maxMemoryMessageChars).
const MAX_SNAPSHOT_MESSAGES = 12;
const MAX_SNAPSHOT_CHARS = 6000;

const textOf = (message) => (Array.isArray(message?.parts) ? message.parts.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('\n') : '');

/** The messages of the person in a conversation, as the check of a write reads them: { id, role, text, at }. */
export function userMessagesOf(conversation) {
  return (conversation?.messages || [])
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message?.role === 'user')
    .map(({ message, index }) => ({ id: String(message.id || (message.createdAt ? `t:${message.createdAt}` : `i:${index}`)), role: 'user', text: textOf(message), at: message.createdAt || undefined }))
    .filter((entry) => entry.text.trim());
}

/** `canUse(conversation)`: the chat may use memory at all. Resolves `{ make(language) }` (each call gives a new loader for one loop of the reply), or null. */
export async function createPageMemoryTools({ getConfig, getMemory, getHistory = () => null, getVectors = () => null, conversation, createId = () => globalThis.crypto.randomUUID(), now = () => new Date().toISOString() }) {
  if (conversation?.retentionMode === 'ephemeral' && conversation?.memoryAccessEnabled === false) return null;
  const memory = getMemory();
  if (!memory) return null;
  const held = await memory.ready();
  if (!held?.isLoaded()) return null;
  // A chat of a project that keeps its notes for itself reads and writes those only; every other chat leaves them out (memory-notes/scope.js).
  const scopeId = memoryScopeOf(conversation);
  const projectId = projectIdOf(conversation);
  const store = scopedView(held, scopeId);
  const settings = store.getSettings();
  if (!settings.use) return null;
  const canWrite = settings.learn && !settings.paused && conversation?.retentionMode !== 'ephemeral';
  const conversationId = conversation?.id || '';
  const appliedOps = [...store.getCursor(conversationId).appliedOps];
  return {
    canWrite,
    /** What a reply the server makes is told: whether it may write, and the last messages of the person (the server reads the notes themselves from the table). */
    snapshot: ({ curator = false } = {}) => ({
      canWrite,
      ...(scopeId ? { scope: scopeId } : {}),
      ...(projectId ? { project: projectId } : {}),
      ...(curator ? { curator: true } : {}),
      // A person on a cloud account has their conversations there, so the server can look back through them too; with the vectors synced it can also search by meaning (with a key for this run only).
      ...(getVectors()?.canSync?.() ? { history: true } : {}),
      ...(getVectors()?.embeddingAccess?.() ? { vector: { provider: getVectors().embeddingAccess().provider }, embeddingKey: getVectors().embeddingAccess().key } : {}),
      messages: userMessagesOf(conversation).slice(-MAX_SNAPSHOT_MESSAGES).map((message) => ({ id: message.id, text: message.text.slice(0, MAX_SNAPSHOT_CHARS), ...(message.at ? { at: message.at } : {}) }))
    }),
    make: (language) => createMemoryLoader({
      getNotes: () => store.getNotes(),
      getContext: () => ({ conversationId, messages: userMessagesOf(conversation), appliedOps }),
      commit: (result) => store.commitWrite(result, { conversationId }),
      canWrite,
      onUsed: ({ ids }) => {
        recordUsed(conversationId, ids);
        // The notes the model looked up count as used (the list in the settings says when).
        void memory.markUsed(ids);
      },
      onWrite: ({ event }) => recordEvent(conversationId, event?.id),
      // The past conversations (history index on this page): the search then takes a scope. The conversation being written is left out.
      searchHistory: getHistory() ? async (query, limit) => {
        const hits = await (getHistory().lookupHybrid || getHistory().lookup).call(getHistory(), query, limit, { excludeConversationId: conversationId, scopeId, projectId });
        // The conversations that were looked into stay with the reply (their names, not their words).
        recordHistory(conversationId, (hits || []).map((hit) => ({ id: hit.conversationId, at: hit.at })));
        return hits;
      } : null,
      language,
      createId,
      now
    })
  };
}
