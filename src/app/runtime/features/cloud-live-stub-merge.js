// The cloud's workspace put together with the one the page holds, when some conversations are stubs (their messages are not in memory;
// docs/superpowers/specs/2026-11-12-on-demand-loading-design.md §5). The sync gives the conversations it touched in full and the others as stubs. A
// conversation the sync did not touch keeps the page's own object (whatever its state: a stub, or whole and maybe changed since the last save); one the
// sync touched is put together by the usual merge, and a stub of the page that it replaces is filled in place, so whoever holds it sees it whole.

import { hydrateInPlace, isStub } from '../kernel/conversation-stub.js';

/**
 * `keepLiveOnly`: the merge is one that keeps the conversations only the page has. `merge(live, remote, protectedConversation)` is the usual merge (cloud-sync-versioning.js `mergeRemoteWorkspaceAppData`). Without stubs on either side it is the merge.
 * Returns what the merge returns, with the conversations of the stubs put back.
 */
export function mergeRemoteWithStubs(live, remote, protectedConversation, merge, { keepLiveOnly = false } = {}) {
  const remoteConversations = remote?.conversations || [];
  const liveConversations = live?.conversations || [];
  const stubsAnywhere = remoteConversations.some(isStub) || liveConversations.some(isStub);
  if (!stubsAnywhere) return merge(live, remote, protectedConversation);

  const liveById = new Map(liveConversations.map(conversation => [conversation?.id, conversation]));
  // Only the conversations that are whole on both sides take part in the merge; a stub of the page has nothing to merge, and a stub of the cloud's side was not touched.
  const merged = merge(
    { ...live, conversations: liveConversations.filter(conversation => !isStub(conversation)) },
    { ...remote, conversations: remoteConversations.filter(conversation => !isStub(conversation)) },
    protectedConversation
  );
  const mergedById = new Map((merged.conversations || []).map(conversation => [conversation?.id, conversation]));
  const used = new Set();
  const conversations = [];
  for (const remoteConversation of remoteConversations) {
    const id = remoteConversation?.id;
    used.add(id);
    if (isStub(remoteConversation)) {
      conversations.push(liveById.get(id) || remoteConversation);
      continue;
    }
    const mergedConversation = mergedById.get(id) || remoteConversation;
    const liveConversation = liveById.get(id);
    // The page held it as a stub: that object is filled with what the merge made of it (not a new object beside it).
    conversations.push(liveConversation && isStub(liveConversation) ? hydrateInPlace(liveConversation, mergedConversation) : mergedConversation);
  }
  // What the merge added that the cloud's list does not have (the open chat that is protected, drafts of this device).
  for (const conversation of merged.conversations || []) if (!used.has(conversation?.id)) conversations.push(conversation);
  // A merge that keeps what only the page has (a record-level update lists only the conversation that changed): its stubs stay too.
  if (keepLiveOnly) for (const conversation of liveConversations) if (isStub(conversation) && !used.has(conversation.id)) conversations.push(conversation);
  return { ...merged, conversations };
}
