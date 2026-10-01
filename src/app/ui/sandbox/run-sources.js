// The pages a web search found, shown in the process list as chips (the site's icon and its name), the way ChatGPT
// shows "Searched 2 sites". A chip does not link anywhere by itself: the saved markup is a string with no
// listeners, so one listener on the message list asks first and then opens the page in a new tab
// (app-bootstrap-lifecycle.js, openSourceChip below).

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';

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

const siteIcon = (document, host, className) => {
  const icon = element(document, 'span', className);
  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.src = `https://${host}/favicon.ico`;
  icon.append(image);
  return icon;
};

/**
 * The icon of the first site a search found, in front of the row's label ("Searched 4 sites"), the way ChatGPT does it.
 * The row's own icon stays under it until the site's icon has loaded (see watchSourceIcons).
 */
export function putFirstSiteIcon(document, row, sources) {
  const mark = row?.querySelector?.('.ledger-mark');
  const first = (sources || []).find((source) => source?.url);
  if (!mark || !first || mark.querySelector('.run-mark-site')) return;
  mark.append(siteIcon(document, displayHost(first), 'run-source-icon run-mark-site'));
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
 * A site's icon that loads replaces the globe under it; one that does not (many sites have no /favicon.ico) is
 * removed, leaving the globe. Image events do not bubble, so they are caught on the way down.
 */
export function watchSourceIcons(doc = document) {
  const onLoad = (event) => {
    const icon = event.target?.closest?.(ICON_BOX);
    if (icon && event.target.tagName === 'IMG' && event.target.naturalWidth > 1) icon.classList.add('is-loaded');
    else if (icon && event.target.tagName === 'IMG') event.target.remove();
  };
  const onError = (event) => {
    if (event.target?.tagName === 'IMG' && event.target.closest?.(ICON_BOX)) event.target.remove();
  };
  doc.addEventListener('load', onLoad, true);
  doc.addEventListener('error', onError, true);
  return () => {
    doc.removeEventListener('load', onLoad, true);
    doc.removeEventListener('error', onError, true);
  };
}

const TRUST_KEY = 'noureon.openSourcesWithoutAsking';

/**
 * "Don't ask again" for opening a source, kept on this device only. A browser that does not allow storage just
 * asks every time.
 */
export function createSourceTrust(win) {
  return {
    isTrusted: () => {
      try {
        return win?.localStorage?.getItem(TRUST_KEY) === '1';
      } catch {
        return false;
      }
    },
    trust: () => {
      try {
        win?.localStorage?.setItem(TRUST_KEY, '1');
      } catch {
        // The choice is just not kept.
      }
    }
  };
}

/**
 * A tap on a chip: ask before leaving, then open the page in a new tab. `confirm(message, title, { remember })` is
 * the app's own dialog; with a tick box ("don't ask again") it answers `{ accepted, remember }`. `isTrusted()` says
 * the reader chose not to be asked, and `trust()` keeps that choice. Returns whether the page was opened.
 */
export async function openSourceChip(chip, { confirm, language, open, isTrusted = () => false, trust = () => {} }) {
  const url = chip?.dataset?.url || '';
  if (!/^https?:\/\//i.test(url)) return false;
  if (!isTrusted()) {
    // The name of the site (a Gemini address is a long redirect that says nothing).
    const shown = chip.dataset.host && !url.includes(chip.dataset.host) ? chip.dataset.host : url;
    const answer = await confirm(
      sandboxText(language, 'openSourceMessage', { url: shown }),
      sandboxText(language, 'openSourceTitle'),
      { remember: sandboxText(language, 'openSourceRemember') }
    );
    const accepted = typeof answer === 'object' && answer !== null ? answer.accepted : Boolean(answer);
    if (!accepted) return false;
    if (answer?.remember) trust();
  }
  open(url, '_blank', 'noopener,noreferrer');
  return true;
}
