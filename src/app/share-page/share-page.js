// The page of a shared conversation, noureon.com/s/<code> (docs/superpowers/specs/2026-10-31-conversation-share-design.md, §5 and §7). It needs no sign-in: the snapshot is read from the database
// by its code (`get_shared_conversation`), the files from the public bucket of the share. Search engines are told to keep away (a meta tag here and the header in vercel.json), no
// address of this page is sent along when a link on it is followed, and the preview a chat app makes of the link is the one of the site (index.html), not the conversation.

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getKatex } from '../vendors/katex-vendor.js';
import { getSupabaseClient, getSupabaseUrl } from '../auth/supabase-client.js';
import { ensureLanguage } from '../i18n/language-packs.js';
import i18n from '../../data/i18n/index.js';
import { detectSystemLanguage, readLastUiLanguage, readLoginLanguage } from '../runtime/features/login-language.js';
import { createMarkdownRenderingHelpers } from '../runtime/shell/markdown-rendering-helpers.js';
import { createMediaAttachmentRenderer } from '../runtime/messages/media-attachment-renderer.js';
import { createMediaPreviewLifecycle } from '../runtime/messages/media-preview-lifecycle.js';
import { escapeHTML, renderUserText } from '../runtime/shell/shell-utilities.js';
import { applyRememberedAccent } from '../../utils/accent-mirror.js';
import { openSourceUrl, watchSourceIcons } from '../ui/sandbox/run-sources.js';
import { sourcesOfPill } from '../ui/citations/citation-pills.js';
import { codeOfCard } from '../ui/sandbox/run-code-card.js';
import { sourcesOfReply } from '../runtime/features/reply-sources-actions.js';
import { installFileCardInteractions } from '../ui/files/file-card-interactions.js';
import { installCodeHighlighting } from '../ui/code/code-highlighting.js';
import { openSourceSheet } from '../ui/citations/source-sheet.js';
import { easeSavedDetails } from '../ui/motion/collapse-motion.js';
import { markPageAsPrivate } from './private-page.js';
import { PENDING_SHARE_KEY, isReviewRequest, shareCodeOf } from './share-route.js';
import { hydrateSharedSnapshot } from './share-assets.js';
import { renderSharedMessages } from './share-messages.js';
import { sharePageText } from './share-texts.js';

const LANGUAGES = [['zh-TW', '繁體中文'], ['en', 'English'], ['fr', 'Français'], ['ru', 'Русский'], ['es', 'Español']];
const supported = (value) => (LANGUAGES.some(([code]) => code === value) ? value : '');

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export { markPageAsPrivate };

