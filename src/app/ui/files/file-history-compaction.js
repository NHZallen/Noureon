import { formatFileBlockSource, scanFileBlocks } from './file-block-protocol.js';
import { sanitizeFileName } from './file-name-policy.js';

// File specifications can be large, and conversation history is re-sent with
// every request. Only the newest version of each file needs to travel in full:
// that is what a follow-up edit builds on. Blocks whose closing fence had to be
// recovered are re-sent with the correct one. Stored messages are never changed.

const normalizeBlockName = (block) => sanitizeFileName(block.name || '', {
  defaultExtension: block.extensionHint || 'txt'
}).toLowerCase();

const getTextParts = (message) => (Array.isArray(message?.parts) ? message.parts : []);

function replaceBlocks(text, blocks, replacer) {
  let output = '';
  let cursor = 0;
  blocks.forEach((block) => {
    output += text.slice(cursor, block.start);
    output += replacer(block);
    cursor = block.end;
  });
  return output + text.slice(cursor);
}

export function compactFileHistoryForApi(history = []) {
  if (!Array.isArray(history) || history.length === 0) return history;

  const occurrences = [];
  history.forEach((message) => {
    if (message?.role !== 'model' && message?.role !== 'assistant') return;
    getTextParts(message).forEach((part) => {
      if (typeof part?.text !== 'string') return;
      scanFileBlocks(part.text).forEach((block) => {
        occurrences.push({ name: normalizeBlockName(block), repaired: block.repaired });
      });
    });
  });
  if (occurrences.length === 0) return history;

  const latestByName = new Map();
  occurrences.forEach((occurrence, order) => latestByName.set(occurrence.name, order));
  const supersededCount = occurrences.length - latestByName.size;
  if (supersededCount === 0 && !occurrences.some((occurrence) => occurrence.repaired)) return history;

  let order = 0;
  return history.map((message) => {
    if (message?.role !== 'model' && message?.role !== 'assistant') return message;
    let changed = false;
    const parts = getTextParts(message).map((part) => {
      if (typeof part?.text !== 'string') return part;
      const blocks = scanFileBlocks(part.text);
      if (blocks.length === 0) return part;
      const text = replaceBlocks(part.text, blocks, (block) => {
        const currentOrder = order;
        order += 1;
        const name = normalizeBlockName(block);
        if (latestByName.get(name) === currentOrder) {
          if (block.repaired) changed = true;
          return formatFileBlockSource(part.text, block);
        }
        changed = true;
        const displayName = sanitizeFileName(block.name || '', { defaultExtension: block.extensionHint || 'txt' });
        return `[Earlier version of the file "${displayName}" omitted; a newer version appears later in this conversation.]\n`;
      });
      return text === part.text ? part : { ...part, text };
    });
    return changed ? { ...message, parts } : message;
  });
}

/**
 * Collapses file blocks to a short excerpt for background consumers such as
 * memory capture, history indexing and title summaries.
 */
export function summarizeFileBlocks(text = '', { excerptLength = 400 } = {}) {
  const source = String(text || '');
  const blocks = scanFileBlocks(source);
  if (blocks.length === 0) return source;
  return replaceBlocks(source, blocks, (block) => {
    const name = sanitizeFileName(block.name || '', { defaultExtension: block.extensionHint || 'txt' });
    const excerpt = block.content.replace(/\s+/g, ' ').trim();
    const shortened = excerpt.length > excerptLength ? `${excerpt.slice(0, excerptLength)}…` : excerpt;
    return `[File: ${name}]${shortened ? ` ${shortened}` : ''}\n`;
  });
}
