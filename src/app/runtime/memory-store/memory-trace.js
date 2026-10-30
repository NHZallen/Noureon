// What the memory did in the reply that is being made (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.10): which notes were given to the model and which
// changes it made, kept for the conversation until the reply is saved, when the message takes them as `memoryUsed` and `memoryUpdated`. A tiny module on its own so that the
// code that saves a message does not need the whole memory. No `window`, no `document`.

const traces = new Map();
const offered = new Map();
const entry = (conversationId) => {
  const key = String(conversationId || '');
  if (!traces.has(key)) traces.set(key, { used: new Set(), events: [] });
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

/** Takes what was kept for the conversation: { used: [note ids], events: [event ids] }; it is empty afterwards. */
export function takeTrace(conversationId) {
  const key = String(conversationId || '');
  const found = traces.get(key);
  traces.delete(key);
  return { used: found ? [...found.used].slice(0, 20) : [], events: found ? found.events.slice(0, 20) : [] };
}
