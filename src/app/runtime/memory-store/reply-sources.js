// What a reply drew on besides the web, for its sources (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.10): the notes of the memory it was given or looked up
// (`memoryUsed`, the ids kept with the message) and the past conversations it looked into (`memoryHistory`, each { id, title, at }, and `historySourceConversationIds` from the slip).
// The notes are read from the memory as it is now (a note that was deleted since says so); a conversation keeps the name it had, and says when it was deleted. No part of a
// conversation's words is kept. Pure: the page gives the notes and the conversations.

const asIds = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id) : []);

/** The ids of the conversations a reply looked into, with the name and day kept for each: [{ id, title, at }], at most eight. */
export function historyEntriesOf(metadata) {
  const out = new Map();
  for (const item of Array.isArray(metadata?.memoryHistory) ? metadata.memoryHistory : []) {
    const id = typeof item?.id === 'string' ? item.id : '';
    if (id && !out.has(id)) out.set(id, { id, title: String(item.title || ''), at: String(item.at || '') });
  }
  for (const id of asIds(metadata?.historySourceConversationIds)) if (!out.has(id)) out.set(id, { id, title: '', at: '' });
  return [...out.values()].slice(0, 8);
}

/** The files of the project that the model looked into during the reply, as { name } (the names kept with the message, `projectFilesUsed`), at most twenty. */
export const projectFilesOf = (metadata) => [...new Set((Array.isArray(metadata?.projectFilesUsed) ? metadata.projectFilesUsed : []).filter((name) => typeof name === 'string' && name.trim()))].slice(0, 20).map((name) => ({ name: name.slice(0, 200) }));

/** Whether the reply has anything of the memory to show in its sources (without reading the memory). */
export const hasMemorySources = (metadata) => asIds(metadata?.memoryUsed).length > 0 || historyEntriesOf(metadata).length > 0;

/**
 * `{ notes: [{ id, text, kind, standing, gone, usedAt }], conversations: [{ id, title, at, available }], files: [{ name }] }` for a message.
 * `notes`: the notes now; `conversations`: the conversations the page holds ([{ id, title, lastUpdatedAt, deletedAt }]).
 */
export function collectReplySources({ message, notes = [], conversations = [] }) {
  const metadata = message?.metadata || {};
  const byNote = new Map(notes.map((note) => [note.id, note]));
  const byConversation = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  return {
    notes: asIds(metadata.memoryUsed).map((id) => {
      const note = byNote.get(id);
      return !note || note.status !== 'active' ? { id, gone: true } : { id, text: note.text, kind: note.kind, standing: note.standing === true, usedAt: note.lastUsedAt || '' };
    }),
    files: projectFilesOf(metadata),
    conversations: historyEntriesOf(metadata).map((entry) => {
      const now = byConversation.get(entry.id);
      const available = Boolean(now) && !now.deletedAt;
      return { id: entry.id, title: (available ? now.title : '') || entry.title, at: entry.at || (available ? now.lastUpdatedAt || '' : ''), available };
    })
  };
}
