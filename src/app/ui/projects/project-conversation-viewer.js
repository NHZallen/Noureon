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
import { FOLDER_SVGS } from '../../runtime/features/folder-metadata.js';
import { colorOf, make, openSheet } from './project-parts.js';

const SIDEBAR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><line x1="15.5" y1="9.5" x2="15.5" y2="14.5"></line></svg>';

/**
 * `chat` is { id, title, authorName, messages }; `texts` the interface texts of the language (for the markup of the messages); `onBranch({ id, index })` is told which reply the reader chose
 * (`{ last: true }` for the button at the foot); `canBranch` is false when the person cannot make conversations here; `renderMarkdown` stands in for the renderer of the words (a test).
 */
export function openProjectConversation({ document, root, text, texts = {}, language = 'zh-TW', chat, onBranch = () => {}, canBranch = true, renderMarkdown = null, loadAsset = null, project = null, onClose = () => {} }) {
  const win = document.defaultView;
  const sheet = openSheet({ document, root, title: chat.title || '', close: text('pjBack'), className: 'psh-viewer', back: true, onClose });
  // The head is the one of a chat of the project (project-crumb.js): the arrow back at the left, the project's icon and name with "Chat" under it in the middle, the button of the menu at the right.
  const heading = sheet.element.querySelector('.pj-sheet-title');
  if (project && heading) {
    const top = make(document, 'span', 'psh-crumb-top');
    const icon = make(document, 'span', 'psh-crumb-icon');
    icon.style.setProperty('color', colorOf(project.color));
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">${FOLDER_SVGS[project.icon] || FOLDER_SVGS.default}</svg>`;
    top.append(icon, make(document, 'span', 'psh-crumb-name', project.name || ''));
    heading.classList.add('psh-crumb');
    heading.replaceChildren(top, make(document, 'span', 'psh-crumb-sub', text('pjHeadSub')));
  }
  // The button at the right opens the panel at the right (as the chat's own does): the questions of this conversation, one tap goes to one of them.
  const panel = make(document, 'aside', 'psh-side');
  panel.hidden = true;
  panel.setAttribute('aria-label', text('psViewerPanel'));
  const scrim = make(document, 'div', 'psh-side-scrim');
  scrim.hidden = true;
  const side = make(document, 'button', 'pj-round');
  side.type = 'button';
  side.setAttribute('aria-label', text('psViewerPanel'));
  side.setAttribute('aria-expanded', 'false');
  side.innerHTML = SIDEBAR_ICON;
  const setPanel = (open) => { panel.hidden = !open; scrim.hidden = !open; side.setAttribute('aria-expanded', String(open)); };
  side.addEventListener('click', () => { if (panel.hidden) drawPanel(); setPanel(panel.hidden); });
  scrim.addEventListener('click', () => setPanel(false));
  sheet.element.querySelector('.pj-sheet-head')?.appendChild(side);
  sheet.element.append(scrim, panel);
  const lead = make(document, 'p', 'pj-note psh-viewer-lead', text('psReadOnly', { name: chat.authorName || '' }));
  const list = make(document, 'section', 'psh-messages');
  sheet.body.append(lead, list);
  function drawPanel() {
    panel.replaceChildren(make(document, 'p', 'psh-side-title', text('psViewerPanel')));
    const asked = (current.messages || []).map((message, index) => ({ message, index })).filter(({ message }) => message.role === 'user' && !message.deletedAt);
    if (!asked.length) panel.appendChild(make(document, 'p', 'pj-note', text('psViewerPanelEmpty')));
    for (const { message, index } of asked) {
      const words = (message.parts || []).map((part) => part?.text || '').join(' ').replace(/\s+/g, ' ').trim().slice(0, 90) || '…';
      const item = make(document, 'button', 'psh-side-item', words);
      item.type = 'button';
      item.addEventListener('click', () => { setPanel(false); list.querySelector(`[data-message-index="${index}"]`)?.scrollIntoView?.({ block: 'start' }); });
      panel.appendChild(item);
    }
  }
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
