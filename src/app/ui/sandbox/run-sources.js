// The pages a web search found, shown in the process list as chips (the site's icon and its name), the way ChatGPT
// shows "Searched 2 sites". A chip does not link anywhere by itself: the saved markup is a string with no
// listeners, so one listener on the message list asks first and then opens the page in a new tab
// (app-bootstrap-lifecycle.js, openSourceUrl below).

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { siteIconUrl } from '../links/site-icon.js';

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return String(url || '');
  }
};

// Gemini gives a Google redirect address for each page and the page's own domain as its title: the domain is the name.
export const displayHost = (source) => {
  const host = hostOf(source?.url);
  const title = String(source?.title || '').trim().toLowerCase();
  if (host.endsWith('vertexaisearch.cloud.google.com') && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(title)) return title.replace(/^www\./, '');
  return host;
};

const element = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const siteIcon = (document, host, className) => {
  const icon = element(document, 'span', className);
  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.src = siteIconUrl(host);
  icon.append(image);
  return icon;
};

// How many sites the line's icon may try, one after the other, before the globe stays.
const MARK_CANDIDATES = 6;

/**
 * The icon of the first site a search found, in front of the row's label ("Searched 4 sites"), the way ChatGPT does it.
 * When that site has no icon the next one's is tried, and so on down the list, and the one that loads is kept (see
 * watchSourceIcons). The row's own icon stays under it until a site's icon has loaded.
 */
export function putFirstSiteIcon(document, row, sources) {
  const mark = row?.querySelector?.('.ledger-mark');
  const hosts = [...new Set((sources || []).filter((source) => source?.url).map(displayHost))].slice(0, MARK_CANDIDATES);
  if (!mark || !hosts.length) return;
  let icon = mark.querySelector('.run-mark-site');
  if (!icon) {
    icon = siteIcon(document, hosts[0], 'run-source-icon run-mark-site');
    icon.dataset.at = '0';
    mark.append(icon);
  }
  // Sites that came later are candidates too. If every site before them failed, the next one is tried now.
  icon.dataset.hosts = hosts.join(' ');
  if (!icon.querySelector('img') && !icon.classList.contains('is-loaded')) tryNextSiteIcon(icon);
}

/** Puts the next candidate's icon in the line's icon; false when there is none left. */
function tryNextSiteIcon(icon) {
  const hosts = String(icon.dataset.hosts || '').split(' ').filter(Boolean);
  const next = Number(icon.dataset.at || 0) + 1;
  if (next >= hosts.length) return false;
  icon.dataset.at = String(next);
  let image = icon.querySelector('img');
  if (!image) {
    image = icon.ownerDocument.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    icon.append(image);
  }
  image.src = siteIconUrl(hosts[next]);
  return true;
}

/** One chip per page. The icon comes from the site itself (its /favicon.ico); a globe shows until it loads. */
export function createSourceChips(document, sources) {
  const list = element(document, 'div', 'run-sources');
  for (const source of sources) {
    const host = displayHost(source);
    const chip = element(document, 'button', 'run-source-chip');
    chip.type = 'button';
    chip.dataset.url = source.url;
    chip.dataset.host = host;
    chip.title = source.title ? `${source.title}\n${source.url}` : source.url;
    chip.append(siteIcon(document, host, 'run-source-icon'), element(document, 'span', 'run-source-host', host));
    list.append(chip);
  }
  return list;
}

/** "Searched 2 sites". */
export const sourcesLabel = (language, count) => sandboxText(language, 'sourcesSearched', { n: count });

/** "Read 2 pages": for a message whose pages were only read (the ones the user linked), not searched for. */
export const pagesReadLabel = (language, count) => sandboxText(language, 'sourcesRead', { n: count });

/**
 * The sites a reply looked at, once each: what a search found and what was read in full are one list, since to the person
 * both are "a site that was consulted". A page that was found and then read is one entry (marked `read`).
 */
export function mergeSources(...lists) {
  const merged = new Map();
  for (const source of lists.flat()) {
    if (!source?.url) continue;
    const known = merged.get(source.url);
    if (known) {
      if (source.read && !known.read) merged.set(source.url, { ...known, read: true });
    } else {
      merged.set(source.url, source);
    }
  }
  return [...merged.values()];
}

/** The one row's label: "Searched 4 sites", or "Read 2 pages" when nothing was searched for (only linked pages were read). */
export const sourcesRowLabel = (language, sources) => (sources.some((source) => !source?.read)
  ? sourcesLabel(language, sources.length)
  : pagesReadLabel(language, sources.length));

const ICON_BOX = '.run-source-icon, .link-chip-icon';

/**
 * A site's icon that loads replaces the globe under it; one that does not (many sites have none) is
 * removed, leaving the globe. Image events do not bubble, so they are caught on the way down.
 */
export function watchSourceIcons(doc = document) {
  // An icon that does not load (or is a one-pixel stand-in) gives its place to the next site's, when the icon has one.
  const failed = (image, icon) => {
    if (icon.dataset.hosts && tryNextSiteIcon(icon)) return;
    image.remove();
  };
  const onLoad = (event) => {
    const icon = event.target?.closest?.(ICON_BOX);
    if (icon && event.target.tagName === 'IMG' && event.target.naturalWidth > 1) icon.classList.add('is-loaded');
    else if (icon && event.target.tagName === 'IMG') failed(event.target, icon);
  };
  const onError = (event) => {
    const icon = event.target?.tagName === 'IMG' ? event.target.closest?.(ICON_BOX) : null;
    if (icon) failed(event.target, icon);
  };
  doc.addEventListener('load', onLoad, true);
  doc.addEventListener('error', onError, true);
  return () => {
    doc.removeEventListener('load', onLoad, true);
    doc.removeEventListener('error', onError, true);
  };
}

/**
 * Opens a page in a new tab, as it is: a tap on a source is what the reader asked for, so nothing is asked first. Only
 * web addresses are opened. Returns whether the page was opened.
 */
export function openSourceUrl(url, open) {
  if (!/^https?:\/\//i.test(String(url || ''))) return false;
  open(url, '_blank', 'noopener,noreferrer');
  return true;
}
