// Branch Chat (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §5.2): a new conversation that starts as a copy of another one up to and including one reply, and goes its own way
// from there. The conversation it came from is never touched. The files of the messages are the same files (the cloud keeps the same bytes once), so a branch costs no space.

/** Parts a branch cannot carry on: a research that was not finished has nobody to run it here (only its finished report comes along). */
const keepPart = (part) => part && !part.researchPlan;

/** The messages of the conversation up to and including the one at `index` (not the ones put in the trash), as new messages. */
export function branchMessages(conversation, index, { uuid = () => crypto.randomUUID() } = {}) {
  const taken = [];
  const source = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let position = 0; position <= index && position < source.length; position += 1) {
    const message = source[position];
    if (!message || message.deletedAt) continue;
    const parts = (message.parts || []).filter(keepPart).map((part) => structuredClone(part));
    if (!parts.length) continue;
    const metadata = message.metadata && typeof message.metadata === 'object' ? { ...message.metadata } : undefined;
    // What belongs to a reply that was running or failed has no meaning in a copy.
    if (metadata) { delete metadata.serverError; delete metadata.steer; }
    taken.push({ id: uuid(), role: message.role === 'user' ? 'user' : 'model', parts, createdAt: message.createdAt, status: 'complete', ...(metadata && Object.keys(metadata).length ? { metadata } : {}) });
  }
  return taken;
}

/**
 * The new conversation: resolves null when the message is not there or is not a reply. `title` is the title of the branch (the caller adds its words in the language of the page).
 * Settings of the source (model, search, council, project) are kept, so the branch goes on the way the person left it.
 */
export function branchConversation({ conversation, messageIndex, title, uuid = () => crypto.randomUUID(), now = () => new Date().toISOString(), by = null }) {
  const source = conversation?.messages?.[messageIndex];
  if (!source || source.role !== 'model' || source.deletedAt) return null;
  const messages = branchMessages(conversation, messageIndex, { uuid });
  if (!messages.length) return null;
  const at = now();
  return {
    id: uuid(),
    title: String(title || conversation.title || '').slice(0, 200),
    messages,
    model: conversation.model,
    provider: conversation.provider,
    archived: false,
    createdAt: at,
    lastUpdatedAt: at,
    stateUpdatedAt: at,
    genConfig: conversation.genConfig ? structuredClone(conversation.genConfig) : conversation.genConfig,
    imageConfig: conversation.imageConfig ? structuredClone(conversation.imageConfig) : { aspectRatio: '1:1', resolution: '1K' },
    council: conversation.council ? structuredClone(conversation.council) : conversation.council,
    reasoningEffort: conversation.reasoningEffort,
    isRenamed: true,
    folderId: conversation.folderId || null,
    // A conversation made in a shared project of someone else stays in it (its link is not the folder's).
    ...(conversation.sharedProject?.id ? { sharedProject: structuredClone(conversation.sharedProject) } : {}),
    astrasId: conversation.astrasId || null,
    isWebSearchEnabled: Boolean(conversation.isWebSearchEnabled),
    pinned: false,
    isTemporary: false,
    isNaming: false,
    deletedAt: null,
    unsentMessage: '',
    // For good: the tag "Branch" is drawn from it, and it travels with the conversation to the other devices.
    branchedFrom: { conversationId: conversation.id, messageId: source.id, copied: messages.length, at, title: String(conversation.title || '').slice(0, 200), ...(by ? { by: String(by).slice(0, 100) } : {}) }
  };
}
