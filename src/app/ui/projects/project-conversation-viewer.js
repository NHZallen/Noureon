// The conversation of someone else in a shared project, read as a page (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §5 and §13): the messages are drawn with the markup of the chat
// of the app, as the page of a shared conversation does (share-page/share-messages.js); nothing can be typed. At the foot is the way on: a branch, a conversation of the reader made from this
// one up to the last reply, or from the reply the reader chose with the button under it. Resolves when the page is closed.

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getKatex, loadKatex } from '../../vendors/katex-vendor.js';
import { createMarkdownRenderingHelpers } from '../../runtime/shell/markdown-rendering-helpers.js';
import { createMediaAttachmentRenderer } from '../../runtime/messages/media-attachment-renderer.js';
import { createMediaPreviewLifecycle } from '../../runtime/messages/media-preview-lifecycle.js';
import { escapeHTML, renderUserText } from '../../runtime/shell/shell-utilities.js';
import { renderSharedMessages } from '../../share-page/share-messages.js';
import { installCodeHighlighting } from '../code/code-highlighting.js';
import { branchButtonHTML } from '../../runtime/branch/branch-button.js';
import { FOLDER_SVGS } from '../../runtime/features/folder-metadata.js';
import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { timelineSnippet } from '../../runtime/shell/history-sidebar-helpers.js';
import { listableSources } from '../citations/citation-model.js';
import { createSourcePanel } from '../citations/source-panel.js';
import { liftSandboxRunBlock } from '../sandbox/sandbox-run-block.js';
import { projectFilesOf } from '../../runtime/memory-store/reply-sources.js';
import { colorOf, make, openSheet } from './project-parts.js';

const SIDEBAR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><line x1="15.5" y1="9.5" x2="15.5" y2="14.5"></line></svg>';

/**
 * `chat` is { id, title, authorName, messages }; `texts` the interface texts of the language (for the markup of the messages); `onBranch({ id, index })` is told which reply the reader chose
 * (`{ last: true }` for the button at the foot); `onOpenSource(name, row)` and `onDownloadSource(name)` look at, or have, a file of the project that a reply looked into (a row of the Sources tab); `canBranch` is false when the person cannot make conversations here; `renderMarkdown` stands in for the renderer of the words (a test).
 */
