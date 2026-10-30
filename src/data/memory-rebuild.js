// Building the memory again from the old conversations (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9): the newest 30 conversations are chosen and read from the oldest of
// them to the newest (a later thing replaces an earlier one by the time it was said, so the order only helps), each by the curator with the last of the person's messages in it, through the same
// check of writes as everything else (what the person deleted does not come back). It can be stopped, and goes on further back from where it was. Pure orchestration: the model, the store and
// the clock are given. Shared by the page and the tests: no window, no document, no browser storage.

import { runCurator, worthCurating } from './memory-curator.js';

export const REBUILD = Object.freeze({ conversations: 30, userMessages: 12, maxChars: 6000, maxFailuresInARow: 3 });

const textOf = (message) => (Array.isArray(message?.parts) ? message.parts.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('\n') : '');
const eligible = (conversation) => Boolean(conversation?.id) && !conversation.deletedAt && !conversation.isTemporary && conversation.retentionMode !== 'ephemeral';
const messageId = (message, index) => String(message.id || (message.createdAt ? `t:${message.createdAt}` : `i:${index}`));

/** The person's last messages of a conversation as the curator reads them: { messages: [{ id, text, at }], current: { id, text, at } with the messages numbered, oldest first }, or null when there is nothing worth reading. */
export function turnOfConversation(conversation, { userMessages = REBUILD.userMessages, maxChars = REBUILD.maxChars } = {}) {
  const all = (conversation.messages || [])
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message?.role === 'user' && textOf(message).trim())
    .map(({ message, index }) => ({ id: messageId(message, index), text: textOf(message).slice(0, maxChars), at: message.createdAt || undefined }));
  const last = all.slice(-userMessages);
  if (!last.length) return null;
  let used = 0;
  const kept = [];
  for (const entry of [...last].reverse()) {
    if (used + entry.text.length > maxChars && kept.length) break;
    used += entry.text.length;
    kept.unshift(entry);
  }
  const text = kept.map((entry, index) => `${index + 1}. ${entry.text.replace(/\s+/g, ' ').trim()}`).join('\n');
  if (!worthCurating(kept.map((entry) => entry.text).join(' '))) return null;
  const end = kept[kept.length - 1];
  return { messages: kept, current: { id: end.id, text, at: end.at } };
}

/**
 * The conversations to read: the newest first by when they were last written, `skip` of them passed over (the ones already read), `limit` taken; then put in the order they are read, the oldest of them first.
 * Temporary and deleted conversations are not read.
 */
export function pickConversations(conversations, { limit = REBUILD.conversations, skip = 0 } = {}) {
  return (conversations || [])
    .filter(eligible)
    .filter((conversation) => turnOfConversation(conversation))
    .sort((left, right) => String(right.lastUpdatedAt || right.createdAt || '').localeCompare(String(left.lastUpdatedAt || left.createdAt || '')))
    .slice(skip, skip + limit)
    .reverse();
}

/**
 * Reads the old conversations into the memory. `store` is the notes store; `callModel(prompt, conversation)` gives the curator model's text for a conversation (it may pick a model for it, or throw
 * when there is none). `shouldStop()` is asked between conversations. `onProgress({ done, total, conversationId, added, skipped })` after each. With `clearFirst` the notes go first (what the person
 * deleted stays as it was). Resolves { done, total, added, failed, stopped, error? }; a model that fails three times in a row ends it.
 */
export async function rebuildFromHistory({ conversations, store, callModel, limit = REBUILD.conversations, skip = 0, clearFirst = false, shouldStop = () => false, onProgress = () => {}, createId, now = () => new Date().toISOString() }) {
  const chosen = pickConversations(conversations, { limit, skip });
  if (clearFirst) await store.clearAll({ keepTombstones: true });
  let added = 0;
  let done = 0;
  let failed = 0;
  let inARow = 0;
  for (const conversation of chosen) {
    if (shouldStop()) return { done, total: chosen.length, added, failed, stopped: true };
    const turn = turnOfConversation(conversation);
    // Carrying on after a pause: what was read through the same message is not read again.
    if (!clearFirst && store.getCursor(conversation.id).processedThroughMessageId === turn.current.id) {
      done += 1;
      onProgress({ done, total: chosen.length, conversationId: conversation.id, added, skipped: 'already_read' });
      continue;
    }
    const result = await runCurator({
      notes: store.getNotes(),
      turn,
      batch: true,
      callModel: (prompt) => callModel(prompt, conversation),
      commit: (written) => store.commitWrite(written, { conversationId: conversation.id }),
      conversationId: conversation.id,
      appliedOps: store.getCursor(conversation.id).appliedOps,
      createId,
      now
    });
    if (result.skipped === 'model_failed') {
      failed += 1;
      inARow += 1;
      if (inARow >= REBUILD.maxFailuresInARow) return { done, total: chosen.length, added, failed, stopped: false, error: result.error || 'model_failed' };
    } else {
      inARow = 0;
      added += result.applied.length;
      await store.setCursor(conversation.id, { processedThroughMessageId: turn.current.id, processedAt: now() });
    }
    done += 1;
    onProgress({ done, total: chosen.length, conversationId: conversation.id, added, skipped: result.skipped || '' });
  }
  return { done, total: chosen.length, added, failed, stopped: false };
}