export async function initializeSharePage({ window, document, supabase = getSupabaseClient(), fetchImpl = window.fetch.bind(window), baseUrl = getSupabaseUrl(), renderMarkdown = null } = {}) {
  const code = shareCodeOf(window.location.pathname);
  markPageAsPrivate(document);
  // The colours the person chose in the app (the accent, the bubble), when they open the page in the same browser.
  applyRememberedAccent(document.documentElement, window.localStorage);
  watchSourceIcons(document);
  // Downloading and previewing the cards of files, and the colours of code, as in the app (both listen on the whole page).
  installFileCardInteractions({ root: document, window, getUiLanguage: () => language, notify: (message) => notify(message), logError: () => {} });
  installCodeHighlighting({ document, window });
  easeSavedDetails(document);
  let language = supported(readLoginLanguage()) || supported(readLastUiLanguage()) || supported(detectSystemLanguage()) || 'zh-TW';
  await ensureLanguage(language).catch(() => {});
  const text = (key, values) => sharePageText(language, key, values);

  const app = document.getElementById('app');
  app.replaceChildren();
  document.documentElement.classList.add('share-page');
  const root = el(document, 'div', 'sp-root');
  const header = el(document, 'header', 'sp-header');
  const brand = el(document, 'a', 'sp-brand');
  brand.href = '/';
  const mark = el(document, 'img', 'sp-mark');
  mark.src = '/icon-192.png'; mark.width = 28; mark.height = 28; mark.alt = '';
  brand.append(mark, el(document, 'span', 'sp-name', 'Noureon'));
  const tools = el(document, 'div', 'sp-tools');
  const select = el(document, 'select', 'sp-lang');
  select.setAttribute('aria-label', 'Language');
  for (const [value, label] of LANGUAGES) { const option = el(document, 'option', null, label); option.value = value; select.appendChild(option); }
  select.value = language;
  const goApp = el(document, 'a', 'sp-go');
  goApp.href = '/';
  tools.append(select, goApp);
  header.append(brand, tools);
  const main = el(document, 'main', 'sp-main');
  const footer = el(document, 'footer', 'sp-footer');
  root.append(header, main, footer);
  app.appendChild(root);

  let loaded = null; // { share, snapshot } once the page has the conversation
  let missingFiles = 0;
  let reviewStatus = '';

  const renderModelText = renderMarkdown || createMarkdownRenderingHelpers({
    marked, sanitizer: DOMPurify, DOMParser: window.DOMParser, katex: getKatex(), getUiLanguage: () => language,
    getText: (key, fallback) => i18n[language]?.[key] || fallback, logger: console
  }).renderMarkdownWithFormulas;
  const mediaRenderer = createMediaAttachmentRenderer({ escapeHTML, getUiLanguage: () => language });
  const previews = createMediaPreviewLifecycle({ document, navigator: window.navigator, fetch: fetchImpl, File: window.File, escapeHTML, getInlineMediaSrc: mediaRenderer.getInlineMediaSrc, getUiLanguage: () => language });
  // A picture a model drew is read from the public bucket straight into the <img>.
  const bindGeneratedImageAssets = async (messageElement, assets) => {
    for (const asset of assets) {
      const url = asset.cloudAsset?.url || '';
      const image = messageElement.querySelector(`img[data-generated-image-id="${asset.id}"]`);
      if (image && url) image.src = url;
      const link = messageElement.querySelector(`a[data-generated-image-download="${asset.id}"]`);
      if (link && url) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    }
  };

  const dateText = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' }); };

  // A notice (not found, paused, taken down, failed) is kept as the keys of its words, so that it is written again when the language changes.
  let notice = null;
  function drawMessage(titleKey, bodyKey, retry = null, values = {}) {
    notice = { titleKey, bodyKey, retry, values };
    main.replaceChildren();
    const box = el(document, 'section', 'sp-notice');
    box.append(el(document, 'h1', null, text(titleKey)), el(document, 'p', null, text(bodyKey, values)));
    if (retry) { const button = el(document, 'button', 'sp-btn', text('retry')); button.type = 'button'; button.addEventListener('click', retry); box.appendChild(button); }
    main.appendChild(box);
  }

  function drawReport() {
    const slot = footer.querySelector('.sp-report-slot');
    if (!slot) return;
    slot.replaceChildren();
    const form = el(document, 'form', 'sp-report');
    form.append(el(document, 'strong', null, text('reportTitle')));
    const area = el(document, 'textarea');
    area.maxLength = 500; area.rows = 3; area.placeholder = text('reportPlaceholder');
    const row = el(document, 'div', 'sp-report-row');
    const send = el(document, 'button', 'sp-btn is-primary', text('reportSend')); send.type = 'submit';
    const cancel = el(document, 'button', 'sp-btn', text('reportCancel')); cancel.type = 'button';
    const note = el(document, 'span', 'sp-report-note');
    cancel.addEventListener('click', () => slot.replaceChildren());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      send.disabled = true;
      try {
        const { error } = await supabase.rpc('report_shared_conversation', { p_code: code, p_reason: area.value.slice(0, 500) });
        if (error) throw error;
        slot.replaceChildren(el(document, 'span', 'sp-report-note', text('reportThanks')));
      } catch {
        send.disabled = false;
        note.textContent = text('reportFailed');
      }
    });
    row.append(send, cancel, note);
    form.append(area, row);
    slot.appendChild(form);
    area.focus();
  }

  function drawFooter() {
    footer.replaceChildren();
    const line = el(document, 'p', 'sp-disclaimer', text('disclaimer'));
    if (loaded) {
      const report = el(document, 'button', 'sp-link', text('report'));
      report.type = 'button';
      report.addEventListener('click', drawReport);
      line.append(document.createTextNode(' '), report);
    }
    footer.append(line, el(document, 'div', 'sp-report-slot'));
  }

  // A short line at the bottom that says a copy or an export is done (the app has its own notification, which this page does not load).
  let toastTimer = null;
  const notify = (message) => {
    document.querySelector('.sp-toast')?.remove();
    const toast = el(document, 'div', 'sp-toast', message);
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.remove(), 2600);
  };

  // A deep research is a card in the app (ui/research/): here the report is drawn read-only, from the message of the snapshot (it has no id of its own, so one is made from its place).
  async function mountResearchCards(list, messages) {
    const hosts = [...list.querySelectorAll('.research-card-host')];
    if (!hosts.length) return;
    try {
      const [{ mountResearchCard }] = await Promise.all([import('../ui/research/research-card.js'), import('../ui/research/research-card.css').catch(() => {})]);
      for (const host of hosts) {
        const index = Number(host.closest('[data-message-index]')?.dataset.messageIndex);
        const message = messages[index];
        if (!message) continue;
        const id = message.id;
        mountResearchCard({
          host, message, getLanguage: () => language, showNotification: notify, readOnly: true,
          openReader: async () => {
            const [{ openResearchReader }] = await Promise.all([import('../ui/research/research-reader.js'), import('../ui/research/research-reader.css').catch(() => {})]);
            return openResearchReader({ messageId: id, getLanguage: () => language, showNotification: notify, document, readOnly: true });
          }
        });
      }
    } catch { /* the message stays as the page drew it */ }
  }

  function drawReady() {
    const { share, snapshot } = loaded;
    document.title = `${text('title')} · Noureon`;
    main.replaceChildren();
    const head = el(document, 'section', 'sp-head');
    head.appendChild(el(document, 'h1', 'sp-title', snapshot.title || share.title || text('title')));
    const meta = el(document, 'p', 'sp-meta');
    const bits = [];
    if (share.ownerName) bits.push(text('sharedBy', { name: share.ownerName }));
    const when = dateText(share.updatedAt || share.createdAt);
    if (when) bits.push(text('sharedOn', { date: when }));
    if (snapshot.modelName) bits.push(`${text('model')}: ${snapshot.modelName}`);
    meta.textContent = bits.join(' · ');
    head.appendChild(meta);
    head.appendChild(el(document, 'p', 'sp-note', text('snapshotNote')));
    main.appendChild(head);
    if (reviewStatus) main.appendChild(el(document, 'p', 'sp-banner', text('reviewNote', { status: text(reviewStatus === 'suspended' ? 'reviewSuspended' : 'reviewActive') })));

    const action = el(document, 'section', 'sp-action');
    if (share.mode === 'continue') {
      action.appendChild(el(document, 'p', null, text('continueHint')));
      const button = el(document, 'button', 'sp-btn is-primary', text('continueButton'));
      button.type = 'button';
      button.addEventListener('click', () => {
        try { window.localStorage.setItem(PENDING_SHARE_KEY, JSON.stringify({ code, at: Date.now() })); } catch { /* the app asks for the link again */ }
        window.location.assign('/');
      });
      action.appendChild(button);
    } else {
      action.appendChild(el(document, 'p', null, text('readOnly')));
    }
    main.appendChild(action);

    const list = el(document, 'section', 'sp-messages');
    list.id = 'sp-messages';
    main.appendChild(list);
    const drawn = renderSharedMessages({
      document, list, messages: snapshot.messages, code, texts: i18n[language] || {}, language, renderUserText, renderModelText, buildMediaAttachmentView: mediaRenderer.buildMediaAttachmentView,
      bindMediaPreviewButtons: previews.bindMediaPreviewButtons, bindGeneratedImageAssets, onCopied: () => notify(text('copied'))
    });
    void mountResearchCards(list, drawn);
    // The pages a reply found, as in the app: a chip opens its page in a new tab; a label that cites sources opens its page, or the sheet of them when there are several.
    list.addEventListener('click', (event) => {
      const codeCopy = event.target.closest('.run-code-copy');
      if (codeCopy) { void window.navigator.clipboard.writeText(codeOfCard(codeCopy)).then(() => notify(text('copied'))).catch(() => {}); return; }
      // The "Sources" button under a reply: its pages in a sheet (the page has no panel on the side).
      const sourcesButton = event.target.closest('[data-sources-button]');
      if (sourcesButton) {
        const web = sourcesOfReply(drawn[Number(sourcesButton.closest('.message-item')?.dataset.messageIndex)]).web;
        if (web.length) openSourceSheet({ document, sources: web, all: true, language });
        return;
      }
      const chip = event.target.closest('.run-source-chip');
      if (chip) { openSourceUrl(chip.dataset.url, (...args) => window.open(...args)); return; }
      const pill = event.target.closest('.cite-pill');
      if (!pill) return;
      const cited = sourcesOfPill(pill);
      if (cited.length === 1) openSourceUrl(cited[0].url, (...args) => window.open(...args));
      else if (cited.length) openSourceSheet({ document, sources: cited, language });
    });
    if (missingFiles > 0) main.appendChild(el(document, 'p', 'sp-note', text('fileGone')));
    drawFooter();
  }

  async function load() {
    main.replaceChildren(el(document, 'p', 'sp-loading', text('loading')));
    drawFooter();
    if (!code || !supabase) { drawMessage('notFoundTitle', 'notFoundBody'); return; }
    let data;
    try {
      // The owner of the service reads a share whatever its status (?review=1): the database answers only an account it knows; for anyone else this falls back to the ordinary read.
      if (isReviewRequest(window.location.search)) {
        // (The answer of the database client can be waited for but has no `catch` of its own.)
        let review = null;
        try { review = await supabase.rpc('admin_get_shared_conversation', { p_code: code }); } catch { review = null; }
        if (review && !review.error && review.data) { data = review.data; reviewStatus = review.data.status || 'active'; }
        // The administrator is told why the review view did not open (anyone else is not allowed and reads the share as everyone does).
        else if (review?.error && !/not allowed/i.test(String(review.error.message || ''))) { drawMessage('title', 'reviewFailed', load, { reason: String(review.error.message || review.error.code || '').slice(0, 200) }); return; }
      }
      if (!data) {
        const result = await supabase.rpc('get_shared_conversation', { p_code: code });
        if (result.error) throw result.error;
        data = result.data;
      }
    } catch {
      drawMessage('title', 'failed', load);
      return;
    }
    // A paused link (reported by several readers) says so, without anything of the conversation.
    if (data?.status === 'suspended' && !data.snapshot) { drawMessage('underReviewTitle', 'underReviewBody'); return; }
    if (data?.status === 'removed' && !data.snapshot) { drawMessage('removedTitle', 'removedBody'); return; }
    if (!data || !data.snapshot) { drawMessage('notFoundTitle', 'notFoundBody'); return; }
    const hydrated = await hydrateSharedSnapshot(data.snapshot, { baseUrl, fetchImpl });
    missingFiles = hydrated.missing;
    loaded = { share: { mode: data.mode, ownerName: data.ownerName || '', createdAt: data.createdAt, updatedAt: data.updatedAt, title: data.title }, snapshot: { ...hydrated.snapshot, messages: Array.isArray(hydrated.snapshot.messages) ? hydrated.snapshot.messages : [] } };
    drawReady();
  }

  function applyLanguage() {
    document.documentElement.lang = language;
    goApp.textContent = text('goToApp');
    if (!loaded) document.title = `${text('title')} · Noureon`;
  }
  select.addEventListener('change', async () => {
    language = supported(select.value) || language;
    await ensureLanguage(language).catch(() => {});
    applyLanguage();
    if (loaded) drawReady();
    else { if (notice) drawMessage(notice.titleKey, notice.bodyKey, notice.retry, notice.values); drawFooter(); }
  });

  applyLanguage();
  await load();
  return { handled: true, code };
}
