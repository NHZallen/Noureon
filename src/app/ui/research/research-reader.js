// The report read in a window of its own over the chat (docs/superpowers/specs/2026-10-04-deep-research-design.md, §3.4): the article in a
// column; the contents as short ticks at the left edge (hover for the list, click to jump); the citations as grey circles that show their
// sources on hover; a panel at the right with the sources and what the research did; the download menu. On a phone the contents, the
// download and the activity are three floating buttons.

import { formatResearchTime, researchText } from '../../runtime/research/research-texts.js';
import { getResearch } from '../../runtime/research/research-store.js';
import { fillSourceList } from '../citations/source-list.js';
import { knownSiteName } from '../citations/site-names.js';
import { siteIcon, hostOf } from '../sandbox/run-sources.js';
import { getFileMarkdownRenderer } from '../files/file-markdown-cards.js';
import { copyReport, exportWithNotice } from './research-export.js';
import { numbersOf, renderReport } from './research-render.js';

const ICONS = {
  close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  panel: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>',
  list: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  activity: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
};

const make = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (document, className, label, icon) => {
  const node = make(document, 'button', className);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.title = label;
  node.innerHTML = icon;
  return node;
};

let open = null;

export const closeResearchReader = () => open?.close();

/** What one line of the activity list says, or null when it is not shown. */
export function activityLine(entry, language) {
  const t = (key, values) => researchText(language, key, values);
  switch (entry?.type) {
    case 'plan': return { kind: 'title', text: entry.text };
    case 'item': return { kind: 'title', text: entry.text };
    case 'searching': return { kind: 'chip', text: entry.text };
    case 'narration': return { kind: 'text', text: entry.text };
    case 'section': return { kind: 'text', text: entry.text };
    case 'steer': return { kind: 'title', text: `${t('steer')}: ${entry.text}` };
    case 'paused': return { kind: 'text', text: t('paused') };
    case 'resumed': return { kind: 'text', text: t('resume') };
    default: return null;
  }
}

