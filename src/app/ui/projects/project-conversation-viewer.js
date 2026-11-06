// The conversation of someone else in a shared project, read as a page (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §5 and §13): the messages are drawn with the markup of the chat
// of the app, as the page of a shared conversation does (share-page/share-messages.js); nothing can be typed. At the foot is the way on: a branch, a conversation of the reader made from this
// one up to the last reply, or from the reply the reader chose with the button under it. Resolves when the page is closed.

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getKatex } from '../../vendors/katex-vendor.js';
import { createMarkdownRenderingHelpers } from '../../runtime/shell/markdown-rendering-helpers.js';
import { createMediaAttachmentRenderer } from '../../runtime/messages/media-attachment-renderer.js';
import { createMediaPreviewLifecycle } from '../../runtime/messages/media-preview-lifecycle.js';
import { escapeHTML, renderUserText } from '../../runtime/shell/shell-utilities.js';
import { renderSharedMessages } from '../../share-page/share-messages.js';
import { installCodeHighlighting } from '../code/code-highlighting.js';
import { branchButtonHTML } from '../../runtime/branch/branch-button.js';
import { make, openSheet } from './project-parts.js';

/**
 * `chat` is { id, title, authorName, messages }; `texts` the interface texts of the language (for the markup of the messages); `onBranch({ id, index })` is told which reply the reader chose
 * (`{ last: true }` for the button at the foot); `canBranch` is false when the person cannot make conversations here; `renderMarkdown` stands in for the renderer of the words (a test).
 */
export function openProjectConversation({ document, root, text, texts = {}, language = 'zh-TW', chat, onBranch = () => {}, canBranch = true, renderMarkdown = null, loadAsset = null, onClose = () => {} }) {
  const win = document.defaultView;
  const sheet = openSheet({ document, root, title: chat.title || '', close: text('pjBack'), className: 'psh-viewer', back: true, onClose });
  const lead = make(document, 'p', 'pj-note psh-viewer-lead', text('psReadOnly', { name: chat.authorName || '' }));
  const list = make(document, 'section', 'psh-messages');
  sheet.body.append(lead, list);
  const renderModelText = renderMarkdown || createMarkdownRenderingHelpers({ marked, sanitizer: DOMPurify, DOMParser: win.DOMParser, katex: getKatex(), getUiLanguage: () => language, getText: (key, fallback) => texts[key] || fallback, logger: console }).renderMarkdownWithFormulas;
  const mediaRenderer = createMediaAttachmentRenderer({ escapeHTML, getUiLanguage: () => language });
  const previews = createMediaPreviewLifecycle({ document, navigator: win.navigator, fetch: win.fetch?.bind(win), File: win.File, escapeHTML, getInlineMediaSrc: mediaRenderer.getInlineMediaSrc, getUiLanguage: () => language });
  let current = chat;
  let go = null;
  // The pictures and files of the people of the project are in their cloud storage: the server gives each one to a member (loadAsset), and the messages are drawn again as they come.
  const assets = new Map();
  const withAssets = (messages) => (!loadAsset ? messages : messages.map((message) => ({
    ...message,
    parts: (message.parts || []).map((part) => {
      const path = part?.inlineData?.data?.__astraCloudAsset?.path;
      if (!path) return part;
      if (!assets.has(path)) {
        assets.set(path, null);
        Promise.resolve(loadAsset(path)).then((data) => { if (data) { assets.set(path, data); draw(); } }, () => {});
      }
      return assets.get(path) ? { ...part, inlineData: { ...part.inlineData, data: assets.get(path) } } : part;
    })
  })));
  const draw = () => {
    const shown = withAssets(current.messages || []);
    const drawn = renderSharedMessages({
      document, list, messages: shown, code: current.id, texts, language, renderUserText, renderModelText, buildMediaAttachmentView: mediaRenderer.buildMediaAttachmentView,
      bindMediaPreviewButtons: previews.bindMediaPreviewButtons, bindGeneratedImageAssets: async () => {}
    });
    try { installCodeHighlighting({ document: list, window: win }); } catch { /* the colours of code are a help */ }
    const replies = [];
    drawn.forEach((message, index) => { if (message.role === 'model') replies.push(index); });
    if (canBranch) {
      // The button under each reply (the same one the chat has); the footer of a message that the page draws has the copy button first.
      for (const index of replies) list.querySelector(`[data-message-index="${index}"] .message-footer-left .copy-content-btn`)?.insertAdjacentHTML('afterend', branchButtonHTML(text('branchChat')));
      if (go) go.hidden = !replies.length;
    }
  };
  if (canBranch) {
    // A reply is named by its id, not by its place, so the branch is made of the reply the reader saw even when the conversation went on since.
    list.addEventListener('click', (event) => {
      const button = event.target.closest('.branch-message-btn');
      if (!button) return;
      const index = Number(button.closest('[data-message-index]')?.dataset.messageIndex);
      const message = current.messages?.[index];
      if (message) { sheet.close(); onBranch({ id: message.id, index }); }
    });
    const bar = make(document, 'div', 'psh-branch-bar');
    bar.append(make(document, 'span', 'psh-branch-hint', text('psBranchHint', { name: chat.authorName || '' })));
    go = make(document, 'button', 'pj-button pj-primary psh-branch-go', text('branchChat'));
    go.type = 'button';
    go.setAttribute('data-branch-last', '');
    go.addEventListener('click', () => { sheet.close(); onBranch({ last: true }); });
    bar.appendChild(go);
    sheet.element.appendChild(bar);
  }
  draw();
  // The page keeps up with the conversation: the messages are drawn again (the reader stays where they were unless they were at the end).
  return {
    ...sheet,
    update: (next) => {
      const body = sheet.body;
      const atEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
      const top = body.scrollTop;
      current = next;
      draw();
      body.scrollTop = atEnd ? body.scrollHeight : top;
    }
  };
}
