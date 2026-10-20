// How a conversation to delete forever is recognized in the cloud when its id there is not the local one (a conversation uploaded by an
// older version, or by another device before the ids were repaired): a fingerprint of its content and a set of looser match keys.

function stableDeleteTimestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function normalizeDeleteText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function stableDeletePart(part = {}) {
  const inlineData = part.inlineData || null;
  const generatedImage = part.generatedImage || null;
  return {
    text: normalizeDeleteText(part.text),
    inlineData: inlineData ? {
      mimeType: inlineData.mimeType || inlineData.mime_type || '',
      displayName: inlineData.displayName || inlineData.name || inlineData.fileName || '',
      size: inlineData.size || null
    } : null,
    generatedImage: generatedImage ? {
      id: generatedImage.id || '',
      mimeType: generatedImage.mimeType || generatedImage.mime_type || '',
      prompt: generatedImage.prompt || '',
      aspectRatio: generatedImage.aspectRatio || ''
    } : null
  };
}

function conversationDeleteSignature(conversation = {}) {
  const messages = (conversation.messages || []).map(message => ({
    role: message.role || '',
    createdAt: stableDeleteTimestamp(message.createdAt),
    parts: (message.parts || []).map(stableDeletePart)
  }));
  return {
    id: conversation.id || '',
    title: normalizeDeleteText(conversation.title),
    summary: normalizeDeleteText(conversation.summary),
    model: String(conversation.model || ''),
    provider: String(conversation.provider || ''),
    createdAt: stableDeleteTimestamp(conversation.createdAt),
    deletedAt: stableDeleteTimestamp(conversation.deletedAt),
    messages,
    textMessages: messages
      .map(message => `${message.role}:${message.parts.map(part => part.text).filter(Boolean).join('\n')}`)
      .filter(value => /:\S/.test(value))
  };
}

export function conversationDeleteFingerprint(conversation = {}) {
  if (!conversation) return null;
  const signature = conversationDeleteSignature(conversation);
  const { messages } = signature;
  if (!conversation.createdAt && !messages.length && !conversation.title) return null;
  return JSON.stringify({
    title: signature.title,
    summary: signature.summary,
    model: signature.model,
    provider: signature.provider,
    createdAt: signature.createdAt,
    messages
  });
}

export function conversationDeleteMatchKeys(conversation = {}) {
  const signature = conversationDeleteSignature(conversation);
  const keys = new Set();
  const messageText = signature.textMessages.join('\n---\n');
  const firstText = signature.textMessages[0] || '';
  if (signature.title && signature.createdAt) keys.add(`title-created:${signature.title}\n${signature.createdAt}`);
  if (signature.createdAt && firstText) keys.add(`created-first:${signature.createdAt}\n${firstText}`);
  if (signature.createdAt && messageText) keys.add(`created-messages:${signature.createdAt}\n${messageText}`);
  if (signature.title && messageText) keys.add(`title-messages:${signature.title}\n${messageText}`);
  if (signature.title && firstText) keys.add(`title-first:${signature.title}\n${firstText}`);
  if (signature.deletedAt && signature.createdAt) keys.add(`trash-created:${signature.createdAt}`);
  if (signature.deletedAt && firstText) keys.add(`trash-first:${firstText}`);
  if (signature.deletedAt && messageText) keys.add(`trash-messages:${messageText}`);
  if (messageText && signature.textMessages.length >= 2) keys.add(`messages:${messageText}`);
  return keys;
}


export function uniqueConversationsById(conversations = []) {
  const seen = new Set();
  const unique = [];
  for (const conversation of conversations || []) {
    if (!conversation) continue;
    const id = conversation.id ? String(conversation.id) : '';
    const key = id || conversationDeleteFingerprint(conversation) || JSON.stringify([...conversationDeleteMatchKeys(conversation)]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(conversation);
  }
  return unique;
}
