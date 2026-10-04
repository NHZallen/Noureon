// The report read in a window of its own over the chat (docs/superpowers/specs/2026-10-04-deep-research-design.md, §3.4): the article in a
// column; the contents as short ticks at the left edge (hover for the list, click to jump); the citations as grey circles that show their
// sources on hover; a panel at the right with the sources and what the research did; the download menu. On a phone the contents, the
// download and the sources sit in a floating toolbar.

import { formatResearchTime, researchText } from '../../runtime/research/research-texts.js';
import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { getResearch } from '../../runtime/research/research-store.js';
import { fillSourceList } from '../citations/source-list.js';
import { openSourceSheet } from '../citations/source-sheet.js';
import { trackPointedRow } from '../scroll/pointed-row.js';
import { animateDetails } from '../motion/collapse-motion.js';
import { knownSiteName } from '../citations/site-names.js';
import { siteIcon, hostOf } from '../sandbox/run-sources.js';
import { getFileMarkdownRenderer } from '../files/file-markdown-cards.js';
import { copyReport, exportWithNotice } from './research-export.js';
import { observeMessageCharts } from '../charts/chart-renderer.js';
import { activityLine, numbersOf, renderReport } from './research-render.js';

const ICONS = {
  close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  panel: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>',
  list: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M13 7h8M13 17h8"/></svg>',
  downloadCircle: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10m-4-4 4 4 4-4"/></svg>',
  activity: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
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

export { activityLine };

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
  // What scrolls fades into the page where it meets the edge, by strips laid over the edge (as the chat does, never a mask on the scroller).
  const main = make(document, 'div', 'rr-main');
  main.append(scroller, make(document, 'div', 'rr-edge rr-edge-top'), make(document, 'div', 'rr-edge rr-edge-bottom'));
  scroller.addEventListener('scroll', () => main.classList.toggle('is-scrolled', scroller.scrollTop > 6), { passive: true });
  // The charts of the report answer the pointer as the charts of a chat reply do (the chat's own observer does not reach this window).
  observeMessageCharts({ root: article });

  // ----- the contents: ticks at the edge with a card on hover (a list in a sheet on a phone)
  const tocEntries = headings.filter((heading) => heading.level > 1);
  const ticks = make(document, 'nav', 'rr-ticks');
  ticks.setAttribute('aria-label', t('toc'));
  const tocCard = make(document, 'div', 'rr-toc-card');
  const tocList = make(document, 'ul', 'rr-toc-list');
  const rowsById = new Map();
  let readerSheet = null;
  const jump = (id) => {
    const target = article.querySelector(`[id="${id}"]`);
    if (!target) return;
    scroller.scrollTo({ top: target.offsetTop - 24, behavior: 'smooth' });
    readerSheet?.close();
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

  // ----- the panel: the sources and what the research did, made as the chat makes its own (a header with tabs, the rows of sources, a
  // sheet from the bottom on a phone, the process as folding rows)
  const sources = report.sources || [];
  const said = (key, values) => sandboxText(language, key, values);
  const isPhone = () => win.innerWidth <= 860;
  const panel = make(document, 'aside', 'rr-panel');
  const panelHead = make(document, 'header', 'history-sidebar-head');
  const tabs = make(document, 'div', 'history-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabSources = make(document, 'button', 'history-tab', said('sourcesTab'));
  const tabActivity = make(document, 'button', 'history-tab', t('activity'));
  for (const tab of [tabSources, tabActivity]) {
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
  }
  tabs.append(tabSources, tabActivity);
  const panelClose = make(document, 'button', 'history-close');
  panelClose.type = 'button';
  panelClose.setAttribute('aria-label', said('closePanel'));
  panelClose.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  panelHead.append(tabs, panelClose);
  const panelBody = make(document, 'div', 'rr-panel-body');
  panel.append(panelHead, panelBody);
  trackPointedRow(panelBody, '.source-item');

  // A citation and the sources it stands for light up together (the mark of a row that is cited is the chat's own: `is-cited`).
  const lightSources = (numbers, { scroll = false } = {}) => {
    const wanted = new Set(numbers.map(Number));
    let first = null;
    panelBody.querySelectorAll('.source-item').forEach((item) => {
      const hot = wanted.has(Number(item.dataset.n));
      item.classList.toggle('is-cited', hot);
      if (hot && !first) first = item;
    });
    if (first && scroll && root.classList.contains('rr-panel-open')) {
      const box = panelBody.getBoundingClientRect();
      const row = first.getBoundingClientRect();
      if (row.top < box.top + 8 || row.bottom > box.bottom - 8) panelBody.scrollTo({ top: panelBody.scrollTop + row.top - box.top - box.height / 3, behavior: 'smooth' });
    }
  };
  const lightCitations = (number) => {
    article.querySelectorAll('.rr-cite').forEach((mark) => {
      mark.classList.toggle('is-hot', number !== null && numbersOf(`[${String(mark.dataset.cite || '').split(',').join('][')}]`).includes(Number(number)));
    });
  };

  const fillSources = (container) => {
    container.append(make(document, 'div', 'history-sources-count', said('sourcesPanelCount', { n: sources.length })));
    const list = make(document, 'div', 'rr-source-list');
    fillSourceList(list, sources, { language, detailed: true });
    container.append(list);
  };

  // What the research did, as the chat shows how a reply was made: one folding row for each thing it looked into (its searches as chips,
  // what it said as plain lines), under the time it took.
  const fillActivity = (container) => {
    container.append(make(document, 'div', 'history-sources-count', said('processedIn', { t: formatResearchTime(report.stats?.ms) })));
    const run = make(document, 'div', 'sandbox-run sandbox-run-steps rr-run');
    let body = null;
    let chips = null;
    const group = (label) => {
      const row = make(document, 'details', 'ledger-row sandbox-run-row is-done');
      row.dataset.kind = 'search';
      const head = make(document, 'summary', 'ledger-row-head is-expandable');
      head.append(make(document, 'span', 'ledger-mark run-icon'), make(document, 'span', 'ledger-label', label));
      body = make(document, 'div', 'ledger-body');
      chips = null;
      row.append(head, body);
      run.append(animateDetails(row));
    };
    const add = (node) => (body || run).append(node);
    for (const item of getResearch(messageId)?.activity || report.activity || []) {
      const line = activityLine(item, language);
      if (!line) continue;
      if (item.type === 'item') group(line.text);
      else if (line.kind === 'chip') {
        if (!chips) {
          chips = make(document, 'div', 'run-sources');
          add(chips);
        }
        const chip = make(document, 'span', 'run-source-chip');
        chip.append(make(document, 'span', 'run-source-host', line.text));
        chips.append(chip);
      } else {
        chips = null;
        add(make(document, 'div', 'sandbox-run-narration', line.text));
      }
    }
    body = null;
    run.append(make(document, 'div', 'sandbox-run-narration', t('finished')), make(document, 'div', 'sandbox-run-narration', t('reportMade')));
    container.append(run);
  };

  let panelTab = 'sources';
  const showSources = () => {
    panelTab = 'sources';
    panelBody.replaceChildren();
    fillSources(panelBody);
    tabSources.setAttribute('aria-selected', 'true');
    tabActivity.setAttribute('aria-selected', 'false');
  };
  const showActivity = () => {
    panelTab = 'activity';
    panelBody.replaceChildren();
    fillActivity(panelBody);
    tabActivity.setAttribute('aria-selected', 'true');
    tabSources.setAttribute('aria-selected', 'false');
  };
  panelBody.addEventListener('mouseover', (event) => {
    const item = event.target.closest('.source-item');
    if (item) lightCitations(item.dataset.n ?? null);
  });
  panelBody.addEventListener('mouseout', (event) => {
    if (event.target.closest('.source-item')) lightCitations(null);
  });
  tabSources.addEventListener('click', showSources);
  tabActivity.addEventListener('click', showActivity);
  const setPanel = (visible, which = null) => {
    root.classList.toggle('rr-panel-open', visible);
    if (visible) (which === 'activity' ? showActivity : showSources)();
  };
  // A phone has the chat's own sheet from the bottom (it can be pulled up and down), the others the panel at the side.
  const showPanel = (which) => {
    if (!isPhone()) {
      setPanel(true, which);
      return;
    }
    readerSheet = openSourceSheet({
      document,
      sources,
      all: true,
      language,
      tabs: [{ id: 'sources', label: said('sourcesTab') }, { id: 'activity', label: t('activity') }],
      tab: which,
      renderTab: (id, list) => (id === 'activity' ? fillActivity(list) : fillSourceList(list, sources, { language }))
    });
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
  const panelButton = button(document, 'rr-btn rr-panel-toggle', t('sources'), ICONS.panel);
  panelButton.addEventListener('click', () => (root.classList.contains('rr-panel-open') ? setPanel(false) : showPanel('sources')));
  const top = make(document, 'div', 'rr-top');
  top.append(downloadButton, panelButton);

  // ----- the bottom toolbar of a phone
  const fab = make(document, 'div', 'rr-fab');
  const fabToc = button(document, 'rr-fab-btn', t('toc'), ICONS.list);
  const fabDownload = button(document, 'rr-fab-btn', t('download'), ICONS.downloadCircle);
  const fabSources = button(document, 'rr-fab-btn', t('sources'), ICONS.activity);
  fabToc.addEventListener('click', () => {
    readerSheet = openSourceSheet({
      document,
      sources: [],
      all: true,
      language,
      title: t('toc'),
      renderContent: (container) => {
        const list = tocList.cloneNode(true);
        list.querySelectorAll('.rr-toc-link').forEach((link, index) => link.addEventListener('click', () => jump(tocEntries[index].id)));
        container.append(list);
      }
    });
  });
  fabDownload.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  fabSources.addEventListener('click', () => showPanel('sources'));
  if (tocEntries.length < 2) fabToc.hidden = true;
  fab.append(fabToc, fabDownload, fabSources);

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
  const numbersOfMark = (mark) => numbersOf(`[${String(mark.dataset.cite || '').split(',').join('][')}]`);
  article.addEventListener('mouseover', (event) => {
    const mark = event.target.closest('.rr-cite');
    if (!mark) return;
    keepPop();
    showPop(mark);
    lightSources(numbersOfMark(mark), { scroll: true });
  });
  article.addEventListener('mouseout', (event) => {
    if (!event.target.closest('.rr-cite')) return;
    hidePop();
    lightSources([]);
  });
  article.addEventListener('click', (event) => {
    const mark = event.target.closest('.rr-cite');
    if (mark) {
      keepPop();
      showPop(mark);
      // A panel that shows the activity is turned to the sources, so the one that was clicked can be seen.
      if (root.classList.contains('rr-panel-open') && panelTab !== 'sources') showSources();
      lightSources(numbersOfMark(mark), { scroll: true });
    }
  });
  article.addEventListener('focusin', (event) => { const mark = event.target.closest?.('.rr-cite'); if (mark) showPop(mark); });
  pop.addEventListener('mouseenter', keepPop);
  pop.addEventListener('mouseleave', hidePop);

  root.append(closeButton, top, ticks, main, panel, fab, menu, pop);
  document.body.append(root);
  document.documentElement.classList.add('rr-reading');

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    readerSheet?.close();
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
    // The sheet from the bottom closes itself first.
    if (event.key !== 'Escape' || event === lastKey || document.documentElement.classList.contains('source-sheet-open')) return;
    lastKey = event;
    event.preventDefault();
    event.stopPropagation();
    if (!pop.hidden) pop.hidden = true;
    else if (!menu.hidden) menu.hidden = true;
    else if (root.classList.contains('rr-panel-open')) setPanel(false);
    else close();
  }
  function onDocumentClick(event) {
    if (!menu.hidden && !menu.contains(event.target) && !downloadButton.contains(event.target) && !fabDownload.contains(event.target)) menu.hidden = true;
    if (!pop.hidden && !pop.contains(event.target) && !event.target.closest('.rr-cite')) pop.hidden = true;
  }
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('click', onDocumentClick, true);
  closeButton.addEventListener('click', close);
  closeButton.focus();
  markCurrent();

  open = { messageId, close, element: root };
  return open;
}
