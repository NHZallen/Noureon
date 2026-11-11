// A conversation that is not in memory with its messages: the same object, with what the lists need and no messages
// (docs/superpowers/specs/2026-11-12-on-demand-loading-design.md §3.1). Reading its messages is an error that shows (the array is frozen), not an
// empty chat that looks right; the store refuses to write one; `hydrateInPlace` fills the SAME object (whoever holds it sees the messages) and
// `evictInPlace` empties it again. Pure: no page, no storage.

import { EMPTY_MESSAGES, defaultStubOf, isStub, stubObjectFrom } from './workspace-store-v2.js';

export { EMPTY_MESSAGES, defaultStubOf, isStub, stubObjectFrom };

// What a stub carries besides the fields of the conversation.
const MARKS = ['__stub', '__count', '__flags'];

// Replaces what `target` holds by what `source` holds, keeping the object itself.
function replaceContents(target, source) {
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
  Object.assign(target, source);
  return target;
}

/** Fills a stub with the stored full conversation (normalized by the caller). Returns the same object. */
export function hydrateInPlace(stub, full) {
  if (!isStub(stub)) return stub;
  const next = { ...full };
  for (const key of MARKS) delete next[key];
  return replaceContents(stub, next);
}

/** Empties a conversation back to its stub (the caller made sure it is saved and not in use). Returns the same object. */
export function evictInPlace(conversation, extra = null) {
  if (isStub(conversation)) return conversation;
  return replaceContents(conversation, stubObjectFrom(defaultStubOf(conversation, extra)));
}

/** After a workspace was normalized (which gives every conversation a new list of messages): the stubs get the frozen empty list back. */
export function refreezeStubs(conversations) {
  for (const conversation of conversations || []) if (isStub(conversation)) conversation.messages = EMPTY_MESSAGES;
  return conversations;
}

/** How many messages a conversation has, whether it is whole or a stub (a stub keeps the number it had; its `messages` is empty). */
export const messageCountOf = conversation => (isStub(conversation) ? Number(conversation.__count) || 0 : (Array.isArray(conversation?.messages) ? conversation.messages.length : 0));
