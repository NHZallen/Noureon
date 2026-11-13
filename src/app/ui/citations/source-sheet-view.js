// The sheet that rises from the bottom with a list of sources: from a label that cites several ("2 sources", with a
// close button) and from the "Sources" button under a reply on a phone (all of them, headed "Sources", which can be
// pulled up to nearly the whole screen). It closes with its button, a tap outside it, the Escape key or by pulling it down.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { trackPointedRow } from '../scroll/pointed-row.js';
import { fillSourceList } from './source-list.js';
import { createBottomSheet } from '../sheet/bottom-sheet.js';

/**
 * Draws the sheet (loaded by source-sheet.js when it is first asked for). `all`: the "Sources" sheet of a whole reply (otherwise the sheet of one label: its count and a close button).
 * `tabs` ([{ id, label }]) with `tab` (the one shown first) and `renderTab(id, list)` make it a sheet of several lists to switch between
 * (what a research shows: its sources and what it did), the way the panel at the side has its tabs.
 * `title` and `renderContent(list)` reuse the same draggable sheet for a custom list, such as a report's contents.
 * Returns { close, element }.
 */
export function openSourceSheetView({ document, sources, all = false, language = 'zh-TW', tabs = null, tab = null, renderTab = null, title: customTitle = null, renderContent = null, onClose = () => {} }) {
  let shownTab = tabs?.length ? (tabs.find((entry) => entry.id === tab) || tabs[0]) : null;
  const title = customTitle ?? (shownTab ? shownTab.label : all ? sandboxText(language, 'sourcesTab') : sandboxText(language, 'citeSources', { n: sources.length }));
  const grip = document.createElement('div');
  grip.className = 'source-sheet-grip';
  const head = document.createElement('div');
  head.className = 'source-sheet-head';
  const heading = document.createElement('div');
  heading.className = 'source-sheet-title';
  heading.textContent = title;
  const tabButtons = new Map();
  if (shownTab) {
    const strip = document.createElement('div');
    strip.className = 'history-tabs';
    strip.setAttribute('role', 'tablist');
    for (const entry of tabs) {
      const tabButton = document.createElement('button');
      tabButton.type = 'button';
      tabButton.className = 'history-tab';
      tabButton.setAttribute('role', 'tab');
      tabButton.textContent = entry.label;
      tabButtons.set(entry.id, tabButton);
      strip.append(tabButton);
    }
    head.append(strip);
  } else head.append(heading);
  let closeButton = null;
  if (!all) {
    closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'source-sheet-close';
    closeButton.setAttribute('aria-label', sandboxText(language, 'closePanel'));
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    head.append(closeButton);
  }
  const list = document.createElement('div');
  list.className = 'source-sheet-list';
  // The card is made first, so that what a tab draws can be measured (the medium height is as tall as the list, up to a share of the screen).
  const sheet = createBottomSheet({
    document, parts: [grip, head, list], handles: [grip, head], body: list, label: shownTab ? shownTab.label : title, expandable: all, cap: all ? 0.52 : 0.62, onClose
  });
  sheet.card.classList.add('source-sheet');
  if (all) sheet.card.classList.add('is-all');
  const showTab = (entry) => {
    shownTab = entry;
    sheet.card.setAttribute('aria-label', entry.label);
    for (const [id, tabButton] of tabButtons) tabButton.setAttribute('aria-selected', String(id === entry.id));
    list.replaceChildren();
    list.scrollTop = 0;
    renderTab(entry.id, list);
    sheet.refit();
  };
  if (shownTab) {
    for (const entry of tabs) tabButtons.get(entry.id).addEventListener('click', () => showTab(entry));
    showTab(shownTab);
  } else {
    if (renderContent) renderContent(list);
    else fillSourceList(list, sources, { language });
    sheet.refit();
  }
  trackPointedRow(list, '.source-item');
  closeButton?.addEventListener('click', () => sheet.close());
  return { close: sheet.close, element: sheet.element };
}