/** Opens the reader of the research whose message is `messageId`. Returns { close } (the open one when it is already open). */
export function openResearchReader({ messageId, getLanguage, showNotification = () => {}, document = globalThis.document }) {
  const entry = getResearch(messageId);
  const report = entry?.report;
  if (!report) return null;
  if (open && open.messageId === messageId) return open;
  closeResearchReader();
  const language = getLanguage();
  const t = (key, values) => researchText(language, key, values);
  const win = document.defaultView;
  const opener = document.activeElement;

  const root = make(document, 'div', 'rr');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', report.title || '');

  const closeButton = button(document, 'rr-btn rr-close', t('close'), ICONS.close);
  const scroller = make(document, 'main', 'rr-scroll');
  // The class of a chat reply: the charts and the tables of the report are drawn by the styles of a reply.
  const article = make(document, 'article', 'rr-article model-message');
  const { element: body, headings } = renderReport({ markdown: report.text || '', renderer: getFileMarkdownRenderer(), sources: report.sources || [], document });
  article.append(body);
  scroller.append(article);

  // ----- the contents: ticks at the edge with a card on hover (a list in a sheet on a phone)
  const tocEntries = headings.filter((heading) => heading.level > 1);
  const ticks = make(document, 'nav', 'rr-ticks');
  ticks.setAttribute('aria-label', t('toc'));
  const tocCard = make(document, 'div', 'rr-toc-card');
  const tocList = make(document, 'ul', 'rr-toc-list');
  const rowsById = new Map();
  const jump = (id) => {
    const target = article.querySelector(`[id="${id}"]`);
    if (!target) return;
    scroller.scrollTo({ top: target.offsetTop - 24, behavior: 'smooth' });
    root.classList.remove('rr-toc-open');
  };
  for (const heading of tocEntries) {
    const tick = make(document, 'span', `rr-tick rr-tick-${heading.level}`);
    tick.dataset.id = heading.id;
    ticks.append(tick);
    const row = make(document, 'li', `rr-toc-row rr-toc-${heading.level}`);
    const link = make(document, 'button', 'rr-toc-link', heading.text);
    link.type = 'button';
    link.addEventListener('click', () => jump(heading.id));
    row.append(link);
    tocList.append(row);
    rowsById.set(heading.id, { tick, row });
  }
  tocCard.append(tocList);
  if (tocEntries.length > 1) ticks.append(tocCard);
  else ticks.hidden = true;

  const markCurrent = () => {
    let current = tocEntries[0]?.id;
    for (const heading of tocEntries) {
      const node = article.querySelector(`[id="${heading.id}"]`);
      if (node && node.offsetTop - scroller.scrollTop < 140) current = heading.id;
    }
    for (const [id, { tick, row }] of rowsById) {
      tick.classList.toggle('is-current', id === current);
      row.classList.toggle('is-current', id === current);
    }
  };
  scroller.addEventListener('scroll', markCurrent, { passive: true });

  // ----- the panel: sources, and what the research did
  const panel = make(document, 'aside', 'rr-panel');
  const panelHead = make(document, 'div', 'rr-panel-head');
  const tabs = make(document, 'div', 'rr-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabSources = make(document, 'button', 'rr-tab is-active', t('sources'));
  const tabActivity = make(document, 'button', 'rr-tab', t('activity'));
  for (const tab of [tabSources, tabActivity]) {
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
  }
  tabs.append(tabSources, tabActivity);
  const panelClose = button(document, 'rr-btn rr-panel-close', t('close'), ICONS.close);
  panelHead.append(tabs, panelClose);
  const panelBody = make(document, 'div', 'rr-panel-body');
  panel.append(panelHead, panelBody);

  const showSources = () => {
    panelBody.replaceChildren();
    panelBody.append(make(document, 'div', 'rr-panel-title', t('sourcesCount', { n: (report.sources || []).length })));
    const list = make(document, 'div', 'rr-source-list');
    fillSourceList(list, report.sources || [], { language, detailed: true });
    panelBody.append(list);
    tabSources.classList.add('is-active');
    tabActivity.classList.remove('is-active');
  };
  const showActivity = () => {
    panelBody.replaceChildren();
    panelBody.append(make(document, 'div', 'rr-panel-title', t('activityTitle')));
    const log = make(document, 'div', 'rr-activity');
    for (const item of getResearch(messageId)?.activity || report.activity || []) {
      const line = activityLine(item, language);
      if (!line) continue;
      log.append(make(document, 'div', `rr-act rr-act-${line.kind}`, line.text));
    }
    log.append(make(document, 'div', 'rr-act rr-act-title', t('workedFor', { t: formatResearchTime(report.stats?.ms) })));
    log.append(make(document, 'div', 'rr-act rr-act-text', t('finished')));
    log.append(make(document, 'div', 'rr-act rr-act-text', t('reportMade')));
    panelBody.append(log);
    tabActivity.classList.add('is-active');
    tabSources.classList.remove('is-active');
  };
  tabSources.addEventListener('click', showSources);
  tabActivity.addEventListener('click', showActivity);
  const setPanel = (visible, which = null) => {
    root.classList.toggle('rr-panel-open', visible);
    if (visible) (which === 'activity' ? showActivity : showSources)();
  };
  panelClose.addEventListener('click', () => setPanel(false));

  // ----- the download menu
  const menu = make(document, 'div', 'rr-menu');
  menu.hidden = true;
  const addMenuItem = (label, run, kind = null) => {
    const item = make(document, 'button', 'rr-menu-item', label);
    item.type = 'button';
    item.dataset.label = label;
    if (kind) item.dataset.kind = kind;
    item.addEventListener('click', async () => {
      if (busy) return;
      if (!kind) menu.hidden = true;
      await run();
    });
    menu.append(item);
  };
  let busy = null;
  const setBusy = (kind) => {
    busy = kind;
    menu.querySelectorAll('.rr-menu-item').forEach((item) => {
      item.disabled = Boolean(kind);
      item.textContent = kind && item.dataset.kind === kind ? t('preparing') : item.dataset.label;
    });
    if (!kind) menu.hidden = true;
  };
  addMenuItem(t('copy'), async () => showNotification(await copyReport(report, language) ? t('copied') : t('actionFailed'), 'success'));
  for (const [kind, key] of [['md', 'exportMarkdown'], ['docx', 'exportWord'], ['pdf', 'exportPdf']]) {
    addMenuItem(t(key), () => exportWithNotice(kind, report, { language, document, showNotification, onBusy: setBusy }), kind);
  }
  const downloadButton = button(document, 'rr-btn rr-download', t('download'), ICONS.download);
  downloadButton.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  const panelButton = button(document, 'rr-btn rr-panel-toggle', t('activity'), ICONS.panel);
  panelButton.addEventListener('click', () => setPanel(!root.classList.contains('rr-panel-open')));
  const top = make(document, 'div', 'rr-top');
  top.append(downloadButton, panelButton, menu);

  // ----- the three buttons of a phone
  const fab = make(document, 'div', 'rr-fab');
  const fabToc = button(document, 'rr-fab-btn', t('toc'), ICONS.list);
  const fabDownload = button(document, 'rr-fab-btn', t('download'), ICONS.download);
  const fabActivity = button(document, 'rr-fab-btn', t('activity'), ICONS.activity);
  fabToc.addEventListener('click', () => root.classList.toggle('rr-toc-open'));
  fabDownload.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  fabActivity.addEventListener('click', () => setPanel(true, 'sources'));
  if (tocEntries.length < 2) fabToc.hidden = true;
  fab.append(fabToc, fabDownload, fabActivity);
  const tocSheet = make(document, 'div', 'rr-toc-sheet');
  tocSheet.append(make(document, 'div', 'rr-toc-sheet-title', t('toc')), tocList.cloneNode(true));
  tocSheet.querySelectorAll('.rr-toc-link').forEach((link, index) => link.addEventListener('click', () => jump(tocEntries[index].id)));

  // ----- a citation's card: the site, the title and the start of the page; arrows when one mark stands for several sources
  const pop = make(document, 'div', 'rr-pop');
  pop.hidden = true;
  let popTimer = null;
  const sourceOf = (n) => (report.sources || []).find((source) => Number(source.n) === Number(n));
  const showPop = (mark) => {
    const numbers = numbersOf(`[${String(mark.dataset.cite || '').split(',').join('][')}]`);
    const group = numbers.map(sourceOf).filter(Boolean);
    if (!group.length) return;
    let index = 0;
    const draw = () => {
      const source = group[index];
      const host = source.site || hostOf(source.url);
      pop.replaceChildren();
      const head = make(document, 'div', 'rr-pop-head');
      head.append(siteIcon(document, host, 'rr-pop-icon run-source-icon'), make(document, 'span', 'rr-pop-site', knownSiteName(host) || host));
      if (group.length > 1) {
        const nav = make(document, 'span', 'rr-pop-nav');
        const prev = button(document, 'rr-pop-arrow', t('prevSource'), ICONS.prev);
        const next = button(document, 'rr-pop-arrow', t('nextSource'), ICONS.next);
        prev.addEventListener('click', (event) => { event.stopPropagation(); index = (index + group.length - 1) % group.length; draw(); });
        next.addEventListener('click', (event) => { event.stopPropagation(); index = (index + 1) % group.length; draw(); });
        nav.append(prev, make(document, 'span', 'rr-pop-count', `${index + 1}/${group.length}`), next);
        head.append(nav);
      }
      const link = make(document, 'a', 'rr-pop-link');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = t('openSource');
      link.append(make(document, 'div', 'rr-pop-title', source.title || host));
      if (source.snippet) link.append(make(document, 'div', 'rr-pop-snippet', source.snippet));
      pop.append(head, link);
    };
    draw();
    pop.hidden = false;
    const rect = mark.getBoundingClientRect();
    const width = Math.min(340, win.innerWidth - 24);
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.max(12, Math.min(win.innerWidth - width - 12, rect.left - 20))}px`;
    const below = rect.bottom + 8;
    pop.style.top = `${below + pop.offsetHeight + 12 > win.innerHeight ? Math.max(12, rect.top - pop.offsetHeight - 8) : below}px`;
  };
  const hidePop = () => {
    clearTimeout(popTimer);
    popTimer = setTimeout(() => { pop.hidden = true; }, 160);
  };
  const keepPop = () => clearTimeout(popTimer);
  article.addEventListener('mouseover', (event) => {
    const mark = event.target.closest('.rr-cite');
    if (!mark) return;
    keepPop();
    showPop(mark);
  });
  article.addEventListener('mouseout', (event) => { if (event.target.closest('.rr-cite')) hidePop(); });
  article.addEventListener('click', (event) => {
    const mark = event.target.closest('.rr-cite');
    if (mark) {
      keepPop();
      showPop(mark);
    }
  });
  article.addEventListener('focusin', (event) => { const mark = event.target.closest?.('.rr-cite'); if (mark) showPop(mark); });
  pop.addEventListener('mouseenter', keepPop);
  pop.addEventListener('mouseleave', hidePop);

  root.append(closeButton, top, ticks, scroller, panel, tocSheet, fab, pop);
  document.body.append(root);
  document.documentElement.classList.add('rr-reading');

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    win.removeEventListener('keydown', onKey, true);
    win.removeEventListener('click', onDocumentClick, true);
    root.remove();
    document.documentElement.classList.remove('rr-reading');
    open = null;
    opener?.focus?.();
  };
  // An event that reaches the handler twice (a capture listener on the target itself, in some engines) is taken once.
  let lastKey = null;
  function onKey(event) {
    if (event.key !== 'Escape' || event === lastKey) return;
    lastKey = event;
    event.preventDefault();
    event.stopPropagation();
    if (!pop.hidden) pop.hidden = true;
    else if (!menu.hidden) menu.hidden = true;
    else if (root.classList.contains('rr-toc-open')) root.classList.remove('rr-toc-open');
    else if (root.classList.contains('rr-panel-open')) setPanel(false);
    else close();
  }
  function onDocumentClick(event) {
    if (!menu.hidden && !menu.contains(event.target)) menu.hidden = true;
    if (!pop.hidden && !pop.contains(event.target) && !event.target.closest('.rr-cite')) pop.hidden = true;
    if (root.classList.contains('rr-toc-open') && !tocSheet.contains(event.target) && !fabToc.contains(event.target)) root.classList.remove('rr-toc-open');
  }
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('click', onDocumentClick, true);
  closeButton.addEventListener('click', close);
  closeButton.focus();
  markCurrent();

  open = { messageId, close, element: root };
  return open;
}
