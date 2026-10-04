import { describeFileBlock } from '../file-block-model.js';
import { scanFileBlocks } from '../file-block-protocol.js';
import { parseDocumentSpec } from '../design/document-spec.js';

import { freeDecks } from './free-decks.js';

export { freeDecks };

export function eligibleVisionFiles({ conversation, message, model, config, signal, responseUsesCouncil, modelSupportsVision }) {
  if (!conversation || !message || signal?.aborted || responseUsesCouncil || config?.visionCheckEnabled === false
    || message.metadata?.visionCheck || !model || model.outputModality === 'image' || !modelSupportsVision(model)) return [];
  const checked = new Set(message.metadata?.visionChecked || []);
  const text = (message.parts || []).map(part => part.text || '').join('\n');
  const designed = scanFileBlocks(text).filter(block => block.complete && /\.pptx$/i.test(block.name || ''))
    .map(describeFileBlock).filter(file => !checked.has(file.id) && parseDocumentSpec(file.content, { uiLanguage: config?.uiLanguage }).ok);
  return [...designed, ...freeDecks(message).filter(file => !checked.has(file.id))];
}