export function openProjectConversation({ document, root, text, texts = {}, language = 'zh-TW', chat, onBranch = () => {}, canBranch = true, renderMarkdown = null, loadAsset = null, project = null, onOpenSource = null, onDownloadSource = null, onClose = () => {} }) {
  const win = document.defaultView;
  const sheet = openSheet({ document, root, title: chat.title || '', close: text('pjBack'), className: 'psh-viewer', back: true, onClose });
  // The head is the one of a chat of the project (project-crumb.js): the arrow back at the left, the project's icon and name with "Chat" under it in the middle, the button of the menu at the right.
  const heading = sheet.element.querySelector('.pj-sheet-title');
  if (project && heading) {
    const top = make(document, 'span', 'psh-crumb-top');
    const icon = make(document, 'span', 'psh-crumb-icon');
    icon.style.setProperty('color', colorOf(project.color));
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="folder-icon-svg" aria-hidden="true">${FOLDER_SVGS[project.icon] || FOLDER_SVGS.default}</svg>`;
    top.append(icon, make(document, 'span', 'psh-crumb-name', project.name || ''));
    heading.classList.add('psh-crumb');
    heading.replaceChildren(top, make(document, 'span', 'psh-crumb-sub', text('pjHeadSub')));
  }
  // The button at the right opens the panel of the chat (the app's own side panel: Timeline | Sources, with the same markup and styles as #history-sidebar, styles/citations.css).
  const panel = make(document, 'aside', 'psh-history');
  const scrim = make(document, 'div', 'psh-history-scrim');
  const side = make(document, 'button', 'pj-round');
  side.type = 'button';
  const label = sandboxText(language, 'panelToggle');
  side.setAttribute('aria-label', label);
  side.title = label;
  side.setAttribute('aria-expanded', 'false');
  side.innerHTML = SIDEBAR_ICON;
  let tab = 'timeline';
  let open = false;
  // The sources of one reply: the pages its search found and the files of the project it looked into (the notes and the past chats of the writer are theirs and are not here).
  const groupsOf = (message) => ({ web: listableSources(liftSandboxRunBlock((message?.parts || []).map((part) => part.text || '').join('\n')).run?.sources), notes: [], conversations: [], files: projectFilesOf(message?.metadata) });
  const sizeOf = (groups) => groups.web.length + groups.files.length;
  // The reply whose button was tapped, or the newest one that has sources.
  let sourcesOf = null;
  const sourcesNow = () => {
    const messages = current.messages || [];
    if (sourcesOf !== null && messages[sourcesOf]) return groupsOf(messages[sourcesOf]);
    for (let index = messages.length - 1; index >= 0; index -= 1) if (messages[index].role === 'model' && sizeOf(groupsOf(messages[index]))) return groupsOf(messages[index]);
    return { web: [], notes: [], conversations: [], files: [] };
  };
  let closing = null;
  const setPanel = (next) => {
    open = next;
    win.clearTimeout(closing);
    side.setAttribute('aria-expanded', String(next));
    side.classList.toggle('is-active', next);
    if (next) { drawPanel(); panel.classList.add('visible'); scrim.classList.add('visible'); } else { panel.classList.remove('visible'); scrim.classList.remove('visible'); }
  };
  side.addEventListener('click', () => { if (!open) sourcesOf = null; setPanel(!open); });
  scrim.addEventListener('click', () => setPanel(false));
  sheet.element.querySelector('.pj-sheet-head')?.appendChild(side);
  sheet.element.append(scrim, panel);
  const lead = make(document, 'p', 'pj-note psh-viewer-lead', text('psReadOnly', { name: chat.authorName || '' }));
  const list = make(document, 'section', 'psh-messages');
  sheet.body.append(lead, list);
  function drawPanel() {
    const sources = sourcesNow();
    const head = make(document, 'header', 'history-sidebar-head');
    const tabs = make(document, 'div', 'history-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const name of ['timeline', 'sources']) {
      const button = make(document, 'button', 'history-tab', name === 'timeline' ? String(texts.messageDirectory || 'Timeline') : sandboxText(language, 'sourcesTab'));
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset.historyTab = name;
      button.setAttribute('aria-selected', String(tab === name));
      if (name === 'sources' && sizeOf(sources)) button.appendChild(make(document, 'span', 'history-tab-count', String(sizeOf(sources))));
      button.addEventListener('click', () => { tab = name; drawPanel(); });
      tabs.appendChild(button);
    }
    const close = make(document, 'button', 'history-close');
    close.type = 'button';
    close.setAttribute('aria-label', sandboxText(language, 'closePanel'));
    close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    close.addEventListener('click', () => setPanel(false));
    head.append(tabs, close);
    const body = make(document, 'div', `${tab === 'timeline' ? 'psh-history-list' : 'psh-history-sources'} scroll-area`);
    if (tab === 'timeline') {
      const messages = current.messages || [];
      if (!messages.length) body.appendChild(make(document, 'p', 'p-4 text-sm text-center text-[var(--text-secondary)]', sandboxText(language, 'timelineEmpty')));
      messages.forEach((message, index) => {
        const isUser = message.role === 'user';
        const item = make(document, 'div', `history-sidebar-item ${isUser ? 'is-user' : 'is-model'}`);
        item.dataset.messageIndex = String(index);
        item.append(make(document, 'span', 'history-sidebar-dot'), make(document, 'span', 'history-sidebar-role', sandboxText(language, isUser ? 'timelineYou' : 'timelineReply')), make(document, 'span', 'history-sidebar-text', timelineSnippet(message, sandboxText(language, isUser ? 'timelineYourMessage' : 'timelineEmptyReply'))));
        item.addEventListener('click', () => {
          const target = list.querySelector(`[data-message-index="${index}"]`);
          setPanel(false);
          target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
          const bubble = target?.querySelector?.('.message-bubble');
          if (bubble) { bubble.classList.add('message-highlight'); win.setTimeout(() => bubble.classList.remove('message-highlight'), 1500); }
        });
        body.appendChild(item);
      });
    } else if (!sizeOf(sources)) {
      body.appendChild(make(document, 'p', 'history-sources-empty', sandboxText(language, 'noSourcesInReply')));
    } else {
      body.appendChild(createSourcePanel(document, sources, { language, ...(onOpenSource ? { onOpenFile: onOpenSource } : {}), ...(onDownloadSource ? { onDownloadFile: onDownloadSource } : {}) }));
    }
    panel.replaceChildren(head, body);
  }
  const renderModelText = renderMarkdown || createMarkdownRenderingHelpers({ marked, sanitizer: DOMPurify, DOMParser: win.DOMParser, getKatex, loadKatex, getUiLanguage: () => language, getText: (key, fallback) => texts[key] || fallback, logger: console }).renderMarkdownWithFormulas;
  const mediaRenderer = createMediaAttachmentRenderer({ escapeHTML, getUiLanguage: () => language });
  const previews = createMediaPreviewLifecycle({ document, navigator: win.navigator, fetch: win.fetch?.bind(win), File: win.File, escapeHTML, getInlineMediaSrc: mediaRenderer.getInlineMediaSrc, getUiLanguage: () => language, getText: (key, fallback) => texts[key] || fallback });
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
  // The "Sources" button under a reply opens the panel on its Sources tab, for that reply.
  list.addEventListener('click', (event) => {
    if (!event.target.closest('[data-sources-button]')) return;
    const index = Number(event.target.closest('[data-message-index]')?.dataset.messageIndex);
    sourcesOf = Number.isInteger(index) ? index : null;
    tab = 'sources';
    setPanel(true);
  });
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
