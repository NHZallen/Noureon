// What a chat says, as the list of the chats of a project shows it: the last message that has words, without the record of what the model did (the
// ```noureon-run block at the start), the markers that cite sources, the files that went with it, or the marks of Markdown. A conversation kept only
// as a stub carries this text in its flags (`__flags.preview`, made when the stub is written), so the list needs no messages.

import { liftSandboxRunBlock } from '../../ui/sandbox/sandbox-run-block.js';
import { stripCitationMarkers } from '../../ui/citations/citation-model.js';
import { plainMarkdown } from '../../ui/citations/plain-text.js';

export const chatPreview = messages => {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const raw = (list[index]?.parts || []).map(part => part?.text || '').join('\n');
    const { run, text: said } = liftSandboxRunBlock(raw);
    const text = plainMarkdown(stripCitationMarkers(said, run?.sources).replace(/(`{3,})file[^\n]*\n[\s\S]*?(?:\1`*|$)/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 160);
  }
  return '';
};

/** The preview of a conversation, whole or a stub. */
export const previewOfConversation = conversation => (conversation?.__stub ? conversation.__flags?.preview || '' : chatPreview(conversation?.messages));
