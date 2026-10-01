import { describeFileBlock } from '../file-block-model.js';
import { scanFileBlocks } from '../file-block-protocol.js';
import { parseDocumentSpec } from '../design/document-spec.js';

// Decks Python drew itself (Advanced mode), saved with the message.
export const freeDecks = message => (message?.parts || [])
  .filter(part => part.sandboxFile?.id && part.sandboxFile.data && /\.pptx$/i.test(part.sandboxFile.name || ''))
  .map(part => ({ id: part.sandboxFile.id, name: part.sandboxFile.name, free: true }));

export function eligibleVisionFiles({ conversation, message, model, config, signal, responseUsesCouncil, modelSupportsVision }) {
  if (!conversation || !message || signal?.aborted || responseUsesCouncil || config?.visionCheckEnabled === false
    || message.metadata?.visionCheck || !model || model.outputModality === 'image' || !modelSupportsVision(model)) return [];
  const checked = new Set(message.metadata?.visionChecked || []);
  const text = (message.parts || []).map(part => part.text || '').join('\n');
  const designed = scanFileBlocks(text).filter(block => block.complete && /\.pptx$/i.test(block.name || ''))
    .map(describeFileBlock).filter(file => !checked.has(file.id) && parseDocumentSpec(file.content, { uiLanguage: config?.uiLanguage }).ok);
  return [...designed, ...freeDecks(message).filter(file => !checked.has(file.id))];
}

/**
 * Where the message is in the chat now: { conversation, message } as they are in the live chat, or null when it is not in it
 * any more (the person edited an earlier message, or deleted it). A check takes minutes, and meanwhile the cloud sync can
 * replace the conversation and its messages with refreshed copies of the same ones, so the live copy is found by the
 * message's id, not by being the very object the check started from.
 */
export function findMessageInChat({ conversation, message, getActiveConversation }) {
  const active = getActiveConversation?.();
  const live = active?.id === conversation?.id ? active : conversation;
  const found = (live?.messages || []).find((item) => item === message || (message?.id && item?.id === message.id));
  return found ? { conversation: live, message: found } : null;
}
