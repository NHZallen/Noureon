// The rows that list sources, in the sheet that rises from the bottom (source-sheet.js) and in the right-hand panel
// (history-sidebar-helpers.js): the site's icon and name, the page's title, its date when the search gave one and, in the
// panel, the start of its text. A row is a link, so a tap or a click opens the page in a new tab as it is.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { siteIcon } from '../sandbox/run-sources.js';
import { siteHost, siteLabel } from './citation-model.js';
import { plainMarkdown } from './plain-text.js';
import { knownSiteName, loadSiteNames } from './site-names.js';

const knownNames = { get: (host) => knownSiteName(host) };

const make = (document, tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** A date as the interface language writes it ("2026年9月28日"), or '' when it is not a date. */
export function formatSourceDate(value, language = 'zh-TW') {
  const time = Date.parse(String(value || ''));
  if (Number.isNaN(time)) return '';
  try {
    return new Date(time).toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  } catch {
    return new Date(time).toISOString().slice(0, 10);
  }
}

/** One row. `detailed` adds the start of the page's text (the panel has room for it). */
export function createSourceItem(document, source, { language = 'zh-TW', detailed = false } = {}) {
  const host = siteHost(source);
  const item = make(document, 'a', 'source-item');
  item.href = source.url;
  item.target = '_blank';
  item.rel = 'noopener noreferrer';
  item.dataset.host = host;
  if (source.n) item.dataset.n = String(source.n);
  const site = make(document, 'span', 'source-item-site');
  site.append(siteIcon(document, host, 'source-item-icon run-source-icon'), make(document, 'span', 'source-item-name', siteLabel(source, knownNames)));
  item.append(site, make(document, 'span', 'source-item-title', source.title || host));
  const date = formatSourceDate(source.date, language);
  if (date) item.append(make(document, 'span', 'source-item-date', date));
  if (detailed && source.snippet) item.append(make(document, 'span', 'source-item-snippet', plainMarkdown(source.snippet)));
  return item;
}

/** Rows for a list of sources, and the names of their sites asked for. */
export function fillSourceList(container, sources, options = {}) {
  const document = container.ownerDocument;
  container.replaceChildren(...sources.map((source) => createSourceItem(document, source, options)));
  void loadSiteNames(sources.map(siteHost));
}

export const sourcesCountText = (language, count) => sandboxText(language, 'sourcesPanelCount', { n: count });
