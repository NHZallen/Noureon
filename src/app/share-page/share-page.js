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
import { createConversationViewRenderer } from '../runtime/messages/conversation-view-renderer.js';
import { createMediaAttachmentRenderer } from '../runtime/messages/media-attachment-renderer.js';
import { createMediaPreviewLifecycle } from '../runtime/messages/media-preview-lifecycle.js';
import { escapeHTML, renderUserText } from '../runtime/shell/shell-utilities.js';
import { PENDING_SHARE_KEY, shareCodeOf } from './share-route.js';
import { hydrateSharedSnapshot } from './share-assets.js';
import { sharePageText } from './share-texts.js';

const LANGUAGES = [['zh-TW', '繁體中文'], ['en', 'English'], ['fr', 'Français'], ['ru', 'Русский'], ['es', 'Español']];
const supported = (value) => (LANGUAGES.some(([code]) => code === value) ? value : '');

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** Tells search engines and link followers to keep away, and drops what would point them to the site's home page as the address of this one. */
export function markPageAsPrivate(document) {
  const put = (name, content) => {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', name); document.head.appendChild(meta); }
    meta.setAttribute('content', content);
  };
  put('robots', 'noindex, nofollow, noarchive');
  put('referrer', 'no-referrer');
  document.querySelector('link[rel="canonical"]')?.remove();
  document.querySelector('meta[property="og:url"]')?.remove();
}

export async function initializeSharePage({ window, document, supabase = getSupabaseClient(), fetchImpl = window.fetch.bind(window), baseUrl = getSupabaseUrl(), renderMarkdown = null } = {}) {
  const code = shareCodeOf(window.location.pathname);
  markPageAsPrivate(document);
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

  const renderModelText = renderMarkdown || createMarkdownRenderingHelpers({
    marked, sanitizer: DOMPurify, DOMParser: window.DOMParser, katex: getKatex(), getUiLanguage: () => language,
    getText: (key, fallback) => i18n[language]?.[key] || fallback, logger: console
  }).renderMarkdown;
  const mediaRenderer = createMediaAttachmentRenderer({ escapeHTML, getUiLanguage: () => language });
  const previews = createMediaPreviewLifecycle({ document, navigator: window.navigator, fetch: fetchImpl, File: window.File, escapeHTML, getInlineMediaSrc: mediaRenderer.getInlineMediaSrc, getUiLanguage: () => language });
  const viewer = createConversationViewRenderer({
    document, renderUserText, renderModelText,
    renderMediaAttachmentGrid: (parts) => mediaRenderer.buildMediaAttachmentView(parts).html,
    bindMediaPreviewButtons: previews.bindMediaPreviewButtons,
    // A picture a model drew is read from the public bucket straight into the <img>.
    bindGeneratedImageAssets: async (messageElement, assets) => {
      for (const asset of assets) {
        const url = asset.cloudAsset?.url || '';
        const image = messageElement.querySelector(`img[data-generated-image-id="${asset.id}"]`);
        if (image && url) image.src = url;
        const link = messageElement.querySelector(`a[data-generated-image-download="${asset.id}"]`);
        if (link && url) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      }
    },
    mediaMode: 'inlineData', wrapTextParts: true, getLabels: () => ({}), scheduleFrame: (callback) => window.requestAnimationFrame(callback), logError: () => {}
  });

  const dateText = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' }); };

  function drawMessage(title, body, retry = null) {
    main.replaceChildren();
    const box = el(document, 'section', 'sp-notice');
    box.append(el(document, 'h1', null, title), el(document, 'p', null, body));
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
    viewer.renderConversationMessages({ conversation: { messages: snapshot.messages }, contentContainer: list, emptyHTML: '' });
    if (missingFiles > 0) main.appendChild(el(document, 'p', 'sp-note', text('fileGone')));
    drawFooter();
  }

  async function load() {
    main.replaceChildren(el(document, 'p', 'sp-loading', text('loading')));
    drawFooter();
    if (!code || !supabase) { drawMessage(text('notFoundTitle'), text('notFoundBody')); return; }
    let data;
    try {
      const result = await supabase.rpc('get_shared_conversation', { p_code: code });
      if (result.error) throw result.error;
      data = result.data;
    } catch {
      drawMessage(text('title'), text('failed'), load);
      return;
    }
    if (!data || !data.snapshot) { drawMessage(text('notFoundTitle'), text('notFoundBody')); return; }
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
    if (loaded) drawReady(); else drawFooter();
  });

  applyLanguage();
  await load();
  return { handled: true, code };
}
