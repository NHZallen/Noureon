// The messages of a shared conversation, drawn with the same markup as the chat of the app (runtime/messages/message-markup-renderer.js), so what the app shows (the card of a deep
// research, the process of a reply, the cards of files, pictures between words, links as chips) shows here too. The snapshot keeps no ids, so each message gets one from its place.

import { buildMessageRenderView } from '../runtime/messages/message-markup-renderer.js';
import { formatFullTimestamp } from '../runtime/messages/date-formatting.js';
import { copyableAnswerText } from '../ui/citations/citation-pills.js';

const plainTextOf = (message) => (message.parts || []).filter((part) => part?.text && !part.quoteContext).map((part) => part.displayText ?? part.text).join('\n');

/** Draws the messages into `list`. Returns the messages as they were drawn (with their ids). */
export function renderSharedMessages({ document, list, messages, code, texts, language, renderUserText, renderModelText, buildMediaAttachmentView, bindMediaPreviewButtons, bindGeneratedImageAssets, onCopied = () => {} }) {
  list.replaceChildren();
  const drawn = messages.map((message, index) => ({ ...message, id: `shared-${code}-${index}`, parts: Array.isArray(message.parts) ? message.parts : [] }));
  drawn.forEach((message, index) => {
    const view = buildMessageRenderView({
      message, renderUserText, renderMarkdownWithFormulas: renderModelText, buildMediaAttachmentView, formatTimestamp: formatFullTimestamp,
      copyTitle: texts.copyContent || '', uiLanguage: language,
      labels: { imagePreview: texts.imagePreview, imageAlt: texts.imageAlt, imageDownloadOriginal: texts.imageDownloadOriginal, imageSetItem: texts.imageSetItem, messageActions: texts.messageActions, copyMessage: texts.copyMessage, editMessage: texts.editMessage },
      historySourceTexts: { autoCheckLabel: texts.visionAutoNote }
    });
    const element = document.createElement('div');
    element.className = view.messageClassName;
    element.innerHTML = view.messageHTML;
    element.dataset.messageIndex = String(index);
    element.__astraRenderedMessage = message;
    bindMediaPreviewButtons(element, view.previewMediaParts);
    void Promise.resolve(bindGeneratedImageAssets(element, view.generatedImageAssets || [])).catch(() => {});
    // Copy the words of the reply (a person who reads cannot edit, so the buttons of the author's own message are left out by the page's style).
    element.querySelector('.copy-content-btn')?.addEventListener('click', async () => {
      try { await document.defaultView.navigator.clipboard.writeText(message.role === 'user' ? plainTextOf(message) : copyableAnswerText(message)); onCopied(); } catch { /* the clipboard may be refused */ }
    });
    list.appendChild(element);
  });
  return drawn;
}
