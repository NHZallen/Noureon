// What the memory did in the reply that is being made (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.10): which notes were given to the model and which
// changes it made, kept for the conversation until the reply is saved, when the message takes them as `memoryUsed` and `memoryUpdated`. A tiny module on its own so that the
// code that saves a message does not need the whole memory. No `window`, no `document`.

const traces = new Map();
const offered = new Map();
const entry = (conversationId) => {
  const key = String(conversationId || '');
  if (!traces.has(key)) traces.set(key, { used: new Set(), events: [], history: new Map() });
  return traces.get(key);
};

/** A new reply begins: what was kept from an earlier one that never ended is dropped, and whether the model of this reply has the memory tools is told afresh. */
export const resetTrace = (conversationId, { toolsOffered = false } = {}) => {
  traces.delete(String(conversationId || ''));
  offered.set(String(conversationId || ''), toolsOffered === true);
};
/** Whether the model of the reply being made has the memory tools (the first page says it can look notes up only then). */
export const toolsOffered = (conversationId) => offered.get(String(conversationId || '')) === true;
export const recordUsed = (conversationId, ids) => { for (const id of ids || []) entry(conversationId).used.add(String(id)); };
export const recordEvent = (conversationId, eventId) => { if (eventId && !entry(conversationId).events.includes(eventId)) entry(conversationId).events.push(String(eventId)); };

// The conversations the model looked into, kept as { id, title, at } (the title is read when they are looked into, so that the source still has a name once the conversation is deleted).
// No piece of the text is kept. `setHistoryTitle(fn)` says how to find the title of a conversation.
let titleOf = () => '';
export const setHistoryTitle = (fn) => { titleOf = typeof fn === 'function' ? fn : () => ''; };
export const recordHistory = (conversationId, entries) => {
  const kept = entry(conversationId).history;
  for (const item of entries || []) {
    const id = String(item?.id || item?.conversationId || '');
    if (!id || kept.has(id) || kept.size >= 5) continue;
    kept.set(id, { id, title: String(item?.title || titleOf(id) || '').slice(0, 80), ...(item?.at ? { at: String(item.at).slice(0, 40) } : {}) });
  }
};

/** Takes what was kept for the conversation: { used: [note ids], events: [event ids], history: [{ id, title, at }] }; it is empty afterwards. */
export function takeTrace(conversationId) {
  const key = String(conversationId || '');
  const found = traces.get(key);
  traces.delete(key);
  return { used: found ? [...found.used].slice(0, 20) : [], events: found ? found.events.slice(0, 20) : [], history: found ? [...found.history.values()] : [] };
}
