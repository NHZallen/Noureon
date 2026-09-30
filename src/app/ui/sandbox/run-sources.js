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
    const icon = element(document, 'span', 'run-source-icon');
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.src = `https://${host}/favicon.ico`;
    icon.append(image);
    chip.append(icon, element(document, 'span', 'run-source-host', host));
    list.append(chip);
  }
  return list;
}

/** "Searched 2 sites". */
export const sourcesLabel = (language, count) => sandboxText(language, 'sourcesSearched', { n: count });

/**
 * A site's icon that loads replaces the globe under it; one that does not (many sites have no /favicon.ico) is
 * removed, leaving the globe. Image events do not bubble, so they are caught on the way down.
 */
export function watchSourceIcons(doc = document) {
  const onLoad = (event) => {
    const icon = event.target?.closest?.('.run-source-icon');
    if (icon && event.target.tagName === 'IMG' && event.target.naturalWidth > 1) icon.classList.add('is-loaded');
    else if (icon && event.target.tagName === 'IMG') event.target.remove();
  };
  const onError = (event) => {
    if (event.target?.tagName === 'IMG' && event.target.closest?.('.run-source-icon')) event.target.remove();
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
